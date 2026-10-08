import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { Account } from '../../types/finance';
import type { AccountRepository } from '../interfaces/AccountRepository';

export class IndexedDBAccountRepository implements AccountRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(includeDeleted = false): Promise<Account[]> {
    const items = await this.database.accounts.toArray();
    if (includeDeleted) return items;
    return items.filter(a => !(a as any).deleted);
  }

  async getById(id: string, includeDeleted = false): Promise<Account | null> {
    const item = await this.database.accounts.get(id);
    if (!item) return null;
    if (!includeDeleted && (item as any).deleted) return null;
    return item;
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

  async count(includeDeleted = false): Promise<number> {
    const items = await this.database.accounts.toArray();
    if (includeDeleted) return items.length;
    return items.filter(a => !(a as any).deleted).length;
  }

  async getByType(type: Account['type'], includeDeleted = false): Promise<Account[]> {
    const items = await this.database.accounts.where('type').equals(type).toArray();
    if (includeDeleted) return items;
    return items.filter(a => !(a as any).deleted);
  }

  async saveBalanceSnapshot(id: string, balanceSnapshot: number): Promise<void> {
    await this.database.accounts.update(id, { currentBalance: balanceSnapshot });
  }
}
