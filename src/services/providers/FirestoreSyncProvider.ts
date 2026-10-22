import type { Firestore } from 'firebase/firestore';
import { loadFirebase } from '../../firebaseLoader';
import type { SyncEntityName, SyncQueueItem, TombstoneMetadata } from '../syncTypes';
import type { CloudSyncProvider, CloudSyncResult, CloudPullOptions } from './CloudSyncProvider';

/**
 * Remove valores undefined de objetos recursivamente para evitar erros de validação do Firestore.
 */
function sanitizePayload(obj: unknown, isRoot = true): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (isRoot && key === 'id') continue;
    if (val !== undefined) {
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        clean[key] = sanitizePayload(val, false);
      } else {
        clean[key] = val;
      }
    }
  }
  return clean;
}

/**
 * Avalia se um erro retornado pelo Firestore SDK é elegível para retry automático
 * (problemas de rede, indisponibilidade temporária, timeout).
 */
function isFirestoreRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const errObj = error as { code?: string; message?: string };
  const code = errObj.code || '';
  const message = (errObj.message || '').toLowerCase();

  if (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    code === 'aborted' ||
    code === 'cancelled'
  ) {
    return true;
  }

  if (
    message.includes('offline') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('connection')
  ) {
    return true;
  }

  // Erros de permissão, argumento inválido ou não autenticado têm tratamento específico
  return false;
}

/**
 * Provedor Real de Sincronização Cloud com Google Firestore.
 * - Persiste documentos no caminho: users/{uid}/{entityName}/{entityId}
 * - Utiliza setDoc / updateDoc do Firebase Firestore SDK
 * - Gerencia serverRevision real baseado na revisão da mutação
 * - Executa pull com suporte a filtros de timestamp e revisão
 * - Implementa soft-delete utilizando metadados de tombstone ({ deleted: true, deletedAt, tombstoneRevision })
 */
export class FirestoreSyncProvider implements CloudSyncProvider {
  readonly name = 'FirestoreSyncProvider';

  constructor(
    private userId?: string,
    private firestore?: Firestore
  ) {}

  private async getFirestore(): Promise<Firestore> {
    if (this.firestore) return this.firestore;
    const { db } = await loadFirebase();
    this.firestore = db;
    return this.firestore;
  }

  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  /**
   * Envia uma mutação para a nuvem Firestore.
   * Path: users/{uid}/{entityName}/{entityId}
   */
  async push(item: SyncQueueItem<unknown>): Promise<CloudSyncResult<unknown>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'Usuário não autenticado no Firestore',
        isRetryable: true,
      };
    }

    try {
      const [firestore, { doc, setDoc, updateDoc }] = await Promise.all([
        this.getFirestore(),
        import('firebase/firestore'),
      ]);

      const docRef = doc(firestore, 'users', this.userId, item.entityName, item.entityId);
      const cleanData = sanitizePayload(item.payload || {}) as Record<string, unknown>;

      const payloadUpdatedAt =
        item.payload && typeof item.payload === 'object' && 'updatedAt' in item.payload && typeof (item.payload as { updatedAt?: unknown }).updatedAt === 'string'
          ? (item.payload as { updatedAt: string }).updatedAt
          : undefined;

      // Anexa metadados de sincronização e revisão ao payload remoto
      const payloadToPersist = {
        ...cleanData,
        userId: this.userId,
        revision: item.revision,
        updatedAt: payloadUpdatedAt || new Date().toISOString(),
      };

      if (item.action === 'create') {
        // Na criação, usa setDoc com merge false para garantir estado limpo
        await setDoc(docRef, payloadToPersist);
      } else if (item.action === 'update') {
        // Na atualização, tenta updateDoc; se não existir, fallback para setDoc merge
        try {
          await updateDoc(docRef, payloadToPersist);
        } catch (updateErr: unknown) {
          const code = (typeof updateErr === 'object' && updateErr !== null && 'code' in updateErr)
            ? (updateErr as { code?: string }).code
            : undefined;
          if (code === 'not-found') {
            await setDoc(docRef, payloadToPersist, { merge: true });
          } else {
            throw updateErr;
          }
        }
      }

      return {
        success: true,
        data: item.payload,
        serverRevision: item.revision,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errMsg,
        isRetryable: isFirestoreRetryableError(err),
      };
    }
  }

  /**
   * Baixa alterações remotas de uma coleção no Firestore.
   * Respeita sinceTimestamp e sinceRevision caso informados.
   */
  async pull<T>(entityName: SyncEntityName, options?: CloudPullOptions): Promise<T[]> {
    if (!this.userId) {
      return [];
    }

    try {
      const [firestore, { collection, query, where, getDocs }] = await Promise.all([
        this.getFirestore(),
        import('firebase/firestore'),
      ]);

      const colRef = collection(firestore, 'users', this.userId, entityName);
      let q = query(colRef);

      if (options?.sinceRevision !== undefined && options.sinceRevision > 0) {
        q = query(colRef, where('revision', '>', options.sinceRevision));
      }

      const snapshot = await getDocs(q);
      const results: T[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const item = { id: docSnap.id, ...data } as unknown as T;

        // Se houver filtro por timestamp, filtra em memória caso campos de data variem
        if (options?.sinceTimestamp) {
          const itemTime =
            data.updatedAt ? new Date(data.updatedAt).getTime() :
            data.timestamp ? Number(data.timestamp) :
            data.createdAt ? new Date(data.createdAt).getTime() : 0;

          if (itemTime > 0 && itemTime < options.sinceTimestamp) {
            continue;
          }
        }

        results.push(item);
      }

      return results;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[FirestoreSyncProvider] Erro ao executar pull de ${entityName}:`, errMsg);
      return [];
    }
  }

  /**
   * Exclui logicamente um documento na nuvem usando Soft Delete / Tombstone.
   * Não executa remoção física imediata.
   * Grava: { deleted: true, deletedAt, tombstoneRevision }
   */
  async delete(
    entityName: SyncEntityName,
    entityId: string,
    tombstone: TombstoneMetadata
  ): Promise<CloudSyncResult> {
    if (!this.userId) {
      return {
        success: false,
        error: 'Usuário não autenticado no Firestore',
        isRetryable: true,
      };
    }

    try {
      const [firestore, { doc, updateDoc, setDoc }] = await Promise.all([
        this.getFirestore(),
        import('firebase/firestore'),
      ]);

      const docRef = doc(firestore, 'users', this.userId, entityName, entityId);
      const tombstonePayload = {
        deleted: true,
        deletedAt: tombstone.deletedAt || new Date().toISOString(),
        tombstoneRevision: tombstone.tombstoneRevision,
        ...(tombstone.reason ? { reason: tombstone.reason } : {}),
      };

      // Tenta updateDoc para registrar o tombstone; se documento não existir, usa setDoc com merge
      try {
        await updateDoc(docRef, tombstonePayload);
      } catch (err: unknown) {
        const code = (typeof err === 'object' && err !== null && 'code' in err)
          ? (err as { code?: string }).code
          : undefined;
        if (code === 'not-found') {
          await setDoc(docRef, tombstonePayload, { merge: true });
        } else {
          // Se as regras de segurança rejeitarem campos adicionais em updateDoc (ou exigirem doc completo),
          // faz fallback seguro para setDoc com merge: true
          await setDoc(docRef, tombstonePayload, { merge: true });
        }
      }

      return {
        success: true,
        serverRevision: tombstone.tombstoneRevision,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errMsg,
        isRetryable: isFirestoreRetryableError(err),
      };
    }
  }
}
