export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

export type SyncEntityName =
  | 'transactions'
  | 'accounts'
  | 'creditCards'
  | 'investments'
  | 'investmentTransactions'
  | 'goals'
  | 'goalMovements'
  | 'budgets';

export type SyncActionType = 'create' | 'update' | 'delete';

/**
 * Controle de origem da mutação para prevenção de eco e loops de replicação.
 */
export type SyncMutationSource = 'LOCAL' | 'REMOTE';

/**
 * Declaração de dependência causal entre entidades na fila de sincronização.
 */
export interface SyncDependency {
  entityName: SyncEntityName;
  entityId: string;
}

/**
 * Metadados de exclusão lógica (Soft Delete / Tombstone).
 * Evita remoção física imediata e impede ressuscitação indevida de dados na sincronização.
 */
export interface TombstoneMetadata {
  deleted: true;
  deletedAt: string; // ISO 8601
  tombstoneRevision: number;
  reason?: string;
}

/**
 * Item atômico da fila de sincronização com controle de idempotência e concorrência otimista.
 */
export interface SyncQueueItem<T = any> {
  /** Chave estável no formato `${entityName}_${entityId}` */
  id: string;
  /** Identificador único e idempotente da operação financeira */
  operationId: string;
  /** Identificador de correlação para rastreamento de operações compostas multi-entidade */
  correlationId?: string;
  /** Origem da mutação: operações REMOTE nunca devem gerar nova mutação na fila */
  mutationSource?: SyncMutationSource;
  /** Nome do domínio da entidade */
  entityName: SyncEntityName;
  /** ID único da entidade afetada */
  entityId: string;
  /** Tipo de mutação */
  action: SyncActionType;
  /** Carga de dados (entidade completa ou campos modificados) */
  payload?: T;
  /** Número sequencial da revisão (Optimistic Concurrency Control) */
  revision: number;
  /** Metadados de soft delete quando action === 'delete' */
  tombstone?: TombstoneMetadata;
  /** Dependências causais obrigatórias: itens filhos só despacham após a conclusão dos pais */
  dependsOn?: SyncDependency[];
  /** Timestamp epoch em ms da criação da operação */
  timestamp: number;
  /** Contador de tentativas realizadas */
  retries: number;
  /** Limite máximo de tentativas antes de sinalizar erro fatal */
  maxRetries: number;
  /** Timestamp epoch em ms para a próxima tentativa (Exponential Backoff) */
  nextRetryAt?: number;
  /** Detalhes do último erro retornado pela nuvem */
  lastError?: string;
}

/**
 * Evento emitido pelo FinancialSyncService para ouvintes (UI, logs, monitoramento).
 */
export interface SyncEvent {
  type:
    | 'status_changed'
    | 'item_enqueued'
    | 'item_synced'
    | 'sync_failed'
    | 'conflict_detected'
    | 'dependency_blocked'
    | 'circular_dependency_detected';
  status?: SyncStatus;
  item?: SyncQueueItem;
  error?: string;
  timestamp: number;
}

export type SyncEventListener = (event: SyncEvent) => void;
