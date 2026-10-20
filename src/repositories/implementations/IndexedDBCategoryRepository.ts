import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { Category } from '../../types/finance';
import type { CategoryRepository } from '../interfaces/CategoryRepository';

export class IndexedDBCategoryRepository implements CategoryRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(includeDeleted = false): Promise<Category[]> {
    const items = await this.database.categories.toArray();
    if (includeDeleted) return items;
    return items.filter(c => !c.deleted);
  }

  async getById(id: string, includeDeleted = false): Promise<Category | null> {
    const item = await this.database.categories.get(id);
    if (!item) return null;
    if (!includeDeleted && item.deleted) return null;
    return item;
  }

  async save(item: Category): Promise<void> {
    await this.database.categories.put(item);
  }

  async saveBatch(items: Category[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.categories.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    // Soft delete por padrão para preservar integridade e sincronização com a nuvem
    const existing = await this.database.categories.get(id);
    const now = new Date().toISOString();
    if (existing) {
      await this.database.categories.put({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision: (existing.tombstoneRevision || existing.revision || 1) + 1,
      });
    } else {
      await this.database.categories.put({
        id,
        name: 'Deleted Category',
        icon: 'Tag',
        color: '#94a3b8',
        type: 'both',
        deleted: true,
        deletedAt: now,
        tombstoneRevision: 1,
      });
    }
  }

  async replaceAll(items: Category[]): Promise<void> {
    await this.database.transaction('rw', this.database.categories, async () => {
      await this.database.categories.clear();
      if (items.length > 0) {
        await this.database.categories.bulkPut(items);
      }
    });
  }

  async clear(): Promise<void> {
    await this.database.categories.clear();
  }

  async count(includeDeleted = false): Promise<number> {
    const items = await this.database.categories.toArray();
    if (includeDeleted) return items.length;
    return items.filter(c => !c.deleted).length;
  }

  async getByType(type: 'expense' | 'income' | 'both', includeDeleted = false): Promise<Category[]> {
    const items = await this.database.categories
      .where('type')
      .equals(type)
      .toArray();

    if (includeDeleted) return items;
    return items.filter(c => !c.deleted);
  }
}
