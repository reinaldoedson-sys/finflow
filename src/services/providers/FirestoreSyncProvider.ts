import type { SyncEntityName, SyncQueueItem, TombstoneMetadata } from '../syncTypes';
import type { CloudSyncProvider, CloudSyncResult, CloudPullOptions } from './CloudSyncProvider';

/**
 * Adapter estrutural para sincronização com o Google Cloud Firestore.
 * Nesta etapa atua como adapter de contrato para desacoplamento e testes,
 * com pontos de extensão para conexão com o Firestore na etapa de migração do FinanceContext.
 */
export class FirestoreSyncProvider implements CloudSyncProvider {
  readonly name = 'FirestoreSyncProvider';

  constructor(
    private userId?: string
  ) {}

  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  async push<T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>> {
    if (!this.userId) {
      return {
        success: false,
        error: 'Usuário não autenticado no Firestore',
        isRetryable: true,
      };
    }

    // Ponto de integração futuro com Firestore SDK (setDoc / updateDoc)
    return {
      success: true,
      data: item.payload,
      serverRevision: item.revision,
    };
  }

  async pull<T>(_entityName: SyncEntityName, _options?: CloudPullOptions): Promise<T[]> {
    if (!this.userId) {
      return [];
    }

    // Ponto de integração futuro com Firestore SDK (getDocs / onSnapshot)
    return [];
  }

  async delete(
    _entityName: SyncEntityName,
    _entityId: string,
    _tombstone: TombstoneMetadata
  ): Promise<CloudSyncResult> {
    if (!this.userId) {
      return {
        success: false,
        error: 'Usuário não autenticado no Firestore',
        isRetryable: true,
      };
    }

    // Ponto de integração futuro com Firestore SDK (soft-delete via updateDoc com tombstone)
    return {
      success: true,
    };
  }
}
