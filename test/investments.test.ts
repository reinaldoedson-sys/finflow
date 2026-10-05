import {
  calculateInvestmentCost,
  calculateInvestmentValue,
  calculateUnrealizedProfit,
  calculatePortfolioCost,
  calculatePortfolioValue,
  calculatePortfolioProfit,
  calculatePortfolioAllocation,
  calculateDailyVariation,
  getPortfolioSummaryByCurrency
} from '../src/domain/investments';
import { InvestmentAsset } from '../src/types/finance';

function createAsset(overrides: Partial<InvestmentAsset>): InvestmentAsset {
  return {
    id: `inv-${Math.random().toString(36).substring(2, 9)}`,
    ticker: 'TEST4',
    name: 'Ativo Teste',
    type: 'stock',
    quantity: 100,
    averagePrice: 20,
    currentPrice: 25,
    currency: 'BRL',
    autoUpdate: false,
    createdAt: '2026-10-01T12:00:00Z',
    ...overrides
  };
}

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

console.log('--- INICIANDO TESTES DO DOMÍNIO DE INVESTIMENTOS (ETAPA 1) ---');

// Teste A — custo: 100 unidades × R$ 20 = R$ 2.000
{
  const asset = createAsset({ quantity: 100, averagePrice: 20 });
  const cost = calculateInvestmentCost(asset);
  assert(cost === 2000, `Teste A: Custo esperado 2000, obtido: ${cost}`);
}

// Teste B — valor atual: 100 × R$ 25 = R$ 2.500
{
  const asset = createAsset({ quantity: 100, currentPrice: 25 });
  const value = calculateInvestmentValue(asset);
  assert(value === 2500, `Teste B: Valor esperado 2500, obtido: ${value}`);
}

// Teste C — lucro: R$ 2.500 - R$ 2.000 = R$ 500 (+25%)
{
  const asset = createAsset({ quantity: 100, averagePrice: 20, currentPrice: 25 });
  const { profitLoss, profitLossPercent } = calculateUnrealizedProfit(asset);
  assert(profitLoss === 500, `Teste C: Lucro esperado 500, obtido: ${profitLoss}`);
  assert(profitLossPercent === 25, `Teste C: Percentual de lucro esperado 25%, obtido: ${profitLossPercent}%`);
}

// Teste D — prejuízo: 100 × R$ 18 vs 100 × R$ 20 = -R$ 200 (-10%)
{
  const asset = createAsset({ quantity: 100, averagePrice: 20, currentPrice: 18 });
  const { profitLoss, profitLossPercent } = calculateUnrealizedProfit(asset);
  assert(profitLoss === -200, `Teste D: Prejuízo esperado -200, obtido: ${profitLoss}`);
  assert(profitLossPercent === -10, `Teste D: Percentual de prejuízo esperado -10%, obtido: ${profitLossPercent}%`);
}

// Teste E — carteira em BRL: Dois ativos BRL devem ser somados normalmente
{
  const asset1 = createAsset({ ticker: 'PETR4', quantity: 100, averagePrice: 20, currentPrice: 25, currency: 'BRL' });
  const asset2 = createAsset({ ticker: 'VALE3', quantity: 50, averagePrice: 60, currentPrice: 70, currency: 'BRL' });
  const portfolio = [asset1, asset2];

  // Custo: (100 * 20) + (50 * 60) = 2000 + 3000 = 5000
  const totalCost = calculatePortfolioCost(portfolio);
  assert(totalCost === 5000, `Teste E: Custo da carteira BRL esperado 5000, obtido: ${totalCost}`);

  // Valor: (100 * 25) + (50 * 70) = 2500 + 3500 = 6000
  const totalValue = calculatePortfolioValue(portfolio);
  assert(totalValue === 6000, `Teste E: Valor da carteira BRL esperado 6000, obtido: ${totalValue}`);

  // Lucro: 6000 - 5000 = 1000 (+20%)
  const { profitLoss, profitLossPercent } = calculatePortfolioProfit(portfolio);
  assert(profitLoss === 1000, `Teste E: Lucro da carteira BRL esperado 1000, obtido: ${profitLoss}`);
  assert(profitLossPercent === 20, `Teste E: Percentual esperado 20%, obtido: ${profitLossPercent}%`);
}

// Teste F — moedas diferentes: BRL e USD não podem ser somados diretamente
{
  const assetBrl = createAsset({ ticker: 'PETR4', quantity: 100, averagePrice: 20, currentPrice: 25, currency: 'BRL' });
  const assetUsd = createAsset({ ticker: 'AAPL', quantity: 10, averagePrice: 150, currentPrice: 200, currency: 'USD' });
  const mixedPortfolio = [assetBrl, assetUsd];

  let threwDirectSum = false;
  try {
    calculatePortfolioValue(mixedPortfolio);
  } catch (err: any) {
    threwDirectSum = true;
  }
  assert(threwDirectSum, 'Teste F: Soma direta de carteira com moedas mistas (BRL e USD) lança exceção com sucesso');

  let threwDirectCost = false;
  try {
    calculatePortfolioCost(mixedPortfolio);
  } catch (err: any) {
    threwDirectCost = true;
  }
  assert(threwDirectCost, 'Teste F: Custo direto de carteira com moedas mistas lança exceção com sucesso');

  // Consulta por moeda explícita funciona perfeitamente e isola os valores
  const brlValue = calculatePortfolioValue(mixedPortfolio, 'BRL');
  const usdValue = calculatePortfolioValue(mixedPortfolio, 'USD');
  assert(brlValue === 2500, `Teste F: Valor isolado BRL esperado 2500, obtido: ${brlValue}`);
  assert(usdValue === 2000, `Teste F: Valor isolado USD esperado 2000, obtido: ${usdValue}`);

  // Resumo por moeda segrega ambos sem misturar
  const summaryByCurrency = getPortfolioSummaryByCurrency(mixedPortfolio);
  assert(summaryByCurrency.BRL.totalValue === 2500, 'Teste F: Resumo BRL correto');
  assert(summaryByCurrency.USD.totalValue === 2000, 'Teste F: Resumo USD correto');
}

// Teste G — carteira vazia: Não pode gerar NaN, Infinity ou erro
{
  const emptyPortfolio: InvestmentAsset[] = [];
  const cost = calculatePortfolioCost(emptyPortfolio);
  const value = calculatePortfolioValue(emptyPortfolio);
  const profit = calculatePortfolioProfit(emptyPortfolio);
  const daily = calculateDailyVariation(emptyPortfolio);
  const allocation = calculatePortfolioAllocation(emptyPortfolio);

  assert(cost === 0 && !isNaN(cost), `Teste G: Custo carteira vazia é 0 (obtido: ${cost})`);
  assert(value === 0 && !isNaN(value), `Teste G: Valor carteira vazia é 0 (obtido: ${value})`);
  assert(profit.profitLoss === 0 && profit.profitLossPercent === 0, 'Teste G: Lucro carteira vazia é 0 sem NaN');
  assert(daily.variationAmount === 0 && daily.variationPercent === 0, 'Teste G: Variação diária vazia é 0 sem NaN');
  assert(Array.isArray(allocation) && allocation.length === 0, 'Teste G: Alocação carteira vazia é array vazio');
}

// Teste H — quantidade/preço zero: Não pode gerar NaN ou Infinity
{
  const zeroAsset = createAsset({ quantity: 0, averagePrice: 0, currentPrice: 0 });
  const cost = calculateInvestmentCost(zeroAsset);
  const value = calculateInvestmentValue(zeroAsset);
  const profit = calculateUnrealizedProfit(zeroAsset);

  assert(cost === 0 && Number.isFinite(cost), `Teste H: Custo com zero é 0 (obtido: ${cost})`);
  assert(value === 0 && Number.isFinite(value), `Teste H: Valor com zero é 0 (obtido: ${value})`);
  assert(profit.profitLoss === 0 && profit.profitLossPercent === 0, 'Teste H: Lucro com zero é 0 sem NaN/Infinity');
  assert(Number.isFinite(profit.profitLossPercent), 'Teste H: Percentual é número finito (não NaN nem Infinity)');
}

// Teste I — distribuição da carteira: A soma dos percentuais deve representar corretamente os ativos considerados
{
  const stockAsset = createAsset({ type: 'stock', quantity: 100, currentPrice: 50 }); // 5.000 (50%)
  const fiiAsset = createAsset({ type: 'fii', quantity: 300, currentPrice: 10 }); // 3.000 (30%)
  const cryptoAsset = createAsset({ type: 'crypto', quantity: 2, currentPrice: 1000 }); // 2.000 (20%)
  const portfolio = [stockAsset, fiiAsset, cryptoAsset]; // Total: 10.000

  const allocation = calculatePortfolioAllocation(portfolio);
  assert(allocation.length === 3, `Teste I: 3 classes alocadas (obtido: ${allocation.length})`);

  const stockAlloc = allocation.find(a => a.type === 'stock');
  const fiiAlloc = allocation.find(a => a.type === 'fii');
  const cryptoAlloc = allocation.find(a => a.type === 'crypto');

  assert(stockAlloc?.percent === 50, `Teste I: Ações com 50% (obtido: ${stockAlloc?.percent}%)`);
  assert(fiiAlloc?.percent === 30, `Teste I: FIIs com 30% (obtido: ${fiiAlloc?.percent}%)`);
  assert(cryptoAlloc?.percent === 20, `Teste I: Cripto com 20% (obtido: ${cryptoAlloc?.percent}%)`);

  const totalPercent = allocation.reduce((sum, item) => sum + item.percent, 0);
  assert(Math.round(totalPercent) === 100, `Teste I: Soma dos percentuais é exatamente 100% (obtido: ${totalPercent}%)`);
}

// Teste J — variação diária: Verificar (currentPrice - previousClose) * quantity sem erro quando previousClose estiver ausente
{
  // Ativo 1: com previousClose (25 - 20) * 100 = 500
  const assetWithPrev = createAsset({
    quantity: 100,
    currentPrice: 25,
    previousClose: 20
  });

  // Ativo 2: sem previousClose
  const assetWithoutPrev = createAsset({
    quantity: 50,
    currentPrice: 60,
    previousClose: undefined
  });

  const portfolio = [assetWithPrev, assetWithoutPrev];
  const { variationAmount, variationPercent } = calculateDailyVariation(portfolio);

  assert(variationAmount === 500, `Teste J: Variação diária calculada com sucesso ignorando previousClose ausente (esperado 500, obtido: ${variationAmount})`);
  assert(Number.isFinite(variationPercent), `Teste J: Percentual diário é número finito (obtido: ${variationPercent.toFixed(2)}%)`);
}

console.log(`\nResultado Final dos Testes de Investimentos: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
}
