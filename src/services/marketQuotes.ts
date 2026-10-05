/**
 * Market Quotes Service for FinFlow
 * Fetches real-time market prices from Yahoo Finance via the /api/quotes endpoint.
 * Caches quotes in localStorage for offline availability.
 */

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  changePercent: number;
  currency: 'BRL' | 'USD';
  updatedAt: string;
}

const CACHE_KEY = 'finflow_market_quotes_cache';

export const POPULAR_TICKERS = [
  // Ações B3
  { ticker: 'PETR4', name: 'Petrobras PN', type: 'stock' as const },
  { ticker: 'VALE3', name: 'Vale ON', type: 'stock' as const },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'stock' as const },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'stock' as const },
  { ticker: 'BBDC4', name: 'Bradesco PN', type: 'stock' as const },
  { ticker: 'WEGE3', name: 'WEG ON', type: 'stock' as const },
  { ticker: 'ABEV3', name: 'Ambev ON', type: 'stock' as const },
  { ticker: 'RENT3', name: 'Localiza ON', type: 'stock' as const },
  { ticker: 'MGLU3', name: 'Magazine Luiza ON', type: 'stock' as const },
  { ticker: 'PRIO3', name: 'PRIO ON', type: 'stock' as const },

  // Fundos Imobiliários (FIIs)
  { ticker: 'MXRF11', name: 'Maxi Renda FII', type: 'fii' as const },
  { ticker: 'HGLG11', name: 'CSHG Logística FII', type: 'fii' as const },
  { ticker: 'XPLG11', name: 'XP Log FII', type: 'fii' as const },
  { ticker: 'KNIP11', name: 'Kinea Índice de Preços FII', type: 'fii' as const },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística FII', type: 'fii' as const },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers FII', type: 'fii' as const },
  { ticker: 'XPML11', name: 'XP Malls FII', type: 'fii' as const },
  { ticker: 'TGAR11', name: 'TG Ativo Real FII', type: 'fii' as const },

  // ETFs & BDRs
  { ticker: 'IVVB11', name: 'iShares S&P 500 Fundo de Índice', type: 'bdr_etf' as const },
  { ticker: 'BOVA11', name: 'iShares Ibovespa Fundo de Índice', type: 'bdr_etf' as const },
  { ticker: 'SMAL11', name: 'iShares Small Cap Fundo de Índice', type: 'bdr_etf' as const },
  { ticker: 'AAPL34', name: 'Apple Inc. BDR', type: 'bdr_etf' as const },
  { ticker: 'NVDC34', name: 'Nvidia Corp. BDR', type: 'bdr_etf' as const },
  { ticker: 'MSFT34', name: 'Microsoft Corp. BDR', type: 'bdr_etf' as const },

  // Criptomoedas
  { ticker: 'BTC', name: 'Bitcoin (BTC)', type: 'crypto' as const },
  { ticker: 'ETH', name: 'Ethereum (ETH)', type: 'crypto' as const },
  { ticker: 'SOL', name: 'Solana (SOL)', type: 'crypto' as const },
];

/**
 * Retrieve cached quotes from localStorage
 */
export function getCachedQuotes(): Record<string, MarketQuote> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save quotes to localStorage cache
 */
export function saveQuotesToCache(quotes: Record<string, MarketQuote>) {
  try {
    const current = getCachedQuotes();
    const updated = { ...current, ...quotes };
    localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save quotes to cache', e);
  }
}

/**
 * Fetch quotes for an array of ticker symbols from the proxy endpoint.
 * Gracefully merges with cached data on network error.
 */
export async function fetchMarketQuotes(tickers: string[]): Promise<{
  quotes: Record<string, MarketQuote>;
  fromCacheOnly: boolean;
}> {
  const cached = getCachedQuotes();
  if (tickers.length === 0) return { quotes: cached, fromCacheOnly: true };

  const validTickers = tickers.map(t => t.trim().toUpperCase()).filter(Boolean);

  try {
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(validTickers.join(','))}`);
    if (!response.ok) {
      throw new Error(`Quote endpoint returned status ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.quotes) {
      saveQuotesToCache(data.quotes);
      return {
        quotes: { ...cached, ...data.quotes },
        fromCacheOnly: false
      };
    }
  } catch (error) {
    console.warn('Network error fetching quotes, falling back to local cache', error);
  }

  return {
    quotes: cached,
    fromCacheOnly: true
  };
}
