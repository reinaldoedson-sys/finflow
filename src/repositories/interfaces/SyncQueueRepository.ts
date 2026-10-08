import type { SyncQueueItem } from '../../services/syncTypes';

/**
 * Contrato de persistência para a Fila de Sincronização Local-First.
 * Garante que operações pendentes sobrevivam a encerramento de abas, recarregamentos e quedas de energia.
 */
export interface SyncQueueRepository {
  /** Insere ou substitui um item na fila de forma persistente */
  enqueue(item: SyncQueueItem): Promise<void>;

  /** Remove um item da fila após sincronização concluída com sucesso */
  dequeue(id: string): Promise<void>;

  /** Retorna o próximo lote de itens prontos para envio (ordenados por timestamp e respeitando nextRetryAt) */
  peekNextBatch(limit?: number): Promise<SyncQueueItem[]>;

  /** Retorna todos os itens pendentes na fila */
  getAll(): Promise<SyncQueueItem[]>;

  /** Busca um item pelo seu ID determinístico */
  getById(id: string): Promise<SyncQueueItem | null>;

  /** Busca um item pelo seu operationId idempotente */
  getByOperationId(operationId: string): Promise<SyncQueueItem | null>;

  /** Atualiza o estado de um item existente (ex: incremento de retries, nextRetryAt ou payload consolidado) */
  update(item: SyncQueueItem): Promise<void>;

  /** Limpa completamente a fila persistente */
  clear(): Promise<void>;

  /** Retorna a quantidade total de operações aguardando sincronização */
  count(): Promise<number>;
}
