import { calculateAccountBalance, calculateCreditCardInvoice } from '../src/domain/calculations';
import { addMoney } from '../src/domain/money';
import { Transaction, Account, CreditCard, FinancialGoal } from '../src/types/finance';

function createTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: `tx-${Math.random().toString(36).substring(2, 9)}`,
    description: 'Transação Teste',
    amount: 100,
    type: 'expense',
    categoryId: 'cat-geral',
    accountId: 'acc-1',
    paymentMethod: 'pix',
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

console.log('--- INICIANDO TESTES DE CAMPOS DERIVADOS E FONTE ÚNICA DA VERDADE ---');

// 1. Contas: Saldo derivado dinamicamente das transações concluídas
{
  const account: Account = {
    id: 'acc-test',
    name: 'Conta Corrente',
    type: 'checking',
    bankName: 'Banco Teste',
    color: '#00ff00',
    initialBalance: 1000,
    currentBalance: 9999, // Valor persistido defasado/antigo
    icon: 'Wallet'
  };

  const tx1 = createTx({ amount: 200, type: 'expense', accountId: 'acc-test', status: 'completed' });
  const tx2 = createTx({ amount: 500, type: 'income', accountId: 'acc-test', status: 'completed' });
  const txPending = createTx({ amount: 150, type: 'expense', accountId: 'acc-test', status: 'pending' });

  // O saldo real deve ser 1000 - 200 + 500 = 1300 (ignorando o currentBalance persistido de 9999 e a pendente de 150)
  const derivedBalance = calculateAccountBalance(account.initialBalance, account.id, [tx1, tx2, txPending]);
  assert(
    derivedBalance === 1300,
    `Conta: Saldo calculado deriva das transações (esperado: 1300, obtido: ${derivedBalance}) e ignora snapshot antigo (9999)`
  );
}

// 2. Contas Legadas: Documento antigo sem initialBalance faz fallback seguro para o currentBalance legado
{
  const legacyDoc = {
    id: 'acc-legacy',
    name: 'Conta Legada',
    type: 'checking' as const,
    bankName: 'Banco Antigo',
    color: '#0000ff',
    currentBalance: 800, // Antigo campo persistido
    icon: 'Wallet'
  };

  const initial = typeof (legacyDoc as any).initialBalance === 'number'
    ? (legacyDoc as any).initialBalance
    : (typeof legacyDoc.currentBalance === 'number' ? legacyDoc.currentBalance : 0);

  const tx = createTx({ amount: 100, type: 'expense', accountId: 'acc-legacy', status: 'completed' });
  const derived = calculateAccountBalance(initial, legacyDoc.id, [tx]);
  assert(
    derived === 700,
    `Conta Legada: Fallback de compatibilidade retroativa utilizou currentBalance como baseline (esperado: 700, obtido: ${derived})`
  );
}

// 3. Cartões: Fatura/Dívida derivada dinamicamente das despesas do cartão
{
  const card: CreditCard = {
    id: 'card-test',
    name: 'Cartão Teste',
    bankName: 'Banco Teste',
    color: '#ff0000',
    limit: 5000,
    closingDay: 25,
    dueDay: 5,
    currentInvoice: 0 // No Firestore fica 0 ou desatualizado
  };

  const tx1 = createTx({ amount: 350, type: 'expense', creditCardId: 'card-test', paymentMethod: 'credit_card' });
  const tx2 = createTx({ amount: 150, type: 'expense', creditCardId: 'card-test', paymentMethod: 'credit_card' });

  const derivedInvoice = calculateCreditCardInvoice(card.id, [tx1, tx2]);
  assert(
    derivedInvoice === 500,
    `Cartão: Fatura calculada deriva das despesas do cartão (esperado: 500, obtido: ${derivedInvoice}) e ignora o 0 persistido`
  );
}

// 4. Metas: currentAmount opera como acumulador persistido (Categoria C)
{
  const goal: FinancialGoal = {
    id: 'goal-test',
    name: 'Reserva Teste',
    targetAmount: 5000,
    currentAmount: 1200,
    targetDate: '2026-12-31',
    color: '#10b981',
    icon: 'ShieldCheck'
  };

  // Simulação de depósito de R$ 300
  const afterDeposit = Math.max(0, addMoney(goal.currentAmount, 300));
  assert(
    afterDeposit === 1500,
    `Meta: Depósito incrementa o acumulador persistido (1200 + 300 = ${afterDeposit})`
  );

  // Simulação de resgate de R$ 500
  const afterWithdraw = Math.max(0, addMoney(afterDeposit, -500));
  assert(
    afterWithdraw === 1000,
    `Meta: Resgate decrementa o acumulador persistido (1500 - 500 = ${afterWithdraw})`
  );
}

console.log(`\nResultado Final: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
}
