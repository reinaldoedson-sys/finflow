import assert from 'node:assert';
import { InvestmentAsset, InvestmentTransaction } from '../src/types/finance';
import {
  calculateInvestmentPosition,
  calculateAllInvestmentPositions,
  sortInvestmentTransactionsChronologically,
  InsufficientPositionError,
  DerivedInvestmentPosition
} from '../src/domain/investmentPosition';

console.log('--- INICIANDO TESTES DO MOTOR DE POSIÇÃO DE INVESTIMENTOS (ETAPA 10.1) ---');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

const mockAssetPetr4: InvestmentAsset = {
  id: 'inv-petr4',
  ticker: 'PETR4',
  name: 'Petrobras PN',
  type: 'stock',
  quantity: 100,
  averagePrice: 30.00,
  currentPrice: 38.00,
  currency: 'BRL',
  autoUpdate: false,
  createdAt: '2026-01-01T00:00:00Z'
};

const mockAssetVale3: InvestmentAsset = {
  id: 'inv-vale3',
  ticker: 'VALE3',
  name: 'Vale S.A.',
  type: 'stock',
  quantity: 50,
  averagePrice: 60.00,
  currentPrice: 65.00,
  currency: 'BRL',
  autoUpdate: false,
  createdAt: '2026-01-01T00:00:00Z'
};

// =========================================================================
// CASOS ESPECIFICADOS PELO USUÁRIO (CASOS 1 A 7)
// =========================================================================

runTest('Caso 1 — Compra única (10 cotas a R$ 20)', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 10, 'Quantidade deve ser 10');
  assert.strictEqual(pos.totalCost, 200.00, 'Custo deve ser R$ 200,00');
  assert.strictEqual(pos.remainingCost, 200.00, 'Custo remanescente deve ser R$ 200,00');
  assert.strictEqual(pos.averagePrice, 20.00, 'Preço médio deve ser R$ 20,00');
  assert.strictEqual(pos.totalBought, 200.00, 'Total comprado deve ser R$ 200,00');
  assert.strictEqual(pos.totalBoughtQuantity, 10, 'Quantidade comprada deve ser 10');
  assert.strictEqual(pos.totalSold, 0, 'Total vendido deve ser 0');
  assert.strictEqual(pos.totalSoldQuantity, 0, 'Quantidade vendida deve ser 0');
  assert.strictEqual(pos.totalDividends, 0, 'Total dividendos deve ser 0');
  assert.strictEqual(pos.realizedProfitLoss, 0, 'Resultado realizado deve ser 0');
});

runTest('Caso 2 — Duas compras (10 × R$ 20 + 10 × R$ 30)', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-15',
      quantity: 10,
      price: 30.00,
      totalAmount: 300.00,
      createdAt: '2026-01-15T10:00:00Z'
    }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 20, 'Quantidade deve ser 20');
  assert.strictEqual(pos.totalCost, 500.00, 'Custo deve ser R$ 500,00');
  assert.strictEqual(pos.averagePrice, 25.00, 'Preço médio ponderado deve ser R$ 25,00');
  assert.strictEqual(pos.totalBought, 500.00, 'Total comprado deve ser R$ 500,00');
  assert.strictEqual(pos.totalBoughtQuantity, 20, 'Quantidade total comprada deve ser 20');
});

runTest('Caso 3 — Compra + venda (10 × R$ 20, venda de 4 × R$ 30)', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'sell',
      date: '2026-01-20',
      quantity: 4,
      price: 30.00,
      totalAmount: 120.00,
      createdAt: '2026-01-20T10:00:00Z'
    }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 6, 'Quantidade restante deve ser 6');
  assert.strictEqual(pos.totalCost, 120.00, 'Custo remanescente deve ser R$ 120,00');
  assert.strictEqual(pos.remainingCost, 120.00, 'remainingCost deve ser R$ 120,00');
  assert.strictEqual(pos.averagePrice, 20.00, 'Preço médio remanescente deve continuar R$ 20,00');
  assert.strictEqual(pos.realizedProfitLoss, 40.00, 'Resultado realizado deve ser R$ 40,00 (120 - 80)');
  assert.strictEqual(pos.realizedProfit, 40.00, 'Alias realizedProfit deve ser R$ 40,00');
  assert.strictEqual(pos.totalSold, 120.00, 'Total vendido deve ser R$ 120,00');
  assert.strictEqual(pos.totalSoldQuantity, 4, 'Quantidade vendida deve ser 4');
});

runTest('Caso 4 — Venda parcial depois de compras diferentes (10 × R$ 20 + 10 × R$ 30, venda 5 × R$ 40)', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-15',
      quantity: 10,
      price: 30.00,
      totalAmount: 300.00,
      createdAt: '2026-01-15T10:00:00Z'
    },
    {
      id: 'tx-3',
      assetId: 'inv-petr4',
      type: 'sell',
      date: '2026-01-25',
      quantity: 5,
      price: 40.00,
      totalAmount: 200.00,
      createdAt: '2026-01-25T10:00:00Z'
    }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 15, 'Quantidade remanescente deve ser 15');
  assert.strictEqual(pos.totalCost, 375.00, 'Custo remanescente deve ser R$ 375,00');
  assert.strictEqual(pos.averagePrice, 25.00, 'Preço médio deve continuar R$ 25,00');
  assert.strictEqual(pos.realizedProfitLoss, 75.00, 'Resultado realizado deve ser R$ 75,00 (200 - 125)');
});

runTest('Caso 5 — Dividendos (BUY 10 × R$ 20 + DIVIDEND R$ 15)', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'dividend',
      date: '2026-01-18',
      quantity: 0,
      price: 0,
      totalAmount: 15.00,
      createdAt: '2026-01-18T10:00:00Z'
    }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 10, 'Quantidade não deve mudar com provento');
  assert.strictEqual(pos.totalCost, 200.00, 'Custo não deve mudar');
  assert.strictEqual(pos.averagePrice, 20.00, 'Preço médio não deve mudar');
  assert.strictEqual(pos.totalDividends, 15.00, 'Total de dividendos acumulado deve ser R$ 15,00');
  assert.strictEqual(pos.realizedProfitLoss, 0, 'Resultado de venda deve ser 0');
});

runTest('Caso 6 — Venda total (BUY 10 × R$ 20 + SELL 10 × R$ 30)', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'sell',
      date: '2026-01-20',
      quantity: 10,
      price: 30.00,
      totalAmount: 300.00,
      createdAt: '2026-01-20T10:00:00Z'
    }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 0, 'Quantidade deve zerar');
  assert.strictEqual(pos.totalCost, 0, 'Custo remanescente deve zerar exatamente');
  assert.strictEqual(pos.remainingCost, 0, 'remainingCost deve ser 0');
  assert.strictEqual(pos.averagePrice, 0, 'Preço médio de posição zerada deve ser 0');
  assert.strictEqual(pos.realizedProfitLoss, 100.00, 'Resultado realizado deve ser R$ 100,00 (300 - 200)');
  assert.strictEqual(pos.totalSoldQuantity, 10, 'Total vendido deve ser 10');
  assert.strictEqual(pos.totalSold, 300.00, 'Total financeiro vendido deve ser R$ 300,00');
});

runTest('Caso 7 — Venda inválida lança InsufficientPositionError', () => {
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'sell',
      date: '2026-01-20',
      quantity: 15, // Tentativa de vender 15 tendo apenas 10
      price: 30.00,
      totalAmount: 450.00,
      createdAt: '2026-01-20T10:00:00Z'
    }
  ];

  let thrownError: any = null;
  try {
    calculateInvestmentPosition(mockAssetPetr4, txs);
  } catch (err) {
    thrownError = err;
  }

  assert(thrownError instanceof InsufficientPositionError, 'Deve lançar InsufficientPositionError');
  assert(thrownError.message.includes('quantidade solicitada para venda (15) é maior que a posição disponível (10)'));
  assert.strictEqual(thrownError.availableQuantity, 10);
  assert.strictEqual(thrownError.requestedQuantity, 15);
  assert.strictEqual(thrownError.assetId, 'inv-petr4');
});

// =========================================================================
// TESTES ADICIONAIS DE CASOS DE BORDA, FRAÇÕES E PRECISÃO MONETÁRIA
// =========================================================================

runTest('Caso 8 — Múltiplas compras com preços variados', () => {
  const txs: InvestmentTransaction[] = [
    { id: 't1', assetId: 'inv-petr4', type: 'buy', date: '2026-01-01', quantity: 100, price: 10.00, totalAmount: 1000.00, createdAt: '2026-01-01T00:00:00Z' },
    { id: 't2', assetId: 'inv-petr4', type: 'buy', date: '2026-01-02', quantity: 50, price: 12.00, totalAmount: 600.00, createdAt: '2026-01-02T00:00:00Z' },
    { id: 't3', assetId: 'inv-petr4', type: 'buy', date: '2026-01-03', quantity: 50, price: 16.00, totalAmount: 800.00, createdAt: '2026-01-03T00:00:00Z' }
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  // Total: 1000 + 600 + 800 = 2400 / 200 cotas = 12.00 preço médio
  assert.strictEqual(pos.quantity, 200);
  assert.strictEqual(pos.totalCost, 2400.00);
  assert.strictEqual(pos.averagePrice, 12.00);
  assert.strictEqual(pos.totalBought, 2400.00);
});

runTest('Caso 9 — Compras e vendas com valores fracionários (cripto/frações)', () => {
  const cryptoAsset: InvestmentAsset = {
    ...mockAssetPetr4,
    id: 'inv-btc',
    ticker: 'BTC',
    type: 'crypto'
  };

  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-b1',
      assetId: 'inv-btc',
      type: 'buy',
      date: '2026-01-01',
      quantity: 0.5,
      price: 300000.00,
      totalAmount: 150000.00,
      createdAt: '2026-01-01T10:00:00Z'
    },
    {
      id: 'tx-b2',
      assetId: 'inv-btc',
      type: 'buy',
      date: '2026-01-05',
      quantity: 0.25,
      price: 360000.00,
      totalAmount: 90000.00,
      createdAt: '2026-01-05T10:00:00Z'
    },
    {
      id: 'tx-s1',
      assetId: 'inv-btc',
      type: 'sell',
      date: '2026-01-10',
      quantity: 0.25,
      price: 400000.00,
      totalAmount: 100000.00,
      createdAt: '2026-01-10T10:00:00Z'
    }
  ];

  // Total inicial: 0.75 BTC por R$ 240.000 (preço médio = 320.000)
  // Venda: 0.25 BTC (1/3 da posição):
  // Custo vendido: 240.000 / 3 = 80.000
  // Lucro realizado: 100.000 - 80.000 = 20.000
  // Posição restante: 0.5 BTC, custo 160.000, preço médio 320.000
  const pos = calculateInvestmentPosition(cryptoAsset, txs);

  assert.strictEqual(pos.quantity, 0.5);
  assert.strictEqual(pos.totalCost, 160000.00);
  assert.strictEqual(pos.averagePrice, 320000.00);
  assert.strictEqual(pos.realizedProfitLoss, 20000.00);
  assert.strictEqual(pos.totalBoughtQuantity, 0.75);
  assert.strictEqual(pos.totalSoldQuantity, 0.25);
});

runTest('Caso 10 — Sequência complexa BUY → BUY → SELL → DIVIDEND → BUY', () => {
  const txs: InvestmentTransaction[] = [
    { id: 't1', assetId: 'inv-petr4', type: 'buy', date: '2026-01-01', quantity: 100, price: 10.00, totalAmount: 1000.00, createdAt: '2026-01-01T00:00:00Z' },
    { id: 't2', assetId: 'inv-petr4', type: 'buy', date: '2026-01-05', quantity: 50, price: 16.00, totalAmount: 800.00, createdAt: '2026-01-05T00:00:00Z' },
    // Estado: 150 cotas a PM 12.00 (custo 1800)
    { id: 't3', assetId: 'inv-petr4', type: 'sell', date: '2026-01-10', quantity: 50, price: 20.00, totalAmount: 1000.00, createdAt: '2026-01-10T00:00:00Z' },
    // Custo vendido: 50 * 12 = 600. Lucro: 1000 - 600 = 400. Resta: 100 cotas a PM 12 (custo 1200)
    { id: 't4', assetId: 'inv-petr4', type: 'dividend', date: '2026-01-15', quantity: 0, price: 0, totalAmount: 50.00, createdAt: '2026-01-15T00:00:00Z' },
    // Dividendos: 50. Posição inalterada
    { id: 't5', assetId: 'inv-petr4', type: 'buy', date: '2026-01-20', quantity: 100, price: 15.00, totalAmount: 1500.00, createdAt: '2026-01-20T00:00:00Z' }
    // Novo aporte: 100 cotas a 15 (1500). Novo custo: 1200 + 1500 = 2700 / 200 = PM 13.50
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 200, 'Quantidade final deve ser 200');
  assert.strictEqual(pos.totalCost, 2700.00, 'Custo final deve ser 2700.00');
  assert.strictEqual(pos.averagePrice, 13.50, 'Preço médio final deve ser 13.50');
  assert.strictEqual(pos.totalDividends, 50.00, 'Total de dividendos acumulado deve ser 50.00');
  assert.strictEqual(pos.realizedProfitLoss, 400.00, 'Lucro realizado acumulado deve ser 400.00');
  assert.strictEqual(pos.totalBought, 3300.00, 'Total comprado deve ser 3300.00 (1000 + 800 + 1500)');
  assert.strictEqual(pos.totalSold, 1000.00, 'Total vendido deve ser 1000.00');
});

runTest('Caso 11 — Precisão em centavos pequenos (R$ 0,01)', () => {
  const pennyAsset: InvestmentAsset = {
    ...mockAssetPetr4,
    id: 'inv-penny',
    ticker: 'PNY'
  };

  const txs: InvestmentTransaction[] = [
    { id: 'p1', assetId: 'inv-penny', type: 'buy', date: '2026-01-01', quantity: 100, price: 0.01, totalAmount: 1.00, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'p2', assetId: 'inv-penny', type: 'sell', date: '2026-01-02', quantity: 50, price: 0.02, totalAmount: 1.00, createdAt: '2026-01-02T00:00:00Z' }
  ];

  const pos = calculateInvestmentPosition(pennyAsset, txs);

  assert.strictEqual(pos.quantity, 50);
  assert.strictEqual(pos.totalCost, 0.50);
  assert.strictEqual(pos.averagePrice, 0.01);
  assert.strictEqual(pos.realizedProfitLoss, 0.50);
});

runTest('Caso 12 — Venda com prejuízo realizado (resultado negativo)', () => {
  const txs: InvestmentTransaction[] = [
    { id: 'tx-1', assetId: 'inv-petr4', type: 'buy', date: '2026-01-01', quantity: 10, price: 50.00, totalAmount: 500.00, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'tx-2', assetId: 'inv-petr4', type: 'sell', date: '2026-01-05', quantity: 5, price: 30.00, totalAmount: 150.00, createdAt: '2026-01-05T00:00:00Z' }
  ];

  // Custo vendido: 5 * 50 = 250. Receita: 150. Prejuízo: 150 - 250 = -100
  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 5);
  assert.strictEqual(pos.totalCost, 250.00);
  assert.strictEqual(pos.averagePrice, 50.00);
  assert.strictEqual(pos.realizedProfitLoss, -100.00, 'Prejuízo de R$ 100,00 registrado como -100.00');
});

runTest('Caso 13 — Liquidação total e recompra posterior (ciclo completo)', () => {
  const txs: InvestmentTransaction[] = [
    { id: 't1', assetId: 'inv-petr4', type: 'buy', date: '2026-01-01', quantity: 10, price: 20.00, totalAmount: 200.00, createdAt: '2026-01-01T00:00:00Z' },
    { id: 't2', assetId: 'inv-petr4', type: 'sell', date: '2026-01-02', quantity: 10, price: 25.00, totalAmount: 250.00, createdAt: '2026-01-02T00:00:00Z' },
    // Zerado. Lucro = 50
    { id: 't3', assetId: 'inv-petr4', type: 'buy', date: '2026-01-03', quantity: 5, price: 30.00, totalAmount: 150.00, createdAt: '2026-01-03T00:00:00Z' }
    // Nova posição: 5 a PM 30.00 (custo 150)
  ];

  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 5);
  assert.strictEqual(pos.totalCost, 150.00);
  assert.strictEqual(pos.averagePrice, 30.00);
  assert.strictEqual(pos.realizedProfitLoss, 50.00, 'Lucro anterior preservado');
  assert.strictEqual(pos.totalBought, 350.00);
  assert.strictEqual(pos.totalSold, 250.00);
});

runTest('Caso 14 — Ordenação cronológica determinística (date -> createdAt -> id)', () => {
  // Transações passadas de forma desordenada
  const txs: InvestmentTransaction[] = [
    { id: 'c-last', assetId: 'inv-petr4', type: 'sell', date: '2026-01-20', quantity: 5, price: 40.00, totalAmount: 200.00, createdAt: '2026-01-20T10:00:00Z' },
    { id: 'a-first', assetId: 'inv-petr4', type: 'buy', date: '2026-01-10', quantity: 10, price: 20.00, totalAmount: 200.00, createdAt: '2026-01-10T10:00:00Z' },
    { id: 'b-second', assetId: 'inv-petr4', type: 'buy', date: '2026-01-15', quantity: 10, price: 30.00, totalAmount: 300.00, createdAt: '2026-01-15T10:00:00Z' }
  ];

  // Se a ordenação falhasse e executasse c-last primeiro (venda de 5 sem compra prévia), lançaria InsufficientPositionError.
  const pos = calculateInvestmentPosition(mockAssetPetr4, txs);

  assert.strictEqual(pos.quantity, 15);
  assert.strictEqual(pos.totalCost, 375.00);
  assert.strictEqual(pos.averagePrice, 25.00);
  assert.strictEqual(pos.realizedProfitLoss, 75.00);
});

runTest('Caso 15 — Função é pura e não causa efeitos colaterais nos objetos de entrada', () => {
  const assetCopy = { ...mockAssetPetr4 };
  const tx1: InvestmentTransaction = {
    id: 'tx-pure-1',
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-01-10',
    quantity: 10,
    price: 20.00,
    totalAmount: 200.00,
    createdAt: '2026-01-10T10:00:00Z'
  };
  const tx2: InvestmentTransaction = {
    id: 'tx-pure-2',
    assetId: 'inv-petr4',
    type: 'sell',
    date: '2026-01-20',
    quantity: 4,
    price: 30.00,
    totalAmount: 120.00,
    createdAt: '2026-01-20T10:00:00Z'
  };

  const inputList = [tx2, tx1]; // Ordem invertida propositalmente
  const inputListCopy = [...inputList];

  calculateInvestmentPosition(assetCopy, inputList);

  // 1. Array de entrada não teve ordem modificada
  assert.strictEqual(inputList[0].id, inputListCopy[0].id);
  assert.strictEqual(inputList[1].id, inputListCopy[1].id);

  // 2. Objetos de transação originais não foram mutados
  assert.strictEqual(tx1.quantity, 10);
  assert.strictEqual(tx1.price, 20.00);
  assert.strictEqual(tx2.quantity, 4);
  assert.strictEqual(tx2.price, 30.00);

  // 3. Objeto asset original permaneceu estritamente intocado
  assert.strictEqual(assetCopy.quantity, mockAssetPetr4.quantity);
  assert.strictEqual(assetCopy.averagePrice, mockAssetPetr4.averagePrice);
});

runTest('Caso 16 — Histórico vazio retorna posição zerada sem erros', () => {
  const pos = calculateInvestmentPosition(mockAssetPetr4, []);

  assert.strictEqual(pos.quantity, 0);
  assert.strictEqual(pos.totalCost, 0);
  assert.strictEqual(pos.remainingCost, 0);
  assert.strictEqual(pos.averagePrice, 0);
  assert.strictEqual(pos.totalBought, 0);
  assert.strictEqual(pos.totalSold, 0);
  assert.strictEqual(pos.totalDividends, 0);
  assert.strictEqual(pos.realizedProfitLoss, 0);
  assert.strictEqual(pos.transactionsCount, 0);
});

runTest('Caso 17 — calculateAllInvestmentPositions segrega corretamente por ativo', () => {
  const txs: InvestmentTransaction[] = [
    { id: 'p1', assetId: 'inv-petr4', type: 'buy', date: '2026-01-01', quantity: 10, price: 20.00, totalAmount: 200.00, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'v1', assetId: 'inv-vale3', type: 'buy', date: '2026-01-02', quantity: 20, price: 50.00, totalAmount: 1000.00, createdAt: '2026-01-02T00:00:00Z' },
    { id: 'p2', assetId: 'inv-petr4', type: 'sell', date: '2026-01-03', quantity: 4, price: 30.00, totalAmount: 120.00, createdAt: '2026-01-03T00:00:00Z' }
  ];

  const map = calculateAllInvestmentPositions([mockAssetPetr4, mockAssetVale3], txs);

  assert(map.has('inv-petr4'));
  assert(map.has('inv-vale3'));

  const posPetr = map.get('inv-petr4')!;
  assert.strictEqual(posPetr.quantity, 6);
  assert.strictEqual(posPetr.totalCost, 120.00);
  assert.strictEqual(posPetr.realizedProfitLoss, 40.00);

  const posVale = map.get('inv-vale3')!;
  assert.strictEqual(posVale.quantity, 20);
  assert.strictEqual(posVale.totalCost, 1000.00);
  assert.strictEqual(posVale.averagePrice, 50.00);
  assert.strictEqual(posVale.realizedProfitLoss, 0);
});

// =========================================================================
// RESUMO FINAL
// =========================================================================
console.log('\n======================================================');
console.log(`Resultado Final dos Testes do Motor de Posição (Etapa 10.1): ${passed} passaram, ${failed} falharam.`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
