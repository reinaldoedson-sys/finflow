import {
  shouldPerformAutoQuoteCheck,
  getTickersToUpdate,
  findQuoteForTicker,
  mergeQuoteIntoAsset,
  buildQuoteMetadata,
  DEFAULT_QUOTE_CHECK_INTERVAL_MS,
} from '../src/domain/marketQuotesPolicy';
import { InvestmentAsset } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes de regras de cotações de mercado (marketQuotesPolicy)...');

  // =========================================================================
  // 1. Testes de shouldPerformAutoQuoteCheck (intervalo mínimo)
  // =========================================================================
  console.log('\n--- 1. Testando shouldPerformAutoQuoteCheck ---');
  const baseTime = 1000000;
  
  // Menor que o intervalo (4 minutos < 5 minutos) -> false
  assert(
    shouldPerformAutoQuoteCheck(baseTime + 4 * 60 * 1000, baseTime) === false,
    'Não deve atualizar antes de decorrido o intervalo padrão de 5 minutos'
  );

  // Exatamente no limite de 5 minutos -> false (> estrito)
  assert(
    shouldPerformAutoQuoteCheck(baseTime + DEFAULT_QUOTE_CHECK_INTERVAL_MS, baseTime) === false,
    'No limite exato não deve disparar'
  );

  // Após 5 minutos e 1 ms -> true
  assert(
    shouldPerformAutoQuoteCheck(baseTime + DEFAULT_QUOTE_CHECK_INTERVAL_MS + 1, baseTime) === true,
    'Deve disparar após decorrido o intervalo'
  );

  // Intervalo customizado (ex.: 10 segundos)
  assert(
    shouldPerformAutoQuoteCheck(baseTime + 11000, baseTime, 10000) === true,
    'Deve respeitar intervalo customizado'
  );
  assert(
    shouldPerformAutoQuoteCheck(baseTime + 9000, baseTime, 10000) === false,
    'Não deve disparar se intervalo customizado não foi atingido'
  );
  console.log('  ✅ Intervalo de checagem automática validado com sucesso.');

  // =========================================================================
  // 2. Testes de getTickersToUpdate (ativos elegíveis)
  // =========================================================================
  console.log('\n--- 2. Testando getTickersToUpdate ---');
  const sampleInvestments = [
    { id: '1', ticker: 'PETR4', autoUpdate: true },
    { id: '2', ticker: 'VALE3', autoUpdate: false }, // autoUpdate desligado
    { id: '3', ticker: 'ITUB4', autoUpdate: true },
    { id: '4', ticker: '', autoUpdate: true }, // ticker vazio
    { id: '5', ticker: '   ', autoUpdate: true }, // ticker só espaços
    { id: '6', ticker: 'CDB DI', autoUpdate: false },
    { id: '7', ticker: undefined, autoUpdate: true }, // sem ticker
  ];

  const tickers = getTickersToUpdate(sampleInvestments);
  assert(tickers.length === 2, `Esperado 2 tickers elegíveis, obteve ${tickers.length}`);
  assert(tickers.includes('PETR4'), 'Deve incluir PETR4');
  assert(tickers.includes('ITUB4'), 'Deve incluir ITUB4');
  assert(!tickers.includes('VALE3'), 'Não deve incluir ativo com autoUpdate desligado');
  console.log('  ✅ Filtragem de tickers elegíveis validada com sucesso.');

  // =========================================================================
  // 3. Testes de findQuoteForTicker (busca com case e sufixo B3)
  // =========================================================================
  console.log('\n--- 3. Testando findQuoteForTicker ---');
  const quotesMap = {
    'PETR4': { price: 38.50, changePercent: 1.2 },
    'VALE3.SA': { price: 62.00, changePercent: -0.5 },
  };

  // Busca exata
  const petrQuote = findQuoteForTicker(quotesMap, 'PETR4');
  assert(petrQuote?.price === 38.50, 'Deve encontrar PETR4 exato');

  // Case insensitive
  const petrLower = findQuoteForTicker(quotesMap, 'petr4');
  assert(petrLower?.price === 38.50, 'Deve encontrar ticker em minúsculas');

  // Fallback para .SA
  const valeQuote = findQuoteForTicker(quotesMap, 'VALE3');
  assert(valeQuote?.price === 62.00, 'Deve resolver ticker com sufixo .SA');

  // Ticker inexistente
  const notFound = findQuoteForTicker(quotesMap, 'MGLU3');
  assert(notFound === undefined, 'Ticker inexistente deve retornar undefined');

  // Ticker vazio
  assert(findQuoteForTicker(quotesMap, '') === undefined, 'Ticker vazio deve retornar undefined');
  console.log('  ✅ Resolução de cotações com fallback .SA validada com sucesso.');

  // =========================================================================
  // 4. Testes de mergeQuoteIntoAsset (mesclagem segura no ativo)
  // =========================================================================
  console.log('\n--- 4. Testando mergeQuoteIntoAsset ---');
  const baseAsset: InvestmentAsset = {
    id: 'inv-1',
    name: 'Petrobras PN',
    type: 'stock',
    ticker: 'PETR4',
    quantity: 100,
    averagePrice: 30.00,
    currentPrice: 35.00,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  // Cotação válida
  const updatedAsset = mergeQuoteIntoAsset(baseAsset, {
    price: 39.20,
    previousClose: 38.00,
    changePercent: 3.15,
    updatedAt: '2026-10-24T12:00:00Z',
  });
  assert(updatedAsset.currentPrice === 39.20, 'Preço deve ser atualizado para 39.20');
  assert(updatedAsset.previousClose === 38.00, 'previousClose deve ser 38.00');
  assert(updatedAsset.changePercent === 3.15, 'changePercent deve ser 3.15');
  assert(updatedAsset.lastPriceUpdate === '2026-10-24T12:00:00Z', 'lastPriceUpdate deve ser preservado');

  // Cotação undefined -> NÃO sobrescreve preço
  const noQuoteAsset = mergeQuoteIntoAsset(baseAsset, undefined);
  assert(noQuoteAsset.currentPrice === 35.00, 'Cotação ausente não deve alterar o preço');
  assert(noQuoteAsset === baseAsset, 'Deve retornar a mesma referência quando não há cotação');

  // Cotação com preço inválido (NaN ou não numérico) -> NÃO sobrescreve
  const invalidPriceAsset = mergeQuoteIntoAsset(baseAsset, { price: NaN });
  assert(invalidPriceAsset.currentPrice === 35.00, 'Preço NaN não deve sobrescrever');
  console.log('  ✅ Mesclagem segura de cotações no ativo validada com sucesso.');

  // =========================================================================
  // 5. Testes de buildQuoteMetadata (metadados para sync e banco)
  // =========================================================================
  console.log('\n--- 5. Testando buildQuoteMetadata ---');
  const metadata = buildQuoteMetadata(
    { previousClose: 38.00, changePercent: 1.5 },
    '2026-10-24T10:00:00Z'
  );
  assert(metadata.previousClose === 38.00, 'previousClose deve ser 38.00');
  assert(metadata.changePercent === 1.5, 'changePercent deve ser 1.5');
  assert(metadata.lastPriceUpdate === '2026-10-24T10:00:00Z', 'lastPriceUpdate deve usar timestamp existente');

  const fallbackMeta = buildQuoteMetadata({}, undefined, '2026-10-24T11:00:00Z');
  assert(fallbackMeta.previousClose === undefined, 'previousClose ausente não deve ser definido');
  assert(fallbackMeta.lastPriceUpdate === '2026-10-24T11:00:00Z', 'Deve usar fallback nowIso');
  console.log('  ✅ Geração de metadados de cotação validada com sucesso.');

  console.log('\n🎉 Todos os testes de marketQuotesPolicy passaram com sucesso!');
}

runTests().catch(err => {
  console.error('\n❌ Falha no teste marketQuotesPolicy:', err);
  process.exit(1);
});
