import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { Budget } from '../../types/finance';
import type { BudgetRepository } from '../interfaces/BudgetRepository';

export class IndexedDBBudgetRepository implements BudgetRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(): Promise<Budget[]> {
    return this.database.budgets.toArray();
  }

  async getById(id: string): Promise<Budget | null> {
    const item = await this.database.budgets.get(id);
    return item ?? null;
  }

  async save(item: Budget): Promise<void> {
    await this.database.budgets.put(item);
  }

  async saveBatch(items: Budget[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.budgets.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    await this.database.budgets.delete(id);
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

  async count(): Promise<number> {
    return this.database.budgets.count();
  }

  async getByMonth(month: string): Promise<Budget[]> {
    return this.database.budgets.where('month').equals(month).toArray();
  }

  async getByCategoryAndMonth(categoryId: string, month: string): Promise<Budget | null> {
    const item = await this.database.budgets
      .where('month')
      .equals(month)
      .filter(b => b.categoryId === categoryId)
      .first();

    return item ?? null;
  }
}
