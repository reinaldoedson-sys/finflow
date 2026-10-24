import {
  computeAccounts,
  computeCreditCards,
  computeGoals,
  computeInvestmentPositions,
  computeEffectiveInvestments,
  computeMonthlySummary,
  computeFutureCommitments,
} from '../src/domain/aggregates';
import {
  Account,
  CreditCard,
  FinancialGoal,
  GoalMovement,
  InvestmentAsset,
  InvestmentTransaction,
  Transaction,
} from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function assertClose(actual: number, expected: number, message: string, tolerance = 0.001) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`TEST FAILED: ${message}. Esperado: ${expected}, Obtido: ${actual}`);
  }
}

async function runCharacterizationTests() {
  console.log('🧪 Iniciando teste de caracterização dos derivados financeiros (financeDerivedCharacterization)...');

  // =========================================================================
  // Dados Fixos e Realistas de Teste
  // =========================================================================
  const accounts: Account[] = [
    { id: 'acc-checking', name: 'Conta Corrente Inter', type: 'checking', bankName: 'Banco Inter', initialBalance: 5000, currentBalance: 0, color: '#10b981', icon: 'Wallet' },
    { id: 'acc-savings', name: 'Reserva Poupança', type: 'savings', bankName: 'Nubank', initialBalance: 12000, currentBalance: 0, color: '#3b82f6', icon: 'PiggyBank' },
  ];

  const creditCards: CreditCard[] = [
    { id: 'card-nubank', name: 'Nubank Ultravioleta', bankName: 'Nubank', limit: 8000, closingDay: 25, dueDay: 5, color: '#8b5cf6', currentInvoice: 0 },
    { id: 'card-visa', name: 'Visa Infinite', bankName: 'Bradesco', limit: 5000, closingDay: 15, dueDay: 25, color: '#f59e0b', currentInvoice: 0 },
  ];

  const goals: FinancialGoal[] = [
    { id: 'goal-car', name: 'Carro Novo', targetAmount: 50000, initialAmount: 10000, currentAmount: 0, targetDate: '2027-12-31', color: '#10b981', icon: 'Car' },
    { id: 'goal-trip', name: 'Viagem Europa', targetAmount: 15000, initialAmount: 2000, currentAmount: 0, targetDate: '2026-11-30', color: '#06b6d4', icon: 'Plane' },
  ];

  const goalMovements: GoalMovement[] = [
    { id: 'gm-1', goalId: 'goal-car', amount: 3000, type: 'deposit', date: '2026-01-15', createdAt: '2026-01-15T10:00:00Z' },
    { id: 'gm-2', goalId: 'goal-car', amount: 500, type: 'withdrawal', date: '2026-02-10', createdAt: '2026-02-10T10:00:00Z' },
    { id: 'gm-3', goalId: 'goal-trip', amount: 1500, type: 'deposit', date: '2026-02-15', createdAt: '2026-02-15T10:00:00Z' },
  ];

  const investments: InvestmentAsset[] = [
    { id: 'inv-petr', name: 'Petrobras PN', type: 'stock', ticker: 'PETR4', quantity: 100, averagePrice: 30, currentPrice: 36, currency: 'BRL', autoUpdate: true, createdAt: '2026-01-01' },
    { id: 'inv-vale', name: 'Vale ON', type: 'stock', ticker: 'VALE3', quantity: 50, averagePrice: 60, currentPrice: 65, currency: 'BRL', autoUpdate: true, createdAt: '2026-01-01' },
  ];

  const investmentTransactions: InvestmentTransaction[] = [
    { id: 'itx-1', assetId: 'inv-petr', type: 'buy', quantity: 100, price: 30, totalAmount: 3000, date: '2026-01-10', createdAt: '2026-01-10T10:00:00Z' },
    { id: 'itx-2', assetId: 'inv-petr', type: 'dividend', quantity: 0, price: 0, totalAmount: 120, date: '2026-02-15', createdAt: '2026-02-15T10:00:00Z' },
    { id: 'itx-3', assetId: 'inv-vale', type: 'buy', quantity: 80, price: 60, totalAmount: 4800, date: '2026-01-12', createdAt: '2026-01-12T10:00:00Z' },
    { id: 'itx-4', assetId: 'inv-vale', type: 'sell', quantity: 30, price: 70, totalAmount: 2100, date: '2026-02-20', createdAt: '2026-02-20T10:00:00Z' },
  ];

  const transactions: Transaction[] = [
    // Fevereiro 2026
    { id: 'tx-prev-1', description: 'Salário Fevereiro', amount: 5000, type: 'income', categoryId: 'cat-sal', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-02-05', status: 'completed', createdAt: '2026-02-05' },
    { id: 'tx-prev-2', description: 'Aluguel Fevereiro', amount: 1500, type: 'expense', categoryId: 'cat-moradia', accountId: 'acc-checking', paymentMethod: 'transfer', date: '2026-02-08', status: 'completed', createdAt: '2026-02-08' },
    // Março 2026 (Mês Selecionado)
    { id: 'tx-1', description: 'Salário Março', amount: 6000, type: 'income', categoryId: 'cat-sal', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-03-05', status: 'completed', createdAt: '2026-03-05' },
    { id: 'tx-2', description: 'Freelance Design', amount: 1200, type: 'income', categoryId: 'cat-extra', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-03-25', status: 'pending', createdAt: '2026-03-25' },
    { id: 'tx-3', description: 'Aluguel Março', amount: 1500, type: 'expense', categoryId: 'cat-moradia', accountId: 'acc-checking', paymentMethod: 'transfer', date: '2026-03-08', status: 'completed', createdAt: '2026-03-08' },
    { id: 'tx-4', description: 'Supermercado Mensal', amount: 800, type: 'expense', categoryId: 'cat-mercado', accountId: 'acc-checking', creditCardId: 'card-nubank', paymentMethod: 'credit_card', date: '2026-03-10', status: 'completed', createdAt: '2026-03-10' },
    { id: 'tx-5', description: 'Restaurante Fim de Semana', amount: 450, type: 'expense', categoryId: 'cat-alimentacao', accountId: 'acc-checking', creditCardId: 'card-nubank', paymentMethod: 'credit_card', date: '2026-03-12', status: 'completed', createdAt: '2026-03-12' },
    { id: 'tx-6', description: 'Combustível', amount: 320, type: 'expense', categoryId: 'cat-transporte', accountId: 'acc-checking', creditCardId: 'card-visa', paymentMethod: 'credit_card', date: '2026-03-14', status: 'completed', createdAt: '2026-03-14' },
    { id: 'tx-7', description: 'Transferência para Poupança', amount: 1000, type: 'transfer', categoryId: 'cat-transf', accountId: 'acc-checking', targetAccountId: 'acc-savings', paymentMethod: 'transfer', date: '2026-03-15', status: 'completed', createdAt: '2026-03-15' },
    { id: 'tx-8', description: 'Conta de Energia', amount: 250, type: 'expense', categoryId: 'cat-contas', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-03-28', status: 'pending', createdAt: '2026-03-28' },
    // Recorrentes e parcelamentos
    { id: 'tx-rec', description: 'Assinatura Streaming', amount: 55, type: 'expense', categoryId: 'cat-servicos', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-03-01', status: 'completed', isRecurring: true, createdAt: '2026-03-01' },
    { id: 'tx-p1', description: 'Notebook (1/3)', amount: 600, type: 'expense', categoryId: 'cat-equip', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-03-15', status: 'completed', installmentPlanId: 'plan-nb', createdAt: '2026-03-15' },
    { id: 'tx-p2', description: 'Notebook (2/3)', amount: 600, type: 'expense', categoryId: 'cat-equip', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-04-15', status: 'pending', installmentPlanId: 'plan-nb', createdAt: '2026-03-15' },
    { id: 'tx-p3', description: 'Notebook (3/3)', amount: 600, type: 'expense', categoryId: 'cat-equip', accountId: 'acc-checking', paymentMethod: 'pix', date: '2026-05-15', status: 'pending', installmentPlanId: 'plan-nb', createdAt: '2026-03-15' },
  ];

  const selectedMonth = '2026-03';

  // =========================================================================
  // 1. Caracterização: Contas Bancárias (computeAccounts)
  // =========================================================================
  console.log('\n--- 1. Validando computeAccounts ---');
  const computedAccs = computeAccounts(accounts, transactions);
  const checking = computedAccs.find(a => a.id === 'acc-checking');
  const savings = computedAccs.find(a => a.id === 'acc-savings');

  assert(checking !== undefined, 'Conta corrente deve existir');
  assertClose(checking!.currentBalance, 11345, 'Saldo da conta corrente deve ser exatamente 11.345,00');
  assert(savings !== undefined, 'Poupança deve existir');
  assertClose(savings!.currentBalance, 13000, 'Saldo da poupança deve ser exatamente 13.000,00');
  console.log('  ✅ Saldos computados das contas conferidos com sucesso.');

  // =========================================================================
  // 2. Caracterização: Cartões de Crédito (computeCreditCards)
  // =========================================================================
  console.log('\n--- 2. Validando computeCreditCards ---');
  const computedCards = computeCreditCards(creditCards, transactions);
  const nubank = computedCards.find(c => c.id === 'card-nubank');
  const visa = computedCards.find(c => c.id === 'card-visa');

  assert(nubank !== undefined, 'Cartão Nubank deve existir');
  assertClose(nubank!.currentInvoice, 1250, 'Fatura do Nubank deve ser exatamente 1.250,00 (800 + 450)');
  assert(visa !== undefined, 'Cartão Visa deve existir');
  assertClose(visa!.currentInvoice, 320, 'Fatura do Visa deve ser exatamente 320,00');
  console.log('  ✅ Faturas computadas dos cartões conferidas com sucesso.');

  // =========================================================================
  // 3. Caracterização: Metas Financeiras (computeGoals)
  // =========================================================================
  console.log('\n--- 3. Validando computeGoals ---');
  const computedGs = computeGoals(goals, goalMovements);
  const carGoal = computedGs.find(g => g.id === 'goal-car');
  const tripGoal = computedGs.find(g => g.id === 'goal-trip');

  assert(carGoal !== undefined, 'Meta do carro deve existir');
  assertClose(carGoal!.currentAmount, 12500, 'Valor acumulado da meta do carro deve ser 12.500,00 (10000 + 3000 - 500)');
  assert(tripGoal !== undefined, 'Meta da viagem deve existir');
  assertClose(tripGoal!.currentAmount, 3500, 'Valor acumulado da meta da viagem deve ser 3.500,00 (2000 + 1500)');
  console.log('  ✅ Valores acumulados das metas conferidos com sucesso.');

  // =========================================================================
  // 4. Caracterização: Posições e Ativos de Investimento
  // =========================================================================
  console.log('\n--- 4. Validando computeInvestmentPositions e computeEffectiveInvestments ---');
  const positions = computeInvestmentPositions(investments, investmentTransactions);
  const petrPos = positions['inv-petr'];
  const valePos = positions['inv-vale'];

  assert(petrPos !== undefined, 'Posição PETR4 deve existir');
  assert(petrPos.quantity === 100, 'Quantidade PETR4 deve ser 100');
  assertClose(petrPos.averagePrice, 30, 'Preço médio PETR4 deve ser 30');
  assertClose(petrPos.remainingCost, 3000, 'Custo remanescente PETR4 deve ser 3000');
  assertClose(petrPos.realizedProfit, 0, 'Lucro realizado PETR4 deve ser 0');

  assert(valePos !== undefined, 'Posição VALE3 deve existir');
  assert(valePos.quantity === 50, 'Quantidade VALE3 deve ser 50 (80 compradas - 30 vendidas)');
  assertClose(valePos.averagePrice, 60, 'Preço médio VALE3 deve ser 60');
  assertClose(valePos.remainingCost, 3000, 'Custo remanescente VALE3 deve ser 3000');
  assertClose(valePos.realizedProfit, 300, 'Lucro realizado VALE3 deve ser 300 (30 * (70 - 60))');

  const effectiveInvs = computeEffectiveInvestments(investments, investmentTransactions);
  const effPetr = effectiveInvs.find(i => i.id === 'inv-petr');
  const effVale = effectiveInvs.find(i => i.id === 'inv-vale');
  assert(effPetr?.quantity === 100 && effPetr?.averagePrice === 30, 'Ativo efetivo PETR4 consistente');
  assert(effVale?.quantity === 50 && effVale?.averagePrice === 60, 'Ativo efetivo VALE3 consistente');
  console.log('  ✅ Posições e investimentos derivados conferidos com sucesso.');

  // =========================================================================
  // 5. Caracterização: Resumo Mensal (computeMonthlySummary)
  // =========================================================================
  console.log('\n--- 5. Validando computeMonthlySummary ---');
  const summary = computeMonthlySummary(computedAccs, computedCards, transactions, selectedMonth);

  assertClose(summary.totalAccountsBalance, 24345, 'Saldo total das contas: 24.345,00 (11345 + 13000)');
  assertClose(summary.totalCreditCardDebt, 1570, 'Dívida total de cartões: 1.570,00 (1250 + 320)');
  assertClose(summary.totalNetWorth, 22775, 'Patrimônio líquido: 22.775,00 (24345 - 1570)');
  assertClose(summary.monthRealizedIncome, 6000, 'Receita realizada de março: 6.000,00');
  assertClose(summary.monthExpectedIncome, 7200, 'Receita prevista de março: 7.200,00 (6000 + 1200)');
  assertClose(summary.monthRealizedExpense, 3725, 'Despesa realizada de março: 3.725,00');
  assertClose(summary.monthExpectedExpense, 3975, 'Despesa prevista de março: 3.975,00 (3725 + 250)');
  assertClose(summary.monthNetBalance, 2275, 'Resultado mensal: 2.275,00 (6000 - 3725)');
  assert(summary.savingsRate === 38, `Taxa de poupança esperada: 38%, obteve ${summary.savingsRate}%`);
  console.log('  ✅ Resumo financeiro mensal conferido com sucesso.');

  // =========================================================================
  // 6. Caracterização: Comprometimentos Futuros (computeFutureCommitments)
  // =========================================================================
  console.log('\n--- 6. Validando computeFutureCommitments ---');
  const future = computeFutureCommitments(transactions, selectedMonth, 6);

  assert(future.length === 6, 'Projeção deve conter 6 meses');
  // Mês 1: 2026-03
  assert(future[0].month === '2026-03', 'Mês 0 deve ser 2026-03');
  assertClose(future[0].installmentsAmount, 600, 'Parcelas 2026-03: 600');
  assertClose(future[0].recurringAmount, 55, 'Recorrentes 2026-03: 55');
  assertClose(future[0].creditCardAmount, 1570, 'Fatura 2026-03: 1570');
  assertClose(future[0].totalCommitted, 2225, 'Total comprometido 2026-03: 2225');

  // Mês 2: 2026-04
  assert(future[1].month === '2026-04', 'Mês 1 deve ser 2026-04');
  assertClose(future[1].installmentsAmount, 600, 'Parcelas 2026-04: 600');
  assertClose(future[1].recurringAmount, 55, 'Recorrentes 2026-04: 55');
  assertClose(future[1].totalCommitted, 655, 'Total comprometido 2026-04: 655');

  // Mês 3: 2026-05
  assert(future[2].month === '2026-05', 'Mês 2 deve ser 2026-05');
  assertClose(future[2].installmentsAmount, 600, 'Parcelas 2026-05: 600');
  assertClose(future[2].recurringAmount, 55, 'Recorrentes 2026-05: 55');
  assertClose(future[2].totalCommitted, 655, 'Total comprometido 2026-05: 655');

  // Mês 4: 2026-06
  assert(future[3].month === '2026-06', 'Mês 3 deve ser 2026-06');
  assertClose(future[3].installmentsAmount, 0, 'Parcelas 2026-06: 0');
  assertClose(future[3].recurringAmount, 55, 'Recorrentes 2026-06: 55');
  assertClose(future[3].totalCommitted, 55, 'Total comprometido 2026-06: 55');
  console.log('  ✅ Comprometimentos futuros conferidos com sucesso.');

  console.log('\n🎉 Todos os testes de caracterização passaram com exatidão matemática!');
}

runCharacterizationTests().catch(err => {
  console.error('\n❌ Falha no teste de caracterização:', err);
  process.exit(1);
});
