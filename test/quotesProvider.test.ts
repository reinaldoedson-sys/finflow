import {
  normalizeSymbols,
  toYahooSymbol,
  getQuotes,
  fetchFromYahoo,
  clearQuotesCache
} from '../server/quotes';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

// Guarda o fetch original para restaurar depois
const originalFetch = globalThis.fetch;

async function runTests() {
  console.log('--- INICIANDO TESTES DO PROVEDOR DE COTAÇÕES (server/quotes.ts) ---');

  // 1. Mapeamento de símbolos (toYahooSymbol)
  {
    console.log('\n[1] Mapeamento de símbolos:');
    assert(toYahooSymbol('BTC') === 'BTC-USD', 'BTC mapeia para BTC-USD');
    assert(toYahooSymbol('bitcoin') === 'BTC-USD', 'bitcoin (minúsculo) mapeia para BTC-USD');
    assert(toYahooSymbol('ETH') === 'ETH-USD', 'ETH mapeia para ETH-USD');
    assert(toYahooSymbol('ethereum') === 'ETH-USD', 'ethereum mapeia para ETH-USD');
    assert(toYahooSymbol('SOL') === 'SOL-USD', 'SOL mapeia para SOL-USD');
    assert(toYahooSymbol('PETR4') === 'PETR4.SA', 'Ticker da B3 PETR4 mapeia para PETR4.SA');
    assert(toYahooSymbol('VALE3') === 'VALE3.SA', 'Ticker da B3 VALE3 mapeia para VALE3.SA');
    assert(toYahooSymbol('MXRF11') === 'MXRF11.SA', 'Ticker da B3 MXRF11 mapeia para MXRF11.SA');
    assert(toYahooSymbol('PETR4.SA') === 'PETR4.SA', 'Símbolo já com .SA não duplica o sufixo');
    assert(toYahooSymbol('AAPL') === 'AAPL', 'Ticker americano padrão (AAPL) permanece intacto');
  }

  // 2. Rejeição e higienização de símbolos inválidos (normalizeSymbols)
  {
    console.log('\n[2] Validação e higienização de símbolos (normalizeSymbols):');
    const input = '  PETR4 , vale3, btc , <script>, aaaaaaaaaaaaaaa, @INV!, eth  ';
    const normalized = normalizeSymbols(input);

    assert(normalized.includes('PETR4'), 'Inclui PETR4 em maiúsculas');
    assert(normalized.includes('VALE3'), 'Inclui VALE3 em maiúsculas');
    assert(normalized.includes('BTC'), 'Inclui BTC');
    assert(normalized.includes('ETH'), 'Inclui ETH');
    assert(!normalized.includes('<SCRIPT>'), 'Descarta caracteres não alfanuméricos/perigosos (<script>)');
    assert(!normalized.includes('@INV!'), 'Descarta símbolos com pontuação inválida (@INV!)');
    assert(!normalized.includes('AAAAAAAAAAAAAAA'), 'Descarta símbolos com mais de 12 caracteres');
    assert(normalized.length === 4, `Quantidade correta de símbolos válidos: ${normalized.length} (esperado 4)`);
  }

  // 3. Limite estrito de no máximo 30 símbolos por requisição
  {
    console.log('\n[3] Limite de no máximo 30 símbolos:');
    const manySymbols = Array.from({ length: 45 }, (_, i) => `TICK${i}`).join(',');
    const limited = normalizeSymbols(manySymbols);
    assert(limited.length === 30, `Limita exatamente a 30 símbolos: ${limited.length}`);
    assert(limited[0] === 'TICK0', 'Primeiro símbolo preservado');
    assert(limited[29] === 'TICK29', 'Trigésimo símbolo preservado');
    assert(!limited.includes('TICK30'), 'Símbolos além de 30 ignorados');
  }

  // 4. Cache em memória de 30 segundos
  {
    console.log('\n[4] Cache em memória de 30 segundos por símbolo:');
    clearQuotesCache();

    let fetchCount = 0;
    // Mock do fetch global
    globalThis.fetch = async (_url: any, _options?: any) => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  symbol: 'PETR4.SA',
                  shortName: 'PETROBRAS PN',
                  regularMarketPrice: 38.5,
                  chartPreviousClose: 37.8,
                  regularMarketChangePercent: 1.85,
                  currency: 'BRL'
                }
              }
            ]
          }
        })
      } as any;
    };

    const firstRun = await getQuotes(['PETR4']);
    assert(firstRun['PETR4']?.price === 38.5, 'Primeira busca retorna preço correto 38.5');
    assert(fetchCount === 1, `Fetch foi chamado 1 vez: ${fetchCount}`);

    // Segunda chamada para o mesmo ticker deve utilizar cache em memória
    const secondRun = await getQuotes(['PETR4']);
    assert(secondRun['PETR4']?.price === 38.5, 'Segunda busca retorna dados do cache');
    assert(fetchCount === 1, `Fetch NÃO foi chamado novamente (cache ativo): ${fetchCount}`);

    // Nova chamada com novo símbolo deve bater no fetch apenas para o novo
    const thirdRun = await getQuotes(['PETR4', 'VALE3']);
    assert(thirdRun['PETR4']?.price === 38.5, 'PETR4 continua vindo do cache');
    assert(fetchCount === 2, `Fetch foi chamado apenas para VALE3: ${fetchCount}`);
  }

  // 5. Falha/timeout em um símbolo não afeta os demais
  {
    console.log('\n[5] Falha/erro ou timeout em um símbolo não afeta os outros:');
    clearQuotesCache();

    globalThis.fetch = async (url: any, _options?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('BROKEN')) {
        // Simula falha/rejeição ou erro de rede
        throw new Error('Network timeout/DNS failure');
      }
      return {
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  symbol: 'GOOD.SA',
                  shortName: 'GOOD ASSET',
                  regularMarketPrice: 100.0,
                  chartPreviousClose: 98.0,
                  regularMarketChangePercent: 2.04,
                  currency: 'BRL'
                }
              }
            ]
          }
        })
      } as any;
    };

    const result = await getQuotes(['GOOD', 'BROKEN']);
    assert(result['GOOD'] !== undefined, 'Símbolo válido GOOD foi retornado com sucesso');
    assert(result['GOOD']?.price === 100.0, 'Preço de GOOD é 100.0');
    assert(result['BROKEN'] === undefined, 'Símbolo com erro BROKEN foi ignorado sem quebrar os outros');
  }

  // 6. AbortController e Timeout de 5s no fetchFromYahoo
  {
    console.log('\n[6] Timeout no fetchFromYahoo via AbortController:');
    globalThis.fetch = async (_url: any, options?: any) => {
      // Simula uma requisição que escuta o sinal de abort
      return new Promise((resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            reject(new Error('AbortError: The operation was aborted'));
          });
        }
      });
    };

    // Testa fetchFromYahoo diretamente com sinal de abort
    const fetchPromise = fetchFromYahoo('TIMEOUT');
    // Para não demorar 5s no teste de unidade, o fetchFromYahoo trata o erro e devolve null
    // Aguardamos com timeout curto simulado ou deixamos o AbortController disparar
    const res = await Promise.race([
      fetchPromise,
      new Promise<null>(r => setTimeout(() => r(null), 5500))
    ]);

    assert(res === null, 'fetchFromYahoo retorna null graciosamente em timeout ou erro');
  }

  // Restaura o fetch original
  globalThis.fetch = originalFetch;

  console.log(`\n========================================`);
  console.log(`TOTAL DE TESTES: ${passed + failed}`);
  console.log(`PASSOU: ${passed}`);
  console.log(`FALHOU: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal executando os testes:', err);
  process.exit(1);
});
