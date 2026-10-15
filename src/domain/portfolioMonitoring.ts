import { InvestmentAsset, AssetClass, InvestmentTransaction } from '../types/finance';
import { toCents, fromCents, subtractMoney } from './money';
import { calculateInvestmentCost, calculateInvestmentValue, calculateUnrealizedProfit, SupportedInvestmentCurrency } from './investments';
import { calculateInvestmentPosition } from './investmentPosition';
import { guessAssetSector } from '../services/marketQuotes';

export interface AssetClassMetrics {
  type: AssetClass;
  label: string;
  count: number;
  investedCost: number;
  currentValue: number;
  unrealizedProfit: number;
  unrealizedProfitPercent: number;
  dividends: number;
  realizedProfit: number;
  totalReturn: number;
  totalReturnPercent: number;
  allocationPercent: number; // % na carteira
}

export interface SectorMetrics {
  sector: string;
  type: AssetClass;
  count: number;
  investedCost: number;
  currentValue: number;
  unrealizedProfit: number;
  unrealizedProfitPercent: number;
  dividends: number;
  classAllocationPercent: number; // % dentro da classe (ex: % dentro das Ações)
  portfolioAllocationPercent: number; // % na carteira total
}

export interface AssetMonitoringRow {
  asset: InvestmentAsset;
  ticker: string;
  name: string;
  type: AssetClass;
  sector: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  investedCost: number;
  currentValue: number;
  unrealizedProfit: number;
  unrealizedProfitPercent: number;
  dividends: number;
  realizedProfit: number;
  totalReturn: number;
  totalReturnPercent: number;
  portfolioWeightPercent: number;
}

export interface PortfolioMonitoringSummary {
  currency: SupportedInvestmentCurrency;
  totalInvestedCost: number;      // Capital Investido
  totalCurrentValue: number;      // Capital Atual
  totalUnrealizedProfit: number;  // Lucro Não Realizado
  unrealizedProfitPercent: number;
  totalRealizedProfit: number;    // Lucro Realizado
  totalDividends: number;         // Provento Total
  totalPortfolioReturn: number;   // Retorno Total Absoluto (Não Realizado + Realizado + Proventos)
  totalPortfolioReturnPercent: number;

  classMetrics: AssetClassMetrics[];
  stockSectors: SectorMetrics[];
  fiiSegments: SectorMetrics[];
  allSectors: SectorMetrics[];
  assetRows: AssetMonitoringRow[];
}

const CLASS_LABELS: Record<AssetClass, string> = {
  stock: 'Ação',
  fii: 'FII',
  fixed_income: 'Renda Fixa',
  crypto: 'Cripto',
  bdr_etf: 'BDR / ETF',
  other: 'Outro'
};

/**
 * Calcula todas as métricas do monitor de carteira com base nos ativos e no ledger de transações.
 */
export function calculatePortfolioMonitoring(
  assets: InvestmentAsset[],
  transactions: InvestmentTransaction[],
  targetCurrency: SupportedInvestmentCurrency = 'BRL'
): PortfolioMonitoringSummary {
  // Filtra ativos pertencentes à moeda selecionada
  const currencyAssets = assets.filter(a => (a.currency || 'BRL') === targetCurrency);

  // Calcula totais da carteira
  let totalCostCents = 0;
  let totalValueCents = 0;
  let totalDividendsCents = 0;
  let totalRealizedProfitCents = 0;

  // Mapa de posições derivadas por ativo
  const derivedPositionsMap = new Map<string, ReturnType<typeof calculateInvestmentPosition>>();
  for (const asset of currencyAssets) {
    try {
      const pos = calculateInvestmentPosition(asset, transactions);
      derivedPositionsMap.set(asset.id, pos);
    } catch {
      // Fallback gracioso
    }
  }

  // Prepara as linhas de ativos
  const tempRows: Omit<AssetMonitoringRow, 'portfolioWeightPercent'>[] = [];

  for (const asset of currencyAssets) {
    const pos = derivedPositionsMap.get(asset.id);
    const quantity = asset.quantity;
    const averagePrice = asset.averagePrice;
    const currentPrice = asset.currentPrice;

    const investedCost = calculateInvestmentCost(asset);
    const currentValue = calculateInvestmentValue(asset);
    const { profitLoss: unrealizedProfit, profitLossPercent: unrealizedProfitPercent } = calculateUnrealizedProfit(asset);

    const dividends = pos ? pos.totalDividends : 0;
    const realizedProfit = pos ? pos.realizedProfitLoss : 0;

    const totalReturn = unrealizedProfit + dividends + realizedProfit;
    const totalReturnPercent = investedCost > 0 ? (totalReturn / investedCost) * 100 : 0;

    totalCostCents += toCents(investedCost);
    totalValueCents += toCents(currentValue);
    totalDividendsCents += toCents(dividends);
    totalRealizedProfitCents += toCents(realizedProfit);

    const sector = guessAssetSector(asset.ticker, asset.type, asset.sector);

    tempRows.push({
      asset,
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      sector,
      quantity,
      averagePrice,
      currentPrice,
      investedCost,
      currentValue,
      unrealizedProfit,
      unrealizedProfitPercent,
      dividends,
      realizedProfit,
      totalReturn,
      totalReturnPercent,
    });
  }

  const totalInvestedCost = fromCents(totalCostCents);
  const totalCurrentValue = fromCents(totalValueCents);
  const totalUnrealizedProfit = subtractMoney(totalCurrentValue, totalInvestedCost);
  const unrealizedProfitPercent = totalInvestedCost > 0 ? (totalUnrealizedProfit / totalInvestedCost) * 100 : 0;
  const totalDividends = fromCents(totalDividendsCents);
  const totalRealizedProfit = fromCents(totalRealizedProfitCents);

  const totalPortfolioReturn = totalUnrealizedProfit + totalDividends + totalRealizedProfit;
  const totalPortfolioReturnPercent = totalInvestedCost > 0 ? (totalPortfolioReturn / totalInvestedCost) * 100 : 0;

  // Adiciona o peso percentual na carteira para cada linha
  const assetRows: AssetMonitoringRow[] = tempRows.map(row => ({
    ...row,
    portfolioWeightPercent: totalCurrentValue > 0 ? (row.currentValue / totalCurrentValue) * 100 : 0,
  })).sort((a, b) => b.currentValue - a.currentValue);

  // Agrupamento por Classe de Ativo
  const classesList: AssetClass[] = ['stock', 'fii', 'fixed_income', 'crypto', 'bdr_etf', 'other'];
  const classMetrics: AssetClassMetrics[] = classesList.map(type => {
    const classRows = assetRows.filter(r => r.type === type);
    const count = classRows.length;
    const cost = classRows.reduce((sum, r) => sum + r.investedCost, 0);
    const val = classRows.reduce((sum, r) => sum + r.currentValue, 0);
    const unrealized = subtractMoney(val, cost);
    const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : 0;
    const divs = classRows.reduce((sum, r) => sum + r.dividends, 0);
    const realized = classRows.reduce((sum, r) => sum + r.realizedProfit, 0);
    const totReturn = unrealized + divs + realized;
    const totReturnPct = cost > 0 ? (totReturn / cost) * 100 : 0;
    const allocPct = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;

    return {
      type,
      label: CLASS_LABELS[type] || type,
      count,
      investedCost: cost,
      currentValue: val,
      unrealizedProfit: unrealized,
      unrealizedProfitPercent: unrealizedPct,
      dividends: divs,
      realizedProfit: realized,
      totalReturn: totReturn,
      totalReturnPercent: totReturnPct,
      allocationPercent: allocPct,
    };
  }).filter(c => c.count > 0 || c.investedCost > 0 || c.currentValue > 0);

  // Agrupamento de Ações por Setor
  const stockRows = assetRows.filter(r => r.type === 'stock');
  const totalStockValue = stockRows.reduce((sum, r) => sum + r.currentValue, 0);
  const stockSectorsMap = new Map<string, AssetMonitoringRow[]>();
  for (const row of stockRows) {
    const arr = stockSectorsMap.get(row.sector) || [];
    arr.push(row);
    stockSectorsMap.set(row.sector, arr);
  }

  const stockSectors: SectorMetrics[] = Array.from(stockSectorsMap.entries()).map(([sector, rows]) => {
    const cost = rows.reduce((sum, r) => sum + r.investedCost, 0);
    const val = rows.reduce((sum, r) => sum + r.currentValue, 0);
    const unrealized = subtractMoney(val, cost);
    const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : 0;
    const divs = rows.reduce((sum, r) => sum + r.dividends, 0);

    return {
      sector,
      type: 'stock' as const,
      count: rows.length,
      investedCost: cost,
      currentValue: val,
      unrealizedProfit: unrealized,
      unrealizedProfitPercent: unrealizedPct,
      dividends: divs,
      classAllocationPercent: totalStockValue > 0 ? (val / totalStockValue) * 100 : 0,
      portfolioAllocationPercent: totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0,
    };
  }).sort((a, b) => b.currentValue - a.currentValue);

  // Agrupamento de FIIs por Segmento
  const fiiRows = assetRows.filter(r => r.type === 'fii');
  const totalFiiValue = fiiRows.reduce((sum, r) => sum + r.currentValue, 0);
  const fiiSectorsMap = new Map<string, AssetMonitoringRow[]>();
  for (const row of fiiRows) {
    const arr = fiiSectorsMap.get(row.sector) || [];
    arr.push(row);
    fiiSectorsMap.set(row.sector, arr);
  }

  const fiiSegments: SectorMetrics[] = Array.from(fiiSectorsMap.entries()).map(([sector, rows]) => {
    const cost = rows.reduce((sum, r) => sum + r.investedCost, 0);
    const val = rows.reduce((sum, r) => sum + r.currentValue, 0);
    const unrealized = subtractMoney(val, cost);
    const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : 0;
    const divs = rows.reduce((sum, r) => sum + r.dividends, 0);

    return {
      sector,
      type: 'fii' as const,
      count: rows.length,
      investedCost: cost,
      currentValue: val,
      unrealizedProfit: unrealized,
      unrealizedProfitPercent: unrealizedPct,
      dividends: divs,
      classAllocationPercent: totalFiiValue > 0 ? (val / totalFiiValue) * 100 : 0,
      portfolioAllocationPercent: totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0,
    };
  }).sort((a, b) => b.currentValue - a.currentValue);

  // Todos os setores agregados
  const allSectorsMap = new Map<string, AssetMonitoringRow[]>();
  for (const row of assetRows) {
    const arr = allSectorsMap.get(row.sector) || [];
    arr.push(row);
    allSectorsMap.set(row.sector, arr);
  }

  const allSectors: SectorMetrics[] = Array.from(allSectorsMap.entries()).map(([sector, rows]) => {
    const cost = rows.reduce((sum, r) => sum + r.investedCost, 0);
    const val = rows.reduce((sum, r) => sum + r.currentValue, 0);
    const unrealized = subtractMoney(val, cost);
    const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : 0;
    const divs = rows.reduce((sum, r) => sum + r.dividends, 0);
    const firstType = rows[0]?.type || 'other';

    return {
      sector,
      type: firstType,
      count: rows.length,
      investedCost: cost,
      currentValue: val,
      unrealizedProfit: unrealized,
      unrealizedProfitPercent: unrealizedPct,
      dividends: divs,
      classAllocationPercent: totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0,
      portfolioAllocationPercent: totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0,
    };
  }).sort((a, b) => b.currentValue - a.currentValue);

  return {
    currency: targetCurrency,
    totalInvestedCost,
    totalCurrentValue,
    totalUnrealizedProfit,
    unrealizedProfitPercent,
    totalRealizedProfit,
    totalDividends,
    totalPortfolioReturn,
    totalPortfolioReturnPercent,
    classMetrics,
    stockSectors,
    fiiSegments,
    allSectors,
    assetRows,
  };
}
