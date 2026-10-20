import {
  Firestore,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { db as defaultDb } from '../../firebase';
import type { SyncEntityName, SyncQueueItem, TombstoneMetadata } from '../syncTypes';
import type { CloudSyncProvider, CloudSyncResult, CloudPullOptions } from './CloudSyncProvider';

/**
 * Remove valores undefined de objetos recursivamente para evitar erros de validação do Firestore.
 */
function sanitizePayload(obj: any, isRoot = true): any {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
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
function isFirestoreRetryableError(error: any): boolean {
  if (!error) return false;
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();

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
    private firestore: Firestore = defaultDb
  ) {}

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
  async push<T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'Usuário não autenticado no Firestore',
        isRetryable: true,
      };
    }

    try {
      const docRef = doc(this.firestore, 'users', this.userId, item.entityName, item.entityId);
      const cleanData = sanitizePayload(item.payload || {});

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
        } catch (updateErr: any) {
          if (updateErr?.code === 'not-found') {
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
    } catch (err: any) {
      const errMsg = err?.message || String(err);
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
      const colRef = collection(this.firestore, 'users', this.userId, entityName);
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
    } catch (err: any) {
      console.warn(`[FirestoreSyncProvider] Erro ao executar pull de ${entityName}:`, err?.message || err);
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
      const docRef = doc(this.firestore, 'users', this.userId, entityName, entityId);
      const tombstonePayload = {
        deleted: true,
        deletedAt: tombstone.deletedAt || new Date().toISOString(),
        tombstoneRevision: tombstone.tombstoneRevision,
        ...(tombstone.reason ? { reason: tombstone.reason } : {}),
      };

      // Tenta updateDoc para registrar o tombstone; se documento não existir, usa setDoc com merge
      try {
        await updateDoc(docRef, tombstonePayload);
      } catch (err: any) {
        if (err?.code === 'not-found') {
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
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      return {
        success: false,
        error: errMsg,
        isRetryable: isFirestoreRetryableError(err),
      };
    }
  }
}
