/// <reference types="vite/client" />
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
  { ticker: 'PETR4', name: 'Petrobras PN', type: 'stock' as const, sector: 'Petróleo, Gás & Biocombustíveis' },
  { ticker: 'VALE3', name: 'Vale ON', type: 'stock' as const, sector: 'Mineração & Siderurgia' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'stock' as const, sector: 'Financeiro & Bancos' },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'stock' as const, sector: 'Financeiro & Bancos' },
  { ticker: 'BBDC4', name: 'Bradesco PN', type: 'stock' as const, sector: 'Financeiro & Bancos' },
  { ticker: 'WEGE3', name: 'WEG ON', type: 'stock' as const, sector: 'Bens Industriais & Motores' },
  { ticker: 'ABEV3', name: 'Ambev ON', type: 'stock' as const, sector: 'Alimentos & Bebidas' },
  { ticker: 'RENT3', name: 'Localiza ON', type: 'stock' as const, sector: 'Consumo & Aluguel de Carros' },
  { ticker: 'MGLU3', name: 'Magazine Luiza ON', type: 'stock' as const, sector: 'Consumo Cíclico & Varejo' },
  { ticker: 'PRIO3', name: 'PRIO ON', type: 'stock' as const, sector: 'Petróleo, Gás & Biocombustíveis' },

  // Fundos Imobiliários (FIIs)
  { ticker: 'MXRF11', name: 'Maxi Renda FII', type: 'fii' as const, sector: 'Papel / CRI' },
  { ticker: 'HGLG11', name: 'CSHG Logística FII', type: 'fii' as const, sector: 'Logística & Galpões' },
  { ticker: 'XPLG11', name: 'XP Log FII', type: 'fii' as const, sector: 'Logística & Galpões' },
  { ticker: 'KNIP11', name: 'Kinea Índice de Preços FII', type: 'fii' as const, sector: 'Papel / CRI' },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística FII', type: 'fii' as const, sector: 'Logística & Galpões' },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers FII', type: 'fii' as const, sector: 'Shoppings Centers' },
  { ticker: 'XPML11', name: 'XP Malls FII', type: 'fii' as const, sector: 'Shoppings Centers' },
  { ticker: 'TGAR11', name: 'TG Ativo Real FII', type: 'fii' as const, sector: 'Renda Urbana & Desenvolvimento' },

  // ETFs & BDRs
  { ticker: 'IVVB11', name: 'iShares S&P 500 Fundo de Índice', type: 'bdr_etf' as const, sector: 'Índice Global S&P 500' },
  { ticker: 'BOVA11', name: 'iShares Ibovespa Fundo de Índice', type: 'bdr_etf' as const, sector: 'Índice B3 Ibovespa' },
  { ticker: 'SMAL11', name: 'iShares Small Cap Fundo de Índice', type: 'bdr_etf' as const, sector: 'Índice Small Caps' },
  { ticker: 'AAPL34', name: 'Apple Inc. BDR', type: 'bdr_etf' as const, sector: 'Tecnologia Global' },
  { ticker: 'NVDC34', name: 'Nvidia Corp. BDR', type: 'bdr_etf' as const, sector: 'Tecnologia & Semicondutores' },
  { ticker: 'MSFT34', name: 'Microsoft Corp. BDR', type: 'bdr_etf' as const, sector: 'Tecnologia & Softwares' },

  // Criptomoedas
  { ticker: 'BTC', name: 'Bitcoin (BTC)', type: 'crypto' as const, sector: 'Criptoativos / Reserva de Valor' },
  { ticker: 'ETH', name: 'Ethereum (ETH)', type: 'crypto' as const, sector: 'Smart Contracts & Web3' },
  { ticker: 'SOL', name: 'Solana (SOL)', type: 'crypto' as const, sector: 'Smart Contracts & DeFi' },
];

export const STOCK_SECTORS = [
  'Financeiro & Bancos',
  'Petróleo, Gás & Biocombustíveis',
  'Mineração & Siderurgia',
  'Energia Elétrica',
  'Saneamento & Serviços Básicos',
  'Consumo Cíclico & Varejo',
  'Alimentos & Bebidas',
  'Saúde & Farmácias',
  'Bens Industriais & Motores',
  'Tecnologia da Informação',
  'Construção Civil & Imobiliário',
  'Papel & Celulose',
  'Telecomunicações',
  'Seguradoras',
  'Transporte & Logística',
  'Outros Setores'
];

export const FII_SEGMENTS = [
  'Papel / CRI',
  'Logística & Galpões',
  'Shoppings Centers',
  'Lajes Corporativas',
  'Renda Urbana & Desenvolvimento',
  'Fundo de Fundos (FOF)',
  'Agronegócio (Fiagro)',
  'Infraestrutura (FI-Infra)',
  'Educacional & Hospitalar',
  'Outros Segmentos'
];

/**
 * Sugere o setor ou segmento padrão com base no ticker e na classe do ativo.
 */
export function guessAssetSector(ticker?: string, type?: string, explicitSector?: string): string {
  if (explicitSector && explicitSector.trim().length > 0) {
    return explicitSector.trim();
  }
  if (!ticker) {
    if (type === 'fii') return 'Geral FII';
    if (type === 'crypto') return 'Criptoativos';
    if (type === 'fixed_income') return 'Renda Fixa';
    return 'Geral';
  }

  const sym = ticker.trim().toUpperCase();

  // Busca correspondência direta em POPULAR_TICKERS
  const found = POPULAR_TICKERS.find(p => p.ticker === sym);
  if (found?.sector) return found.sector;

  // Heurísticas de ações brasileiras
  if (['PETR4', 'PETR3', 'PRIO3', 'RECV3', 'CSAN3', 'RRRP3', 'BRAV3'].includes(sym)) return 'Petróleo, Gás & Biocombustíveis';
  if (['VALE3', 'CSNA3', 'GGBR4', 'GGBR3', 'USIM5', 'CMIN3'].includes(sym)) return 'Mineração & Siderurgia';
  if (['ITUB4', 'ITUB3', 'BBDC4', 'BBDC3', 'BBAS3', 'SANB11', 'BPAC11', 'ITSA4', 'ITSA3', 'CXSE3', 'BBSE3'].includes(sym)) return 'Financeiro & Bancos';
  if (['TAEE11', 'CPLE6', 'EGIE3', 'CMIG4', 'EQTL3', 'ENGI11', 'NEOE3', 'TRPL4', 'ALUP11'].includes(sym)) return 'Energia Elétrica';
  if (['SBSP3', 'SAPR11', 'SAPR4', 'CSMG3'].includes(sym)) return 'Saneamento & Serviços Básicos';
  if (['WEGE3', 'TUPY3', 'SHUL4'].includes(sym)) return 'Bens Industriais & Motores';
  if (['ABEV3', 'MDIA3', 'JBSS3', 'BRFS3', 'BEEF3', 'MRFG3'].includes(sym)) return 'Alimentos & Bebidas';
  if (['RENT3', 'LREN3', 'MGLU3', 'ARZZ3', 'ALOS3', 'SBFG3', 'PETZ3', 'VIIA3', 'BHIA3'].includes(sym)) return 'Consumo Cíclico & Varejo';
  if (['RADL3', 'FLRY3', 'HAPV3', 'RDOR3', 'PNVL3', 'BLAU3'].includes(sym)) return 'Saúde & Farmácias';
  if (['KLBN11', 'KLBN4', 'SUZB3'].includes(sym)) return 'Papel & Celulose';
  if (['TOTS3', 'POSI3', 'LWSA3', 'CASH3'].includes(sym)) return 'Tecnologia da Informação';
  if (['CYRE3', 'EZTC3', 'MRVE3', 'DIRR3'].includes(sym)) return 'Construção Civil & Imobiliário';
  if (['VIVT3', 'TIMS3'].includes(sym)) return 'Telecomunicações';
  if (['EMBR3', 'AZUL4', 'GOLL4', 'RAIL3', 'CCRO3', 'ECOR3'].includes(sym)) return 'Transporte & Logística';

  // Heurísticas de FIIs
  if (sym.endsWith('11')) {
    if (['MXRF11', 'KNIP11', 'KNSC11', 'CPTS11', 'RECR11', 'IRDM11', 'VGIR11', 'RBRR11', 'HABT11', 'MCCI11', 'VRTA11', 'RBHG11', 'HGCR11', 'CVBI11'].includes(sym)) return 'Papel / CRI';
    if (['HGLG11', 'BTLG11', 'XPLG11', 'VILG11', 'BRCO11', 'ALZR11', 'GGRC11', 'LVBI11', 'GALG11', 'TRBL11'].includes(sym)) return 'Logística & Galpões';
    if (['XPML11', 'VISC11', 'MALL11', 'HSML11', 'HGBS11', 'WPSL11'].includes(sym)) return 'Shoppings Centers';
    if (['KNRI11', 'HGRE11', 'BRCR11', 'PVBI11', 'JSRE11', 'RCRB11', 'RECT11', 'VINO11', 'TEPP11'].includes(sym)) return 'Lajes Corporativas';
    if (['TGAR11', 'HGRU11', 'RBVA11', 'TRXF11', 'VSHO11'].includes(sym)) return 'Renda Urbana & Desenvolvimento';
    if (['HFOF11', 'BCFF11', 'KFOF11', 'RBRF11', 'MGFF11', 'CXRI11'].includes(sym)) return 'Fundo de Fundos (FOF)';
    if (['KNCA11', 'RURA11', 'VGIA11', 'SNAG11', 'EGAF11'].includes(sym)) return 'Agronegócio (Fiagro)';
    if (type === 'fii') return 'FII Outros Segmentos';
  }

  if (type === 'crypto' || ['BTC', 'ETH', 'SOL', 'USDT', 'ADA', 'XRP'].includes(sym)) return 'Criptoativos';
  if (type === 'fixed_income' || sym.includes('TESOURO') || sym.includes('SELIC') || sym.includes('IPCA') || sym.includes('CDB')) return 'Renda Fixa / Títulos';
  if (type === 'bdr_etf' || sym.endsWith('34') || ['IVVB11', 'BOVA11', 'SMAL11', 'SPXI11', 'NASD11'].includes(sym)) return 'BDR / ETFs Globais';

  if (type === 'stock') return 'Ações Outros Setores';
  return 'Diversos';
}

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
    const baseUrl = import.meta.env.VITE_QUOTES_API_URL || '/api/quotes';
    const separator = baseUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${baseUrl}${separator}symbols=${encodeURIComponent(validTickers.join(','))}`);
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
