import { InvestmentAsset, AssetClass } from '../types/finance';
import { toCents, fromCents, subtractMoney } from './money';

export type SupportedInvestmentCurrency = 'BRL' | 'USD';

export interface UnrealizedProfitResult {
  profitLoss: number;
  profitLossPercent: number;
}

export interface PortfolioProfitResult {
  profitLoss: number;
  profitLossPercent: number;
}

export interface DailyVariationResult {
  variationAmount: number;
  variationPercent: number;
}

export interface AssetAllocationItem {
  type: AssetClass;
  value: number;
  percent: number;
  count: number;
}

export interface CurrencyPortfolioSummary {
  currency: SupportedInvestmentCurrency;
  totalCost: number;
  totalValue: number;
  profitLoss: number;
  profitLossPercent: number;
  dailyVariationAmount: number;
  dailyVariationPercent: number;
  assetsCount: number;
}

/**
 * Retorna as moedas distintas presentes nos ativos da carteira.
 */
export function getDistinctCurrencies(assets: InvestmentAsset[]): SupportedInvestmentCurrency[] {
  const currencies = new Set<SupportedInvestmentCurrency>();
  for (const asset of assets) {
    if (asset.currency === 'USD' || asset.currency === 'BRL') {
      currencies.add(asset.currency);
    }
  }
  return Array.from(currencies);
}

/**
 * Calcula o custo total de aquisição de um ativo individual (quantidade * preço médio pago).
 * Utiliza centavos inteiros via camada monetária para evitar imperfeições de ponto flutuante.
 */
export function calculateInvestmentCost(
  asset: Pick<InvestmentAsset, 'quantity' | 'averagePrice'>
): number {
  if (!asset || typeof asset.quantity !== 'number' || typeof asset.averagePrice !== 'number') {
    return 0;
  }
  if (isNaN(asset.quantity) || isNaN(asset.averagePrice) || asset.quantity <= 0 || asset.averagePrice <= 0) {
    return 0;
  }

  const priceCents = toCents(asset.averagePrice);
  const totalCostCents = Math.round(asset.quantity * priceCents);
  return fromCents(totalCostCents);
}

/**
 * Calcula o valor atual de mercado de um ativo individual (quantidade * preço atual).
 * Utiliza centavos inteiros via camada monetária.
 */
export function calculateInvestmentValue(
  asset: Pick<InvestmentAsset, 'quantity' | 'currentPrice'>
): number {
  if (!asset || typeof asset.quantity !== 'number' || typeof asset.currentPrice !== 'number') {
    return 0;
  }
  if (isNaN(asset.quantity) || isNaN(asset.currentPrice) || asset.quantity <= 0 || asset.currentPrice <= 0) {
    return 0;
  }

  const priceCents = toCents(asset.currentPrice);
  const totalValueCents = Math.round(asset.quantity * priceCents);
  return fromCents(totalValueCents);
}

/**
 * Calcula o lucro ou prejuízo não realizado (unrealized profit/loss) de um ativo individual,
 * em valor absoluto e em percentual sobre o custo de aquisição.
 */
export function calculateUnrealizedProfit(
  asset: Pick<InvestmentAsset, 'quantity' | 'averagePrice' | 'currentPrice'>
): UnrealizedProfitResult {
  const cost = calculateInvestmentCost(asset);
  const value = calculateInvestmentValue(asset);
  const profitLoss = subtractMoney(value, cost);

  const profitLossPercent = cost > 0 ? (profitLoss / cost) * 100 : 0;

  return {
    profitLoss,
    profitLossPercent
  };
}

/**
 * Valida a compatibilidade de moedas para agregação na carteira.
 * Se targetCurrency não for informada e houver múltiplas moedas (ex: BRL e USD misturados),
 * lança um erro para impedir soma indevida de moedas diferentes sem conversão cambial.
 */
function resolvePortfolioAssets(
  assets: InvestmentAsset[],
  targetCurrency?: SupportedInvestmentCurrency
): InvestmentAsset[] {
  if (!assets || assets.length === 0) {
    return [];
  }

  if (targetCurrency) {
    return assets.filter(a => a.currency === targetCurrency);
  }

  const distinct = getDistinctCurrencies(assets);
  if (distinct.length > 1) {
    throw new Error(
      'Moedas diferentes na carteira (BRL e USD não podem ser somados diretamente). Informe a moeda desejada ou calcule por moeda separadamente.'
    );
  }

  return assets;
}

/**
 * Calcula o custo total de aquisição de uma carteira de ativos.
 * Impede que BRL e USD sejam somados diretamente sem segregação.
 */
export function calculatePortfolioCost(
  assets: InvestmentAsset[],
  targetCurrency?: SupportedInvestmentCurrency
): number {
  const resolved = resolvePortfolioAssets(assets, targetCurrency);
  if (resolved.length === 0) return 0;

  const totalCents = resolved.reduce((sum, a) => sum + toCents(calculateInvestmentCost(a)), 0);
  return fromCents(totalCents);
}

/**
 * Calcula o valor atual de mercado de uma carteira de ativos.
 * Impede que BRL e USD sejam somados diretamente sem segregação.
 */
export function calculatePortfolioValue(
  assets: InvestmentAsset[],
  targetCurrency?: SupportedInvestmentCurrency
): number {
  const resolved = resolvePortfolioAssets(assets, targetCurrency);
  if (resolved.length === 0) return 0;

  const totalCents = resolved.reduce((sum, a) => sum + toCents(calculateInvestmentValue(a)), 0);
  return fromCents(totalCents);
}

/**
 * Calcula a rentabilidade agregada (lucro/prejuízo total e percentual) de uma carteira.
 */
export function calculatePortfolioProfit(
  assets: InvestmentAsset[],
  targetCurrency?: SupportedInvestmentCurrency
): PortfolioProfitResult {
  const cost = calculatePortfolioCost(assets, targetCurrency);
  const value = calculatePortfolioValue(assets, targetCurrency);
  const profitLoss = subtractMoney(value, cost);
  const profitLossPercent = cost > 0 ? (profitLoss / cost) * 100 : 0;

  return {
    profitLoss,
    profitLossPercent
  };
}

/**
 * Calcula a variação diária de uma carteira com base no fechamento anterior (previousClose).
 * Se previousClose estiver ausente em algum ativo, considera variação zero para aquele ativo sem falhar.
 */
export function calculateDailyVariation(
  assets: InvestmentAsset[],
  targetCurrency?: SupportedInvestmentCurrency
): DailyVariationResult {
  const resolved = resolvePortfolioAssets(assets, targetCurrency);
  if (resolved.length === 0) {
    return { variationAmount: 0, variationPercent: 0 };
  }

  let totalDiffCents = 0;

  for (const a of resolved) {
    if (
      typeof a.previousClose === 'number' &&
      a.previousClose > 0 &&
      !isNaN(a.previousClose) &&
      typeof a.currentPrice === 'number' &&
      typeof a.quantity === 'number' &&
      a.quantity > 0
    ) {
      const currentCents = toCents(a.currentPrice);
      const prevCents = toCents(a.previousClose);
      const diffCentsPerUnit = currentCents - prevCents;
      const assetDiffCents = Math.round(a.quantity * diffCentsPerUnit);
      totalDiffCents += assetDiffCents;
    }
  }

  const variationAmount = fromCents(totalDiffCents);
  const totalValue = calculatePortfolioValue(resolved, targetCurrency);
  const baseValue = subtractMoney(totalValue, variationAmount);
  const variationPercent = baseValue > 0 ? (variationAmount / baseValue) * 100 : 0;

  return {
    variationAmount,
    variationPercent
  };
}

/**
 * Calcula a distribuição percentual da carteira por classe de ativo (Ações, FIIs, Cripto, etc.).
 * Retorna as classes presentes com seu respectivo valor e percentual exato sobre o total.
 */
export function calculatePortfolioAllocation(
  assets: InvestmentAsset[],
  targetCurrency?: SupportedInvestmentCurrency
): AssetAllocationItem[] {
  const resolved = resolvePortfolioAssets(assets, targetCurrency);
  if (resolved.length === 0) return [];

  const totalValue = calculatePortfolioValue(resolved, targetCurrency);
  const assetClasses: AssetClass[] = ['stock', 'fii', 'fixed_income', 'crypto', 'bdr_etf', 'other'];

  return assetClasses
    .map(type => {
      const classAssets = resolved.filter(a => a.type === type);
      const classCents = classAssets.reduce((sum, a) => sum + toCents(calculateInvestmentValue(a)), 0);
      const value = fromCents(classCents);
      const percent = totalValue > 0 ? (value / totalValue) * 100 : 0;
      return {
        type,
        value,
        percent,
        count: classAssets.length
      };
    })
    .filter(item => item.count > 0 || item.value > 0);
}

/**
 * Segrega a carteira por moeda e gera o resumo consolidado individual para cada uma.
 * Permite que a interface apresente a Carteira BRL e a Carteira USD sem misturar valores.
 */
export function getPortfolioSummaryByCurrency(
  assets: InvestmentAsset[]
): Record<SupportedInvestmentCurrency, CurrencyPortfolioSummary> {
  const currencies: SupportedInvestmentCurrency[] = ['BRL', 'USD'];
  const result = {} as Record<SupportedInvestmentCurrency, CurrencyPortfolioSummary>;

  for (const curr of currencies) {
    const currAssets = assets.filter(a => a.currency === curr);
    const totalCost = calculatePortfolioCost(currAssets, curr);
    const totalValue = calculatePortfolioValue(currAssets, curr);
    const profit = calculatePortfolioProfit(currAssets, curr);
    const daily = calculateDailyVariation(currAssets, curr);

    result[curr] = {
      currency: curr,
      totalCost,
      totalValue,
      profitLoss: profit.profitLoss,
      profitLossPercent: profit.profitLossPercent,
      dailyVariationAmount: daily.variationAmount,
      dailyVariationPercent: daily.variationPercent,
      assetsCount: currAssets.length
    };
  }

  return result;
}

export interface AporteCalculationResult {
  newQuantity: number;
  newAveragePrice: number;
  newTotalCost: number;
  totalAporteAmount: number;
}

/**
 * Calcula a nova posição (quantidade e preço médio ponderado) de um ativo após um aporte.
 * Fórmula do Preço Médio Ponderado:
 * Novo Custo Total = (Q_antiga * PreçoMédio_antigo) + (Q_aporte * Preço_aporte)
 * Nova Quantidade = Q_antiga + Q_aporte
 * Novo Preço Médio = Novo Custo Total / Nova Quantidade
 */
export function calculateAportePosition(
  currentPosition: { quantity: number; averagePrice: number },
  aporte: { quantity: number; price: number }
): AporteCalculationResult {
  const currentQty = Math.max(0, currentPosition.quantity || 0);
  const currentAvgPrice = Math.max(0, currentPosition.averagePrice || 0);
  const aporteQty = Math.max(0, aporte.quantity || 0);
  const aportePrice = Math.max(0, aporte.price || 0);

  if (aporteQty <= 0 || aportePrice <= 0) {
    const currentCost = calculateInvestmentCost({ quantity: currentQty, averagePrice: currentAvgPrice });
    return {
      newQuantity: currentQty,
      newAveragePrice: currentAvgPrice,
      newTotalCost: currentCost,
      totalAporteAmount: 0
    };
  }

  const currentCostCents = Math.round(currentQty * toCents(currentAvgPrice));
  const aporteCostCents = Math.round(aporteQty * toCents(aportePrice));
  const newCostCents = currentCostCents + aporteCostCents;
  const newQuantity = currentQty + aporteQty;

  const newAveragePrice = newQuantity > 0
    ? fromCents(Math.round(newCostCents / newQuantity))
    : 0;

  return {
    newQuantity,
    newAveragePrice,
    newTotalCost: fromCents(newCostCents),
    totalAporteAmount: fromCents(aporteCostCents)
  };
}
