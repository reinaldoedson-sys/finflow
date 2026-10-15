import assert from 'node:assert';
import { calculatePortfolioMonitoring } from '../src/domain/portfolioMonitoring';
import { InvestmentAsset, InvestmentTransaction } from '../src/types/finance';

console.log('🧪 Iniciando testes do Monitor de Carteira (portfolioMonitoring)...');

const mockAssets: InvestmentAsset[] = [
  {
    id: 'asset-1',
    ticker: 'PETR4',
    name: 'Petrobras PN',
    type: 'stock',
    quantity: 100,
    averagePrice: 40.00,
    currentPrice: 50.00,
    currency: 'BRL',
    autoUpdate: true,
    sector: 'Petróleo, Gás & Biocombustíveis',
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'asset-2',
    ticker: 'VALE3',
    name: 'Vale ON',
    type: 'stock',
    quantity: 50,
    averagePrice: 60.00,
    currentPrice: 55.00,
    currency: 'BRL',
    autoUpdate: true,
    sector: 'Mineração & Siderurgia',
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'asset-3',
    ticker: 'MXRF11',
    name: 'Maxi Renda FII',
    type: 'fii',
    quantity: 200,
    averagePrice: 10.00,
    currentPrice: 10.50,
    currency: 'BRL',
    autoUpdate: true,
    sector: 'Papel / CRI',
    createdAt: '2026-01-01T00:00:00Z'
  }
];

const mockTxs: InvestmentTransaction[] = [
  {
    id: 'tx-1',
    assetId: 'asset-1',
    type: 'dividend',
    date: '2026-03-01',
    quantity: 0,
    price: 0,
    totalAmount: 150.00,
    createdAt: '2026-03-01T00:00:00Z'
  },
  {
    id: 'tx-2',
    assetId: 'asset-3',
    type: 'dividend',
    date: '2026-03-15',
    quantity: 0,
    price: 0,
    totalAmount: 40.00,
    createdAt: '2026-03-15T00:00:00Z'
  }
];

// Cálculo
const res = calculatePortfolioMonitoring(mockAssets, mockTxs, 'BRL');

// 1. Capital Investido: 100*40 + 50*60 + 200*10 = 4000 + 3000 + 2000 = 9000
assert.strictEqual(res.totalInvestedCost, 9000, `Esperado 9000 de custo, obtido ${res.totalInvestedCost}`);
console.log('✅ PASS: Capital Investido calculado com precisão (R$ 9000)');

// 2. Capital Atual: 100*50 + 50*55 + 200*10.50 = 5000 + 2750 + 2100 = 9850
assert.strictEqual(res.totalCurrentValue, 9850, `Esperado 9850 de valor atual, obtido ${res.totalCurrentValue}`);
console.log('✅ PASS: Capital Atual calculado com precisão (R$ 9850)');

// 3. Lucro Não Realizado: 9850 - 9000 = 850
assert.strictEqual(res.totalUnrealizedProfit, 850, `Esperado 850 de lucro não realizado, obtido ${res.totalUnrealizedProfit}`);
console.log('✅ PASS: Lucro Não Realizado calculado com precisão (R$ 850)');

// 4. Proventos Totais: 150 + 40 = 190
assert.strictEqual(res.totalDividends, 190, `Esperado 190 de proventos, obtido ${res.totalDividends}`);
console.log('✅ PASS: Proventos Totais calculados com precisão (R$ 190)');

// 5. Retorno Total Consolidado: 850 + 190 = 1040
assert.strictEqual(res.totalPortfolioReturn, 1040, `Esperado 1040 de retorno total, obtido ${res.totalPortfolioReturn}`);
console.log('✅ PASS: Retorno Total Consolidado calculado com precisão (R$ 1040)');

// 6. Classes
assert.strictEqual(res.classMetrics.length, 2, 'Deve conter 2 classes (stock e fii)');
const stockClass = res.classMetrics.find(c => c.type === 'stock')!;
assert.strictEqual(stockClass.count, 2, 'Deve conter 2 ações');
assert.strictEqual(stockClass.investedCost, 7000, 'Custo das ações deve ser 7000');
assert.strictEqual(stockClass.currentValue, 7750, 'Valor das ações deve ser 7750');
assert.strictEqual(stockClass.dividends, 150, 'Proventos das ações deve ser 150');
console.log('✅ PASS: Métricas por Classe de Ativo validadas');

// 7. Setores de Ações
assert.strictEqual(res.stockSectors.length, 2, 'Deve conter 2 setores de ações');
console.log('✅ PASS: Análise Setorial validada');

// 8. FIIs por Segmento
assert.strictEqual(res.fiiSegments.length, 1, 'Deve conter 1 segmento de FII');
assert.strictEqual(res.fiiSegments[0].sector, 'Papel / CRI');
console.log('✅ PASS: Segmentos de FII validados');

console.log('🎉 TODOS OS TESTES DO MONITOR DE CARTEIRA PASSARAM COM SUCESSO!');
