import type { SyncQueueItem, SyncActionType, SyncEntityName, TombstoneMetadata } from './syncTypes';
import type { SyncQueueRepository } from '../repositories/interfaces/SyncQueueRepository';

export interface EnqueueOptions<T = any> {
  operationId: string;
  entityName: SyncEntityName;
  entityId: string;
  action: SyncActionType;
  payload?: T;
  revision?: number;
  tombstone?: TombstoneMetadata;
  maxRetries?: number;
}

/**
 * Gerenciador da Fila de Sincronização Local-First.
 * Implementa regras de negócio puras: coalescência, idempotência,
 * ordenação, retry e exponential backoff.
 */
export class SyncQueue {
  private processedOperationIds = new Set<string>();

  constructor(
    private repository: SyncQueueRepository,
    private baseDelayMs: number = 1000,
    private maxDelayMs: number = 30000
  ) {}

  /**
   * Enfileira uma nova operação com coalescência inteligente e garantia de idempotência.
   */
  async enqueue<T = any>(options: EnqueueOptions<T>): Promise<SyncQueueItem<T> | null> {
    const {
      operationId,
      entityName,
      entityId,
      action,
      payload,
      revision = 1,
      tombstone,
      maxRetries = 5,
    } = options;

    // 1. Garantia de Idempotência: rejeita se a mesma operação já foi processada recentemente
    if (this.processedOperationIds.has(operationId)) {
      return null;
    }

    const existingByOp = await this.repository.getByOperationId(operationId);
    if (existingByOp) {
      return existingByOp as SyncQueueItem<T>;
    }

    const itemId = `${entityName}_${entityId}`;
    const existing = await this.repository.getById(itemId);
    const now = Date.now();

    // 2. Coalescência de Operações para o mesmo documento
    if (existing) {
      // Regra A: create + delete -> descarta (item nunca foi pra nuvem)
      if (existing.action === 'create' && action === 'delete') {
        await this.repository.dequeue(existing.id);
        this.processedOperationIds.add(operationId);
        return null;
      }

      // Regra B: create + update -> mantém 'create' com payload fundido
      if (existing.action === 'create' && action === 'update') {
        const merged: SyncQueueItem<T> = {
          ...existing,
          operationId,
          payload: { ...(existing.payload || {}), ...(payload || {}) },
          revision: Math.max(existing.revision, revision) + 1,
          timestamp: now,
          retries: 0,
          nextRetryAt: undefined,
          lastError: undefined,
        };
        await this.repository.update(merged);
        this.processedOperationIds.add(operationId);
        return merged;
      }

      // Regra C: update + update -> funde payloads
      if (existing.action === 'update' && action === 'update') {
        const merged: SyncQueueItem<T> = {
          ...existing,
          operationId,
          payload: { ...(existing.payload || {}), ...(payload || {}) },
          revision: Math.max(existing.revision, revision) + 1,
          timestamp: now,
          retries: 0,
          nextRetryAt: undefined,
          lastError: undefined,
        };
        await this.repository.update(merged);
        this.processedOperationIds.add(operationId);
        return merged;
      }

      // Regra D: update + delete -> transforma em 'delete' com tombstone
      if (existing.action === 'update' && action === 'delete') {
        const deletedItem: SyncQueueItem<T> = {
          ...existing,
          operationId,
          action: 'delete',
          payload: undefined,
          tombstone: tombstone || {
            deleted: true,
            deletedAt: new Date(now).toISOString(),
            tombstoneRevision: existing.revision + 1,
          },
          revision: existing.revision + 1,
          timestamp: now,
          retries: 0,
          nextRetryAt: undefined,
          lastError: undefined,
        };
        await this.repository.update(deletedItem);
        this.processedOperationIds.add(operationId);
        return deletedItem;
      }

      // Caso padrão de substituição
      const replaced: SyncQueueItem<T> = {
        id: itemId,
        operationId,
        entityName,
        entityId,
        action,
        payload,
        revision: Math.max(existing.revision, revision) + 1,
        tombstone,
        timestamp: now,
        retries: 0,
        maxRetries,
      };
      await this.repository.update(replaced);
      this.processedOperationIds.add(operationId);
      return replaced;
    }

    // 3. Novo item na fila
    const newItem: SyncQueueItem<T> = {
      id: itemId,
      operationId,
      entityName,
      entityId,
      action,
      payload,
      revision,
      tombstone,
      timestamp: now,
      retries: 0,
      maxRetries,
    };

    await this.repository.enqueue(newItem);
    this.processedOperationIds.add(operationId);
    return newItem;
  }

  /**
   * Remove item após sucesso confirmado pela nuvem.
   */
  async dequeue(id: string): Promise<void> {
    await this.repository.dequeue(id);
  }

  /**
   * Registra falha de envio e calcula o próximo agendamento com Exponential Backoff.
   */
  async recordFailure(id: string, error: string): Promise<SyncQueueItem | null> {
    const item = await this.repository.getById(id);
    if (!item) return null;

    const newRetries = item.retries + 1;
    const backoffDelay = this.calculateBackoff(newRetries);
    const nextRetryAt = Date.now() + backoffDelay;

    const updated: SyncQueueItem = {
      ...item,
      retries: newRetries,
      nextRetryAt,
      lastError: error,
    };

    await this.repository.update(updated);
    return updated;
  }

  /**
   * Cálculo de Exponential Backoff com jitter.
   */
  calculateBackoff(retries: number): number {
    const exponential = this.baseDelayMs * Math.pow(2, retries - 1);
    const capped = Math.min(exponential, this.maxDelayMs);
    // Adiciona 10% de jitter determinístico para evitar retry stampedes
    const jitter = Math.floor(Math.random() * (capped * 0.1));
    return capped + jitter;
  }

  /**
   * Retorna os próximos itens elegíveis para processamento ordenados cronologicamente.
   */
  async getNextEligibleBatch(limit: number = 20): Promise<SyncQueueItem[]> {
    return this.repository.peekNextBatch(limit);
  }

  async getAll(): Promise<SyncQueueItem[]> {
    return this.repository.getAll();
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async clear(): Promise<void> {
    await this.repository.clear();
    this.processedOperationIds.clear();
  }
}
