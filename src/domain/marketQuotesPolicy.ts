import { InvestmentAsset } from '../types/finance';

export const DEFAULT_QUOTE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export interface MarketQuoteItem {
  price?: number;
  previousClose?: number;
  changePercent?: number;
  updatedAt?: string;
}

/**
 * Avalia se já decorreu o intervalo mínimo necessário desde a última checagem automática de cotações.
 */
export function shouldPerformAutoQuoteCheck(
  now: number,
  lastCheck: number,
  minIntervalMs: number = DEFAULT_QUOTE_CHECK_INTERVAL_MS
): boolean {
  return now - lastCheck > minIntervalMs;
}

/**
 * Filtra e retorna a lista de tickers dos ativos elegíveis para atualização automática.
 * Apenas ativos com autoUpdate habilitado e ticker preenchido são selecionados.
 */
export function getTickersToUpdate(
  investments: Array<{ autoUpdate?: boolean; ticker?: string }>
): string[] {
  return investments
    .filter(inv => Boolean(inv.autoUpdate && inv.ticker && inv.ticker.trim() !== ''))
    .map(inv => (inv.ticker as string).trim());
}

/**
 * Localiza a cotação correspondente a um ticker, considerando maiúsculas e o sufixo '.SA' (B3).
 */
export function findQuoteForTicker<T>(
  quotes: Record<string, T | undefined>,
  ticker?: string
): T | undefined {
  if (!ticker || !ticker.trim()) return undefined;
  const upper = ticker.trim().toUpperCase();
  return quotes[upper] || quotes[`${upper}.SA`];
}

/**
 * Mescla uma cotação de mercado em um ativo de investimento.
 * Se a cotação não existir ou o preço não for numérico, preserva o ativo sem alterações.
 */
export function mergeQuoteIntoAsset(
  asset: InvestmentAsset,
  quote: MarketQuoteItem | undefined,
  nowIso: string = new Date().toISOString()
): InvestmentAsset {
  if (!quote || typeof quote.price !== 'number' || isNaN(quote.price)) {
    return asset;
  }

  return {
    ...asset,
    currentPrice: quote.price,
    previousClose: quote.previousClose,
    changePercent: quote.changePercent,
    lastPriceUpdate: quote.updatedAt || nowIso,
  };
}

/**
 * Constrói o payload de metadados de cotação para persistência no banco e sincronização remota.
 */
export function buildQuoteMetadata(
  quote: { previousClose?: number; changePercent?: number },
  existingLastUpdate?: string,
  nowIso: string = new Date().toISOString()
): { previousClose?: number; changePercent?: number; lastPriceUpdate: string } {
  return {
    ...(quote.previousClose !== undefined ? { previousClose: quote.previousClose } : {}),
    ...(quote.changePercent !== undefined ? { changePercent: quote.changePercent } : {}),
    lastPriceUpdate: existingLastUpdate || nowIso,
  };
}
