import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { CreditCard } from '../../types/finance';
import type { CreditCardRepository } from '../interfaces/CreditCardRepository';

export class IndexedDBCreditCardRepository implements CreditCardRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(): Promise<CreditCard[]> {
    return this.database.creditCards.toArray();
  }

  async getById(id: string): Promise<CreditCard | null> {
    const item = await this.database.creditCards.get(id);
    return item ?? null;
  }

  async save(item: CreditCard): Promise<void> {
    await this.database.creditCards.put(item);
  }

  async saveBatch(items: CreditCard[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.creditCards.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    await this.database.creditCards.delete(id);
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

  async count(): Promise<number> {
    return this.database.creditCards.count();
  }

  async saveInvoiceSnapshot(id: string, invoiceSnapshot: number): Promise<void> {
    await this.database.creditCards.update(id, { currentInvoice: invoiceSnapshot });
  }
}
