import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { Transaction } from '../../types/finance';
import type {
  TransactionRepository,
  TransactionPagedOptions,
  TransactionPagedResult,
} from '../interfaces/TransactionRepository';

export class IndexedDBTransactionRepository implements TransactionRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(): Promise<Transaction[]> {
    const items = await this.database.transactions.toArray();
    return items.filter(t => !(t as any).deleted).sort((a, b) => b.date.localeCompare(a.date));
  }

  async getById(id: string): Promise<Transaction | null> {
    const item = await this.database.transactions.get(id);
    if (!item || (item as any).deleted) return null;
    return item;
  }

  async save(item: Transaction): Promise<void> {
    await this.database.transactions.put(item);
  }

  async saveBatch(items: Transaction[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.transactions.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    await this.database.transactions.delete(id);
  }

  async replaceAll(items: Transaction[]): Promise<void> {
    await this.database.transaction('rw', this.database.transactions, async () => {
      await this.database.transactions.clear();
      if (items.length > 0) {
        await this.database.transactions.bulkPut(items);
      }
    });
  }

  async clear(): Promise<void> {
    await this.database.transactions.clear();
  }

  async count(): Promise<number> {
    const items = await this.database.transactions.toArray();
    return items.filter(t => !(t as any).deleted).length;
  }

  async getByDateRange(startDate?: string, endDate?: string): Promise<Transaction[]> {
    let collection = this.database.transactions.toCollection();

    if (startDate && endDate) {
      collection = this.database.transactions.where('date').between(startDate, endDate, true, true);
    } else if (startDate) {
      collection = this.database.transactions.where('date').aboveOrEqual(startDate);
    } else if (endDate) {
      collection = this.database.transactions.where('date').belowOrEqual(endDate);
    }

    const items = await collection.toArray();
    return items.filter(t => !(t as any).deleted).sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return (b.id || '').localeCompare(a.id || '');
    });
  }

  async getByMonth(yearMonth: string): Promise<Transaction[]> {
    // Ano-mês no formato YYYY-MM
    const start = `${yearMonth}-01`;
    const end = `${yearMonth}-31\uffff`;
    const items = await this.database.transactions
      .where('date')
      .between(start, end, true, true)
      .toArray();

    return items.filter(t => !(t as any).deleted).sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return (b.id || '').localeCompare(a.id || '');
    });
  }

  async getByAccountId(accountId: string): Promise<Transaction[]> {
    const items = await this.database.transactions
      .where('accountId')
      .equals(accountId)
      .toArray();

    return items.filter(t => !(t as any).deleted).sort((a, b) => b.date.localeCompare(a.date));
  }

  async getByCreditCardId(creditCardId: string): Promise<Transaction[]> {
    const items = await this.database.transactions
      .where('creditCardId')
      .equals(creditCardId)
      .toArray();

    return items.filter(t => !(t as any).deleted).sort((a, b) => b.date.localeCompare(a.date));
  }

  async getPaged(options: TransactionPagedOptions = {}): Promise<TransactionPagedResult> {
    const {
      cursor,
      limit = 20,
      startDate,
      endDate,
      accountId,
      creditCardId,
      categoryId,
    } = options;

    let items: Transaction[];

    if (startDate || endDate) {
      items = await this.getByDateRange(startDate, endDate);
    } else {
      items = await this.getAll();
    }

    // Filtros complementares em memória
    if (accountId) {
      items = items.filter(tx => tx.accountId === accountId);
    }
    if (creditCardId) {
      items = items.filter(tx => tx.creditCardId === creditCardId);
    }
    if (categoryId) {
      items = items.filter(tx => tx.categoryId === categoryId);
    }

    // Ordenação determinística (date DESC, id DESC)
    items.sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      return (b.id || '').localeCompare(a.id || '');
    });

    const total = items.length;
    let startIndex = 0;

    if (cursor) {
      const cursorIndex = items.findIndex(tx => tx.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const pageSize = limit > 0 ? limit : 20;
    const pagedItems = items.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < items.length;
    const nextCursor = hasMore && pagedItems.length > 0 ? pagedItems[pagedItems.length - 1].id : undefined;

    return {
      items: pagedItems,
      nextCursor,
      hasMore,
      total,
    };
  }
}
