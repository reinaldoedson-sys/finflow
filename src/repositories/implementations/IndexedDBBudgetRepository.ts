import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { Budget } from '../../types/finance';
import type { BudgetRepository } from '../interfaces/BudgetRepository';

export class IndexedDBBudgetRepository implements BudgetRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(includeDeleted = false): Promise<Budget[]> {
    const items = await this.database.budgets.toArray();
    if (includeDeleted) return items;
    return items.filter(b => !b.deleted);
  }

  async getById(id: string, includeDeleted = false): Promise<Budget | null> {
    const item = await this.database.budgets.get(id);
    if (!item) return null;
    if (!includeDeleted && item.deleted) return null;
    return item;
  }

  async save(item: Budget): Promise<void> {
    await this.database.budgets.put(item);
  }

  async saveBatch(items: Budget[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.budgets.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    // Soft delete por padrão para preservar integridade e sincronização
    const existing = await this.database.budgets.get(id);
    if (existing) {
      await this.database.budgets.put({
        ...existing,
        deleted: true,
        deletedAt: new Date().toISOString(),
        tombstoneRevision: (existing.tombstoneRevision || existing.revision || 1) + 1,
      });
    } else {
      await this.database.budgets.delete(id);
    }
  }

  async replaceAll(items: Budget[]): Promise<void> {
    await this.database.transaction('rw', this.database.budgets, async () => {
      await this.database.budgets.clear();
      if (items.length > 0) {
        await this.database.budgets.bulkPut(items);
      }
    });
  }

  async clear(): Promise<void> {
    await this.database.budgets.clear();
  }

  async count(includeDeleted = false): Promise<number> {
    const items = await this.database.budgets.toArray();
    if (includeDeleted) return items.length;
    return items.filter(b => !b.deleted).length;
  }

  async getByMonth(month: string, includeDeleted = false): Promise<Budget[]> {
    const items = await this.database.budgets.where('month').equals(month).toArray();
    if (includeDeleted) return items;
    return items.filter(b => !b.deleted);
  }

  async getByCategoryAndMonth(categoryId: string, month: string, includeDeleted = false): Promise<Budget | null> {
    const item = await this.database.budgets
      .where('month')
      .equals(month)
      .filter(b => b.categoryId === categoryId)
      .first();

    if (!item) return null;
    if (!includeDeleted && item.deleted) return null;
    return item;
  }
}
