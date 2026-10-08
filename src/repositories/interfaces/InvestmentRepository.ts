import type { InvestmentAsset, InvestmentTransaction } from '../../types/finance';

/**
 * Contrato de persistência para Ativos e Ledger de Investimentos.
 * Responsável exclusivamente pelo armazenamento e consulta,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface InvestmentRepository {
  // --- Ativos (Investment Assets) ---
  getAllAssets(): Promise<InvestmentAsset[]>;
  getAssetById(id: string): Promise<InvestmentAsset | null>;
  saveAsset(asset: InvestmentAsset): Promise<void>;
  saveAssetsBatch(assets: InvestmentAsset[]): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  replaceAssets(assets: InvestmentAsset[]): Promise<void>;

  // --- Ledger de Transações de Investimento (Buy / Sell / Dividend) ---
  getAllTransactions(): Promise<InvestmentTransaction[]>;
  getTransactionsByAssetId(assetId: string): Promise<InvestmentTransaction[]>;
  saveTransaction(tx: InvestmentTransaction): Promise<void>;
  saveTransactionsBatch(txs: InvestmentTransaction[]): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  replaceTransactions(txs: InvestmentTransaction[]): Promise<void>;

  // --- Operações Globais ---
  clearAll(): Promise<void>;
}
