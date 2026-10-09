import type {
  SyncQueueItem,
  SyncActionType,
  SyncEntityName,
  TombstoneMetadata,
  SyncDependency,
  SyncMutationSource,
} from './syncTypes';
import type { SyncQueueRepository } from '../repositories/interfaces/SyncQueueRepository';

export interface EnqueueOptions<T = any> {
  operationId: string;
  correlationId?: string;
  mutationSource?: SyncMutationSource;
  entityName: SyncEntityName;
  entityId: string;
  action: SyncActionType;
  payload?: T;
  revision?: number;
  tombstone?: TombstoneMetadata;
  dependsOn?: SyncDependency[];
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
   * Operações com mutationSource === 'REMOTE' são estritamente descartadas (anti-eco).
   */
  async enqueue<T = any>(options: EnqueueOptions<T>): Promise<SyncQueueItem<T> | null> {
    const {
      operationId,
      correlationId,
      mutationSource = 'LOCAL',
      entityName,
      entityId,
      action,
      payload,
      revision = 1,
      tombstone,
      dependsOn,
      maxRetries = 5,
    } = options;

    // 1. Controle de Origem: mutações remotas NUNCA devem gerar mutações na fila (Anti-Echo)
    if (mutationSource === 'REMOTE') {
      return null;
    }

    // 2. Garantia de Idempotência: rejeita se a mesma operação já foi processada recentemente
    if (this.processedOperationIds.has(operationId)) {
      return null;
    }

    const itemId = `${entityName}_${entityId}`;

    // 3. Validação e Detecção de Dependências Circulares
    if (dependsOn && dependsOn.length > 0) {
      const allItems = await this.repository.getAll();
      this.checkCircularDependency(entityName, entityId, dependsOn, allItems);
    }

    const existingByOp = await this.repository.getByOperationId(operationId);
    if (existingByOp) {
      return existingByOp as SyncQueueItem<T>;
    }

    const existing = await this.repository.getById(itemId);
    const now = Date.now();

    // 4. Coalescência de Operações para o mesmo documento
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
          correlationId: correlationId || existing.correlationId,
          payload: { ...(existing.payload || {}), ...(payload || {}) },
          revision: Math.max(existing.revision, revision) + 1,
          dependsOn: dependsOn || existing.dependsOn,
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
          correlationId: correlationId || existing.correlationId,
          payload: { ...(existing.payload || {}), ...(payload || {}) },
          revision: Math.max(existing.revision, revision) + 1,
          dependsOn: dependsOn || existing.dependsOn,
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
          correlationId: correlationId || existing.correlationId,
          action: 'delete',
          payload: undefined,
          tombstone: tombstone || {
            deleted: true,
            deletedAt: new Date(now).toISOString(),
            tombstoneRevision: existing.revision + 1,
          },
          revision: existing.revision + 1,
          dependsOn: dependsOn || existing.dependsOn,
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
        correlationId: correlationId || existing.correlationId,
        entityName,
        entityId,
        action,
        payload,
        revision: Math.max(existing.revision, revision) + 1,
        tombstone,
        dependsOn: dependsOn || existing.dependsOn,
        timestamp: now,
        retries: 0,
        maxRetries,
      };
      await this.repository.update(replaced);
      this.processedOperationIds.add(operationId);
      return replaced;
    }

    // 5. Novo item na fila
    const newItem: SyncQueueItem<T> = {
      id: itemId,
      operationId,
      correlationId,
      mutationSource,
      entityName,
      entityId,
      action,
      payload,
      revision,
      tombstone,
      dependsOn,
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
   * Retorna os próximos itens elegíveis para processamento ordenados cronologicamente,
   * aplicando BLOQUEIO CAUSAL estrito: itens com dependências pendentes na fila não são liberados.
   */
  async getNextEligibleBatch(limit: number = 20): Promise<SyncQueueItem[]> {
    const allItems = await this.repository.getAll();
    if (allItems.length === 0) return [];

    const now = Date.now();

    // Conjunto de chaves de entidades atualmente pendentes na fila
    const pendingEntityKeys = new Set(allItems.map(i => `${i.entityName}_${i.entityId}`));

    // Filtra itens com backoff expirado E cujas dependências não estejam pendentes na fila
    const eligible: SyncQueueItem[] = [];

    for (const item of allItems) {
      // 1. Checa backoff
      if (item.nextRetryAt && item.nextRetryAt > now) {
        continue;
      }

      // 2. Checa bloqueio causal de dependências obrigatórias
      if (item.dependsOn && item.dependsOn.length > 0) {
        const isBlocked = item.dependsOn.some(dep => {
          const parentKey = `${dep.entityName}_${dep.entityId}`;
          // Bloqueado se a entidade pai ainda existe pendente na fila
          return pendingEntityKeys.has(parentKey);
        });

        if (isBlocked) {
          continue;
        }
      }

      eligible.push(item);
      if (eligible.length >= limit) {
        break;
      }
    }

    return eligible;
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

  /**
   * Validador de dependência circular utilizando DFS.
   */
  private checkCircularDependency(
    entityName: SyncEntityName,
    entityId: string,
    dependsOn: SyncDependency[],
    allItems: SyncQueueItem[]
  ): void {
    const itemId = `${entityName}_${entityId}`;

    // 1. Auto-dependência direta
    for (const dep of dependsOn) {
      if (dep.entityName === entityName && dep.entityId === entityId) {
        throw new Error(`Circular dependency detected: ${itemId} cannot depend on itself`);
      }
    }

    // 2. Dependência circular em grafo (DFS)
    const itemsMap = new Map<string, SyncQueueItem>();
    for (const item of allItems) {
      itemsMap.set(`${item.entityName}_${item.entityId}`, item);
    }

    const visited = new Set<string>();
    const stack = new Set<string>([itemId]);

    const hasCycle = (currDepKey: string): boolean => {
      if (stack.has(currDepKey)) return true;
      if (visited.has(currDepKey)) return false;

      visited.add(currDepKey);
      stack.add(currDepKey);

      const parentItem = itemsMap.get(currDepKey);
      if (parentItem?.dependsOn) {
        for (const nextDep of parentItem.dependsOn) {
          const nextKey = `${nextDep.entityName}_${nextDep.entityId}`;
          if (hasCycle(nextKey)) return true;
        }
      }

      stack.delete(currDepKey);
      return false;
    };

    for (const dep of dependsOn) {
      const depKey = `${dep.entityName}_${dep.entityId}`;
      if (hasCycle(depKey)) {
        throw new Error(`Circular dependency detected involving ${itemId} and ${depKey}`);
      }
    }
  }
}
