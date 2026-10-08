import type { SyncEntityName, SyncQueueItem, TombstoneMetadata } from '../syncTypes';

export interface CloudSyncResult<T = any> {
  success: boolean;
  data?: T;
  serverRevision?: number;
  error?: string;
  isRetryable?: boolean;
}

export interface CloudPullOptions {
  sinceTimestamp?: number;
  sinceRevision?: number;
}

/**
 * Contrato explícito para Provedores de Sincronização Cloud.
 * Abstrai Firebase Firestore, APIs HTTP ou qualquer backend de persistência remota.
 */
export interface CloudSyncProvider {
  readonly name: string;

  /** Envia uma mutação para a nuvem */
  push<T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>>;

  /** Baixa alterações remotas de uma determinada entidade */
  pull<T>(entityName: SyncEntityName, options?: CloudPullOptions): Promise<T[]>;

  /** Exclui um documento na nuvem ou aplica o soft delete / tombstone */
  delete(
    entityName: SyncEntityName,
    entityId: string,
    tombstone: TombstoneMetadata
  ): Promise<CloudSyncResult>;
}
