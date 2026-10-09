import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { InvestmentAsset, InvestmentTransaction } from '../../types/finance';
import type { InvestmentRepository } from '../interfaces/InvestmentRepository';

export class IndexedDBInvestmentRepository implements InvestmentRepository {
  constructor(private database: FinFlowDatabase = db) {}

  /**
   * Garante que campos derivados ou computados (ex: currentValue, profit, profitability, performance)
   * não sejam gravados como fonte de verdade no banco de dados.
   */
  private sanitizeAsset(asset: InvestmentAsset): InvestmentAsset {
    const {
      id,
      ticker,
      name,
      type,
      quantity,
      averagePrice,
      currentPrice,
      previousClose,
      changePercent,
      currency,
      institution,
      autoUpdate,
      lastPriceUpdate,
      notes,
      createdAt,
    } = asset;

    return {
      id,
      ticker,
      name,
      type,
      quantity,
      averagePrice,
      currentPrice,
      previousClose,
      changePercent,
      currency,
      institution,
      autoUpdate,
      lastPriceUpdate,
      notes,
      createdAt,
    };
  }

  // =========================================================================
  // Ativos (Investment Assets)
  // =========================================================================

  async getAllAssets(includeDeleted = false): Promise<InvestmentAsset[]> {
    const items = await this.database.investments.toArray();
    if (includeDeleted) return items;
    return items.filter(a => !(a as any).deleted);
  }

  async getAssetById(id: string, includeDeleted = false): Promise<InvestmentAsset | null> {
    const asset = await this.database.investments.get(id);
    if (!asset) return null;
    if (!includeDeleted && (asset as any).deleted) return null;
    return asset;
  }

  async saveAsset(asset: InvestmentAsset): Promise<void> {
    const cleanAsset = this.sanitizeAsset(asset);
    await this.database.investments.put(cleanAsset);
  }

  async saveAssetsBatch(assets: InvestmentAsset[]): Promise<void> {
    if (assets.length === 0) return;
    const cleanAssets = assets.map(a => this.sanitizeAsset(a));
    await this.database.investments.bulkPut(cleanAssets);
  }

  async deleteAsset(id: string): Promise<void> {
    // Soft delete atômico por padrão para preservar integridade e histórico do ledger
    await this.database.transaction(
      'rw',
      [this.database.investments, this.database.investmentTransactions],
      async () => {
        const existing = await this.database.investments.get(id);
        const now = new Date().toISOString();
        if (existing) {
          await this.database.investments.put({
            ...existing,
            deleted: true,
            deletedAt: now,
          } as any);
        } else {
          await this.database.investments.delete(id);
        }

        // Tombstone / soft delete de transações vinculadas para consultas ativas de UI,
        // mas preservando o ledger intacto no IndexedDB para auditoria contábil
        const txs = await this.database.investmentTransactions.where('assetId').equals(id).toArray();
        if (txs.length > 0) {
          const tombstonedTxs = txs.map(t => ({
            ...t,
            deleted: true,
            deletedAt: now,
          }));
          await this.database.investmentTransactions.bulkPut(tombstonedTxs as any);
        }
      }
    );
  }

  async replaceAssets(assets: InvestmentAsset[]): Promise<void> {
    const cleanAssets = assets.map(a => this.sanitizeAsset(a));
    await this.database.transaction('rw', this.database.investments, async () => {
      await this.database.investments.clear();
      if (cleanAssets.length > 0) {
        await this.database.investments.bulkPut(cleanAssets);
      }
    });
  }

  // =========================================================================
  // Ledger de Transações de Investimento (Buy / Sell / Dividend)
  // =========================================================================

  async getAllTransactions(includeDeleted = false): Promise<InvestmentTransaction[]> {
    const txs = await this.database.investmentTransactions.toArray();
    const filtered = includeDeleted ? txs : txs.filter(t => !(t as any).deleted);
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getTransactionById(id: string, includeDeleted = false): Promise<InvestmentTransaction | null> {
    const tx = await this.database.investmentTransactions.get(id);
    if (!tx) return null;
    if (!includeDeleted && (tx as any).deleted) return null;
    return tx;
  }

  async getTransactionsByAssetId(assetId: string, includeDeleted = false): Promise<InvestmentTransaction[]> {
    const txs = await this.database.investmentTransactions
      .where('assetId')
      .equals(assetId)
      .toArray();

    const filtered = includeDeleted ? txs : txs.filter(t => !(t as any).deleted);
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveTransaction(tx: InvestmentTransaction): Promise<void> {
    await this.database.investmentTransactions.put(tx);
  }

  async saveTransactionsBatch(txs: InvestmentTransaction[]): Promise<void> {
    if (txs.length === 0) return;
    await this.database.investmentTransactions.bulkPut(txs);
  }

  async deleteTransaction(id: string): Promise<void> {
    // Ledger imutável: preserva o histórico através de tombstone contábil (soft delete)
    const existing = await this.database.investmentTransactions.get(id);
    if (existing) {
      await this.database.investmentTransactions.put({
        ...existing,
        deleted: true,
        deletedAt: new Date().toISOString(),
      } as any);
    } else {
      await this.database.investmentTransactions.delete(id);
    }
  }

  async replaceTransactions(txs: InvestmentTransaction[]): Promise<void> {
    await this.database.transaction('rw', this.database.investmentTransactions, async () => {
      await this.database.investmentTransactions.clear();
      if (txs.length > 0) {
        await this.database.investmentTransactions.bulkPut(txs);
      }
    });
  }

  // =========================================================================
  // Operações Globais
  // =========================================================================

  async clearAll(): Promise<void> {
    await this.database.transaction(
      'rw',
      [this.database.investments, this.database.investmentTransactions],
      async () => {
        await this.database.investments.clear();
        await this.database.investmentTransactions.clear();
      }
    );
  }
}
