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

  async getAllAssets(): Promise<InvestmentAsset[]> {
    return this.database.investments.toArray();
  }

  async getAssetById(id: string): Promise<InvestmentAsset | null> {
    const asset = await this.database.investments.get(id);
    return asset ?? null;
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
    // Operação atômica em transação Dexie: remove o ativo e suas transações vinculadas no ledger
    await this.database.transaction(
      'rw',
      [this.database.investments, this.database.investmentTransactions],
      async () => {
        await this.database.investments.delete(id);
        await this.database.investmentTransactions.where('assetId').equals(id).delete();
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

  async getAllTransactions(): Promise<InvestmentTransaction[]> {
    const txs = await this.database.investmentTransactions.toArray();
    return txs.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getTransactionsByAssetId(assetId: string): Promise<InvestmentTransaction[]> {
    const txs = await this.database.investmentTransactions
      .where('assetId')
      .equals(assetId)
      .toArray();

    return txs.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveTransaction(tx: InvestmentTransaction): Promise<void> {
    await this.database.investmentTransactions.put(tx);
  }

  async saveTransactionsBatch(txs: InvestmentTransaction[]): Promise<void> {
    if (txs.length === 0) return;
    await this.database.investmentTransactions.bulkPut(txs);
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.database.investmentTransactions.delete(id);
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
