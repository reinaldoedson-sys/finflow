import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { SyncQueueItem } from '../../services/syncTypes';
import type { SyncQueueRepository } from '../interfaces/SyncQueueRepository';

export class IndexedDBSyncQueueRepository implements SyncQueueRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async enqueue(item: SyncQueueItem): Promise<void> {
    await this.database.syncQueue.put(item);
  }

  async dequeue(id: string): Promise<void> {
    await this.database.syncQueue.delete(id);
  }

  async peekNextBatch(limit: number = 20): Promise<SyncQueueItem[]> {
    const now = Date.now();
    const items = await this.database.syncQueue.toArray();

    // Filtra itens cujo tempo de backoff já passou (ou que não possuem agendamento futuro)
    const eligible = items.filter(item => !item.nextRetryAt || item.nextRetryAt <= now);
    eligible.sort((a, b) => a.timestamp - b.timestamp);
    return eligible.slice(0, limit);
  }

  async getAll(): Promise<SyncQueueItem[]> {
    const items = await this.database.syncQueue.toArray();
    return items.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getById(id: string): Promise<SyncQueueItem | null> {
    const item = await this.database.syncQueue.get(id);
    return item ?? null;
  }

  async getByOperationId(operationId: string): Promise<SyncQueueItem | null> {
    const item = await this.database.syncQueue.where('operationId').equals(operationId).first();
    return item ?? null;
  }

  async update(item: SyncQueueItem): Promise<void> {
    await this.database.syncQueue.put(item);
  }

  async clear(): Promise<void> {
    await this.database.syncQueue.clear();
  }

  async count(): Promise<number> {
    return this.database.syncQueue.count();
  }
}
