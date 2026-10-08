import assert from 'node:assert';
import { InvestmentAsset, InvestmentTransaction } from '../src/types/finance';
import {
  calculateInvestmentPosition,
  calculateAllInvestmentPositions,
  resolveEffectiveInvestmentPosition,
  resolveAllEffectiveInvestments,
  calculateEffectiveInvestmentValue,
  compareAssetWithLedger
} from '../src/domain/investmentPosition';
import { calculateInvestmentCost, calculateInvestmentValue } from '../src/domain/investments';

console.log('--- INICIANDO TESTES DE INTEGRAÇÃO DO INVESTMENT LEDGER (ETAPA 10.2) ---');

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

const baseAssetPETR4: InvestmentAsset = {
  id: 'inv-petr4',
  ticker: 'PETR4',
  name: 'Petrobras PN',
  type: 'stock',
  quantity: 10,
  averagePrice: 20.00,
  currentPrice: 35.00,
  currency: 'BRL',
  autoUpdate: false,
  createdAt: '2026-01-01T00:00:00Z'
};

const baseAssetVALE3: InvestmentAsset = {
  id: 'inv-vale3',
  ticker: 'VALE3',
  name: 'Vale S.A.',
  type: 'stock',
  quantity: 50,
  averagePrice: 60.00,
  currentPrice: 70.00,
  currency: 'BRL',
  autoUpdate: false,
  createdAt: '2026-01-01T00:00:00Z'
};

// =========================================================================
// TESTE A — POSIÇÃO SIMPLES
// =========================================================================
runTest('Teste A — Posição simples: BUY 10 × 20 deriva quantity=10 e averagePrice=20', () => {
  const asset: InvestmentAsset = {
    ...baseAssetPETR4,
    quantity: 10,
    averagePrice: 20.00
  };

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

  const pos = resolveEffectiveInvestmentPosition(asset, txs);

  assert.strictEqual(pos.quantity, 10, 'Quantidade derivada deve ser 10');
  assert.strictEqual(pos.averagePrice, 20.00, 'Preço médio derivado deve ser 20.00');
  assert.strictEqual(pos.totalCost, 200.00, 'Custo deve ser 200.00');
  assert.strictEqual(pos.hasLedger, true, 'Deve indicar presença de ledger');
  assert.strictEqual(pos.isLegacyFallback, false, 'Não é fallback');
});

// =========================================================================
// TESTE B — DUAS COMPRAS
// =========================================================================
runTest('Teste B — Duas compras: BUY 10 × 20 + BUY 10 × 30 deriva quantity=20 e averagePrice=25', () => {
  const asset = { ...baseAssetPETR4 };

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

  const pos = resolveEffectiveInvestmentPosition(asset, txs);

  assert.strictEqual(pos.quantity, 20, 'Quantidade derivada deve ser 20');
  assert.strictEqual(pos.averagePrice, 25.00, 'Preço médio ponderado deve ser 25.00');
  assert.strictEqual(pos.totalCost, 500.00, 'Custo total deve ser 500.00');
});

// =========================================================================
// TESTE C — APORTE EXISTENTE (PREVENÇÃO DE DUPLA CONTAGEM)
// =========================================================================
runTest('Teste C — Aporte existente: Asset.quantity=15 com ledger(10+5) deriva 15 e NUNCA 25', () => {
  // Asset armazenado foi atualizado pelo fluxo de aporte para quantity=15
  const assetUpdatedByAporte: InvestmentAsset = {
    ...baseAssetPETR4,
    quantity: 15,
    averagePrice: 22.00
  };

  // Ledger contém exatamente as duas compras que compõem o histórico
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-antiga',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-10',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-10T10:00:00Z'
    },
    {
      id: 'tx-novo-aporte',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-20',
      quantity: 5,
      price: 26.00,
      totalAmount: 130.00,
      createdAt: '2026-01-20T10:00:00Z'
    }
  ];

  const pos = resolveEffectiveInvestmentPosition(assetUpdatedByAporte, txs);

  // A posição derivada do ledger deve ser exatamente 15 (10 + 5)
  // e NUNCA 25 (10 + 15) nem 30 (15 + 15)
  assert.strictEqual(pos.quantity, 15, 'Quantidade derivada deve ser 15');
  assert.notStrictEqual(pos.quantity, 25, 'CRÍTICO: Não deve haver dupla contagem resultando em 25');
  assert.strictEqual(pos.totalBoughtQuantity, 15, 'Total comprado no histórico é 15');
});

// =========================================================================
// TESTE D — VENDA
// =========================================================================
runTest('Teste D — Venda: BUY 10 × 20 + SELL 4 × 30 deriva quantity=6 e averagePrice=20', () => {
  const asset = { ...baseAssetPETR4 };

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

  const pos = resolveEffectiveInvestmentPosition(asset, txs);

  assert.strictEqual(pos.quantity, 6, 'Quantidade remanescente deve ser 6');
  assert.strictEqual(pos.averagePrice, 20.00, 'Preço médio remanescente deve ser 20.00');
  assert.strictEqual(pos.remainingCost, 120.00, 'Custo remanescente deve ser 120.00');
  assert.strictEqual(pos.realizedProfitLoss, 40.00, 'Resultado realizado deve ser 40.00');
  assert.strictEqual(pos.totalSoldQuantity, 4, 'Quantidade vendida no histórico deve ser 4');
});

// =========================================================================
// TESTE E — INVESTIMENTO LEGADO (SEM TRANSAÇÕES NO LEDGER)
// =========================================================================
runTest('Teste E — Investimento legado: sem transações preserva a posição sem inventar transações fictícias', () => {
  const legacyAsset: InvestmentAsset = {
    ...baseAssetPETR4,
    id: 'inv-legado-antigo',
    ticker: 'LEG3',
    quantity: 10,
    averagePrice: 20.00
  };

  // Nenhuma transação registrada no ledger para este ativo
  const emptyTxs: InvestmentTransaction[] = [];

  const effectivePos = resolveEffectiveInvestmentPosition(legacyAsset, emptyTxs);

  // 1. O investimento não desaparece
  assert.strictEqual(effectivePos.quantity, 10, 'Preserva a quantidade 10 da posição cadastrada');
  assert.strictEqual(effectivePos.averagePrice, 20.00, 'Preserva o preço médio cadastrado');
  assert.strictEqual(effectivePos.totalCost, 200.00, 'Calcula o custo a partir dos dados do ativo');

  // 2. É explicitamente identificado como fallback legado
  assert.strictEqual(effectivePos.isLegacyFallback, true, 'Sinaliza isLegacyFallback=true');
  assert.strictEqual(effectivePos.hasLedger, false, 'Sinaliza hasLedger=false');
  assert.strictEqual(effectivePos.transactionsCount, 0, 'Não cria transações fictícias no ledger');

  // 3. Array de transações original permanece completamente inalterado e vazio
  assert.strictEqual(emptyTxs.length, 0, 'Nenhuma transação é criada ou adicionada');
});

// =========================================================================
// TESTE F — MÚLTIPLOS ATIVOS (SEM CONTAMINAÇÃO CRUZADA)
// =========================================================================
runTest('Teste F — Múltiplos ativos: transações de um ativo nunca contaminam a posição de outro', () => {
  const assets: InvestmentAsset[] = [baseAssetPETR4, baseAssetVALE3];

  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-petr-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-01',
      quantity: 100,
      price: 30.00,
      totalAmount: 3000.00,
      createdAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'tx-vale-1',
      assetId: 'inv-vale3',
      type: 'buy',
      date: '2026-01-02',
      quantity: 50,
      price: 60.00,
      totalAmount: 3000.00,
      createdAt: '2026-01-02T00:00:00Z'
    },
    {
      id: 'tx-petr-2',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-03',
      quantity: 50,
      price: 36.00,
      totalAmount: 1800.00,
      createdAt: '2026-01-03T00:00:00Z'
    }
  ];

  const effectiveAssets = resolveAllEffectiveInvestments(assets, txs);

  const effectivePetr = effectiveAssets.find(a => a.id === 'inv-petr4')!;
  const effectiveVale = effectiveAssets.find(a => a.id === 'inv-vale3')!;

  // PETR4: 100 cotas a 30 + 50 cotas a 36 = 150 cotas a 32.00
  assert.strictEqual(effectivePetr.quantity, 150);
  assert.strictEqual(effectivePetr.averagePrice, 32.00);

  // VALE3: 50 cotas a 60 = 50 cotas a 60.00 (não foi afetada pelas compras de PETR4)
  assert.strictEqual(effectiveVale.quantity, 50);
  assert.strictEqual(effectiveVale.averagePrice, 60.00);
});

// =========================================================================
// TESTE G — CURRENT PRICE (NÃO VEM DO LEDGER, VEM DO ASSET)
// =========================================================================
runTest('Teste G — currentPrice vem do InvestmentAsset e valor atual usa derived_quantity × currentPrice', () => {
  const assetWithMarketPrice: InvestmentAsset = {
    ...baseAssetPETR4,
    currentPrice: 42.50 // Cotação de mercado online
  };

  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-01',
      quantity: 100,
      price: 25.00, // Preço de compra histórico no ledger
      totalAmount: 2500.00,
      createdAt: '2026-01-01T00:00:00Z'
    }
  ];

  const derivedPos = resolveEffectiveInvestmentPosition(assetWithMarketPrice, txs);

  // 1. Quantidade e preço médio vieram do ledger
  assert.strictEqual(derivedPos.quantity, 100);
  assert.strictEqual(derivedPos.averagePrice, 25.00);

  // 2. currentPrice NÃO vem do ledger, vem do asset
  assert.strictEqual(assetWithMarketPrice.currentPrice, 42.50);

  // 3. Valor atual da posição = derived quantity (100) × currentPrice (42.50) = 4250.00
  const currentValue = calculateEffectiveInvestmentValue(assetWithMarketPrice, derivedPos);
  assert.strictEqual(currentValue, 4250.00, 'Valor de mercado deve ser R$ 4.250,00');
});

// =========================================================================
// TESTE H — DIVERGÊNCIA ENTRE ASSET ARMAZENADO E LEDGER
// =========================================================================
runTest('Teste H — Divergência: detecta diferença sem sobrescrever silenciosamente nem criar transações', () => {
  // Asset armazenado diz que tem 10 cotas a 20.00
  const assetWithStaleData: InvestmentAsset = {
    ...baseAssetPETR4,
    quantity: 10,
    averagePrice: 20.00
  };

  // Ledger na verdade registra 15 cotas (compras de 10 + 5)
  const txs: InvestmentTransaction[] = [
    {
      id: 'tx-1',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-01',
      quantity: 10,
      price: 20.00,
      totalAmount: 200.00,
      createdAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'tx-2',
      assetId: 'inv-petr4',
      type: 'buy',
      date: '2026-01-05',
      quantity: 5,
      price: 20.00,
      totalAmount: 100.00,
      createdAt: '2026-01-05T00:00:00Z'
    }
  ];

  const derivedPos = resolveEffectiveInvestmentPosition(assetWithStaleData, txs);

  // 1. Posição derivada é calculada corretamente a partir do ledger
  assert.strictEqual(derivedPos.quantity, 15, 'Posição derivada reflete o ledger (15 cotas)');

  // 2. Auditoria de divergência detecta a inconsistência
  const divergence = compareAssetWithLedger(assetWithStaleData, derivedPos);
  assert.strictEqual(divergence.hasDivergence, true, 'Detecta divergência');
  assert.strictEqual(divergence.storedQuantity, 10, 'Quantidade armazenada é 10');
  assert.strictEqual(divergence.derivedQuantity, 15, 'Quantidade derivada é 15');
  assert.strictEqual(divergence.quantityDiff, -5, 'Diferença de -5');

  // 3. Nenhum dado foi silenciosamente sobrescrito no objeto asset
  assert.strictEqual(assetWithStaleData.quantity, 10, 'Objeto asset original permanece inalterado');
  assert.strictEqual(txs.length, 2, 'Nenhuma transação fictícia foi criada');
});

// =========================================================================
// RESUMO FINAL
// =========================================================================
console.log('\n======================================================');
console.log(`Resultado Final dos Testes de Integração (Etapa 10.2): ${passed} passaram, ${failed} falharam.`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
