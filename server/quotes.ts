/**
 * Server-side Quotes Provider & Normalizer
 * Clean, isolated implementation for fetching market quotes.
 * Independent of Vite, Express, or browser APIs (standard fetch & AbortController only).
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

export interface CachedQuoteEntry {
  quote: MarketQuote;
  cachedAt: number;
}

// In-memory quote cache (30 seconds TTL per symbol)
const memoryCache = new Map<string, CachedQuoteEntry>();
const CACHE_TTL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_SYMBOLS = 30;
const SYMBOL_REGEX = /^[A-Z0-9.-]{1,12}$/;

/**
 * Normalizes and validates a comma-separated or raw string of symbols.
 * - Trims and converts to uppercase.
 * - Accepts only symbols matching /^[A-Z0-9.\-]{1,12}$/. Discards invalid ones silently.
 * - Enforces a maximum of 30 symbols (ignores excess).
 */
export function normalizeSymbols(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];

  const tokens = raw.split(',');
  const result: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cleaned = token.trim().toUpperCase();
    if (!cleaned) continue;

    if (SYMBOL_REGEX.test(cleaned)) {
      if (!seen.has(cleaned)) {
        seen.add(cleaned);
        result.push(cleaned);
        if (result.length >= MAX_SYMBOLS) {
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Maps input ticker symbols to Yahoo Finance symbols:
 * - BTC / BITCOIN -> BTC-USD
 * - ETH / ETHEREUM -> ETH-USD
 * - SOL / SOLANA -> SOL-USD
 * - B3 Brazilian tickers (e.g. PETR4, VALE3, MXRF11) matching /^[A-Z]{4}\d{1,2}$/i -> ticker.SA
 */
export function toYahooSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();

  if (upper === 'BTC' || upper === 'BITCOIN') return 'BTC-USD';
  if (upper === 'ETH' || upper === 'ETHEREUM') return 'ETH-USD';
  if (upper === 'SOL' || upper === 'SOLANA') return 'SOL-USD';

  if (/^[A-Z]{4}\d{1,2}$/.test(upper) && !upper.endsWith('.SA')) {
    return `${upper}.SA`;
  }

  return upper;
}

interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        shortName?: string;
        symbol?: string;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChangePercent?: number;
        currency?: string;
      };
    }>;
  };
}

/**
 * Isolated Yahoo Finance quote fetcher with 5-second timeout via AbortController.
 * Returns null on failure so other symbols are not affected.
 */
export async function fetchFromYahoo(rawSymbol: string): Promise<MarketQuote | null> {
  const yahooSymbol = toYahooSymbol(rawSymbol);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as YahooFinanceResponse;
    const meta = data?.chart?.result?.[0]?.meta;

    if (meta && typeof meta.regularMarketPrice === 'number') {
      const quote: MarketQuote = {
        symbol: rawSymbol,
        name: meta.shortName || meta.symbol || rawSymbol,
        price: meta.regularMarketPrice,
        previousClose: typeof meta.chartPreviousClose === 'number'
          ? meta.chartPreviousClose
          : (typeof meta.previousClose === 'number' ? meta.previousClose : meta.regularMarketPrice),
        changePercent: typeof meta.regularMarketChangePercent === 'number'
          ? meta.regularMarketChangePercent
          : 0,
        currency: (meta.currency === 'USD' ? 'USD' : 'BRL') as 'BRL' | 'USD',
        updatedAt: new Date().toISOString()
      };
      return quote;
    }

    return null;
  } catch (_err) {
    // Timeout or network error - individual symbol failure
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Clears or modifies the memory cache (helper for testing and cache reset).
 */
export function clearQuotesCache(): void {
  memoryCache.clear();
}

/**
 * Gets market quotes for a list of symbols.
 * Utilizes a 30s in-memory cache per symbol and fetches fresh data if missing/expired.
 * Failure in one symbol does not break the others.
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
  if (!symbols || symbols.length === 0) {
    return {};
  }

  // Ensure symbols are sanitized and bounded
  const cleanSymbols = symbols
    .map(s => s.trim().toUpperCase())
    .filter(s => SYMBOL_REGEX.test(s))
    .slice(0, MAX_SYMBOLS);

  const now = Date.now();
  const quotes: Record<string, MarketQuote> = {};
  const symbolsToFetch: string[] = [];

  for (const symbol of cleanSymbols) {
    const cached = memoryCache.get(symbol);
    if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
      quotes[symbol] = cached.quote;
    } else {
      symbolsToFetch.push(symbol);
    }
  }

  if (symbolsToFetch.length > 0) {
    await Promise.all(
      symbolsToFetch.map(async (sym) => {
        try {
          const fresh = await fetchFromYahoo(sym);
          if (fresh) {
            memoryCache.set(sym, {
              quote: fresh,
              cachedAt: Date.now()
            });
            quotes[sym] = fresh;
          }
        } catch (_e) {
          // Failure on single ticker does not break the rest
        }
      })
    );
  }

  return quotes;
}
