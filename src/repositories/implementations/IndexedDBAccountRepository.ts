import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { Account } from '../../types/finance';
import type { AccountRepository } from '../interfaces/AccountRepository';

export class IndexedDBAccountRepository implements AccountRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(): Promise<Account[]> {
    return this.database.accounts.toArray();
  }

  async getById(id: string): Promise<Account | null> {
    const item = await this.database.accounts.get(id);
    return item ?? null;
  }

  async save(item: Account): Promise<void> {
    await this.database.accounts.put(item);
  }

  async saveBatch(items: Account[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.accounts.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    await this.database.accounts.delete(id);
  }

  async replaceAll(items: Account[]): Promise<void> {
    await this.database.transaction('rw', this.database.accounts, async () => {
      await this.database.accounts.clear();
      if (items.length > 0) {
        await this.database.accounts.bulkPut(items);
      }
    });
  }

  async clear(): Promise<void> {
    await this.database.accounts.clear();
  }

  async count(): Promise<number> {
    return this.database.accounts.count();
  }

  async getByType(type: Account['type']): Promise<Account[]> {
    return this.database.accounts.where('type').equals(type).toArray();
  }

  async saveBalanceSnapshot(id: string, balanceSnapshot: number): Promise<void> {
    await this.database.accounts.update(id, { currentBalance: balanceSnapshot });
  }
}
