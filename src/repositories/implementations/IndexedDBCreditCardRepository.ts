import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { CreditCard } from '../../types/finance';
import type { CreditCardRepository } from '../interfaces/CreditCardRepository';

export class IndexedDBCreditCardRepository implements CreditCardRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(includeDeleted = false): Promise<CreditCard[]> {
    const items = await this.database.creditCards.toArray();
    if (includeDeleted) return items;
    return items.filter(c => !(c as any).deleted);
  }

  async getById(id: string, includeDeleted = false): Promise<CreditCard | null> {
    const item = await this.database.creditCards.get(id);
    if (!item) return null;
    if (!includeDeleted && (item as any).deleted) return null;
    return item;
  }

  async save(item: CreditCard): Promise<void> {
    await this.database.creditCards.put(item);
  }

  async saveBatch(items: CreditCard[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.creditCards.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    // Soft delete por padrão para preservar integridade referencial
    const existing = await this.database.creditCards.get(id);
    if (existing) {
      await this.database.creditCards.put({
        ...existing,
        deleted: true,
        deletedAt: new Date().toISOString(),
      } as any);
    } else {
      await this.database.creditCards.delete(id);
    }
  }

  async replaceAll(items: CreditCard[]): Promise<void> {
    await this.database.transaction('rw', this.database.creditCards, async () => {
      await this.database.creditCards.clear();
      if (items.length > 0) {
        await this.database.creditCards.bulkPut(items);
      }
    });
  }

  async clear(): Promise<void> {
    await this.database.creditCards.clear();
  }

  async count(includeDeleted = false): Promise<number> {
    const items = await this.database.creditCards.toArray();
    if (includeDeleted) return items.length;
    return items.filter(c => !(c as any).deleted).length;
  }

  async saveInvoiceSnapshot(id: string, invoiceSnapshot: number): Promise<void> {
    await this.database.creditCards.update(id, { currentInvoice: invoiceSnapshot });
  }
}
