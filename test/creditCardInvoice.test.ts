import { calculateCreditCardInvoice } from '../src/domain/calculations';
import { Transaction } from '../src/types/finance';

function createTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: `tx-${Math.random().toString(36).substring(2, 9)}`,
    description: 'Transação Teste',
    amount: 100,
    type: 'expense',
    categoryId: 'cat-geral',
    accountId: 'acc-1',
    creditCardId: 'card-A',
    paymentMethod: 'credit_card',
    date: '2026-10-01',
    status: 'completed',
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

console.log('--- INICIANDO TESTES DE calculateCreditCardInvoice ---');

// Teste A: Compra simples de R$ 100
{
  const tx = createTx({ amount: 100, creditCardId: 'card-A' });
  const result = calculateCreditCardInvoice('card-A', [tx]);
  assert(result === 100, `Teste A - Compra simples esperada: 100, obtida: ${result}`);
}

// Teste B: Duas compras (R$ 100 e R$ 50)
{
  const tx1 = createTx({ amount: 100, creditCardId: 'card-A' });
  const tx2 = createTx({ amount: 50, creditCardId: 'card-A' });
  const result = calculateCreditCardInvoice('card-A', [tx1, tx2]);
  assert(result === 150, `Teste B - Duas compras esperadas: 150, obtidas: ${result}`);
}

// Teste C: Compra de outro cartão (Cartão A: R$ 100, Cartão B: R$ 200)
{
  const txA = createTx({ amount: 100, creditCardId: 'card-A' });
  const txB = createTx({ amount: 200, creditCardId: 'card-B' });
  const resultA = calculateCreditCardInvoice('card-A', [txA, txB]);
  const resultB = calculateCreditCardInvoice('card-B', [txA, txB]);
  assert(resultA === 100, `Teste C - Fatura do Cartão A esperada: 100, obtida: ${resultA} (não inclui Cartão B)`);
  assert(resultB === 200, `Teste C - Fatura do Cartão B esperada: 200, obtida: ${resultB}`);
}

// Teste D: Parcelamento (R$ 1.000 em 3 parcelas: R$ 333,34 / R$ 333,33 / R$ 333,33)
{
  const p1 = createTx({
    amount: 333.34,
    creditCardId: 'card-A',
    date: '2026-10-10',
    installments: { current: 1, total: 3 }
  });
  const p2 = createTx({
    amount: 333.33,
    creditCardId: 'card-A',
    date: '2026-11-10',
    installments: { current: 2, total: 3 }
  });
  const p3 = createTx({
    amount: 333.33,
    creditCardId: 'card-A',
    date: '2026-12-10',
    installments: { current: 3, total: 3 }
  });

  const monthResult = calculateCreditCardInvoice('card-A', [p1, p2, p3], '2026-10');
  assert(
    monthResult === 333.34,
    `Teste D - Fatura do mês 2026-10 esperada: 333.34, obtida: ${monthResult} (não conta os R$ 1.000 inteiros)`
  );
}

// Teste E: Status (completed e pending)
{
  const txCompleted = createTx({ amount: 100, creditCardId: 'card-A', status: 'completed' });
  const txPending = createTx({ amount: 50, creditCardId: 'card-A', status: 'pending' });
  const result = calculateCreditCardInvoice('card-A', [txCompleted, txPending]);
  assert(
    result === 150,
    `Teste E - Status: no modelo atual despesas no cartão afetam a fatura independentemente de pending/completed (obtido: ${result})`
  );
}

// Teste F: Período mensal (não misturar meses)
{
  const txSet = createTx({ amount: 80, creditCardId: 'card-A', date: '2026-09-20' });
  const txOut = createTx({ amount: 120, creditCardId: 'card-A', date: '2026-10-05' });
  const txNov = createTx({ amount: 200, creditCardId: 'card-A', date: '2026-11-01' });

  const resSet = calculateCreditCardInvoice('card-A', [txSet, txOut, txNov], '2026-09');
  const resOut = calculateCreditCardInvoice('card-A', [txSet, txOut, txNov], '2026-10');
  const resNov = calculateCreditCardInvoice('card-A', [txSet, txOut, txNov], '2026-11');

  assert(resSet === 80, `Teste F - Setembro esperado: 80, obtido: ${resSet}`);
  assert(resOut === 120, `Teste F - Outubro esperado: 120, obtido: ${resOut}`);
  assert(resNov === 200, `Teste F - Novembro esperado: 200, obtido: ${resNov}`);
}

console.log(`\nResultado Final: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
}
