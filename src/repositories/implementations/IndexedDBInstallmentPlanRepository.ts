import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { InstallmentPlan } from '../../types/finance';
import type { InstallmentPlanRepository } from '../interfaces/InstallmentPlanRepository';

export class IndexedDBInstallmentPlanRepository implements InstallmentPlanRepository {
  constructor(private database: FinFlowDatabase = db) {}

  async getAll(includeDeleted = false): Promise<InstallmentPlan[]> {
    const items = await this.database.installmentPlans.toArray();
    if (includeDeleted) return items;
    return items.filter(p => !p.deleted);
  }

  async getById(id: string, includeDeleted = false): Promise<InstallmentPlan | null> {
    const item = await this.database.installmentPlans.get(id);
    if (!item) return null;
    if (!includeDeleted && item.deleted) return null;
    return item;
  }

  async save(item: InstallmentPlan): Promise<void> {
    await this.database.installmentPlans.put(item);
  }

  async saveBatch(items: InstallmentPlan[]): Promise<void> {
    if (items.length === 0) return;
    await this.database.installmentPlans.bulkPut(items);
  }

  async delete(id: string): Promise<void> {
    // Soft delete por padrão para preservar integridade e sincronização com a nuvem
    const existing = await this.database.installmentPlans.get(id);
    const now = new Date().toISOString();
    if (existing) {
      await this.database.installmentPlans.put({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision: (existing.tombstoneRevision || existing.revision || 1) + 1,
      });
    } else {
      await this.database.installmentPlans.put({
        id,
        description: 'Deleted Plan',
        totalAmount: 0,
        installmentAmount: 0,
        totalInstallments: 1,
        type: 'expense',
        categoryId: 'cat-outros',
        accountId: '',
        paymentMethod: 'pix',
        startDate: now.split('T')[0],
        createdAt: now,
        deleted: true,
        deletedAt: now,
        tombstoneRevision: 1,
      });
    }
  }

  async replaceAll(items: InstallmentPlan[]): Promise<void> {
    await this.database.transaction('rw', this.database.installmentPlans, async () => {
      await this.database.installmentPlans.clear();
      if (items.length > 0) {
        await this.database.installmentPlans.bulkPut(items);
      }
    });
  }

  async clear(): Promise<void> {
    await this.database.installmentPlans.clear();
  }

  async count(includeDeleted = false): Promise<number> {
    const items = await this.database.installmentPlans.toArray();
    if (includeDeleted) return items.length;
    return items.filter(p => !p.deleted).length;
  }

  async getByAccountId(accountId: string, includeDeleted = false): Promise<InstallmentPlan[]> {
    const items = await this.database.installmentPlans
      .where('accountId')
      .equals(accountId)
      .toArray();

    if (includeDeleted) return items;
    return items.filter(p => !p.deleted);
  }

  async getByCreditCardId(creditCardId: string, includeDeleted = false): Promise<InstallmentPlan[]> {
    const items = await this.database.installmentPlans
      .where('creditCardId')
      .equals(creditCardId)
      .toArray();

    if (includeDeleted) return items;
    return items.filter(p => !p.deleted);
  }
}
