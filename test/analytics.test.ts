import {
  getAnalyticsYears,
  computeMonthlySeries,
  computePeriodTotals,
  isProjectedMonth,
} from '../src/domain/analytics';
import { computeMonthlySummary, computeAccounts, computeCreditCards } from '../src/domain/aggregates';
import { Transaction, Account, CreditCard } from '../src/types/finance';

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

function assertClose(actual: number, expected: number, message: string, tolerance = 0.001) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`✅ PASS: ${message} (${actual})`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}. Esperado: ${expected}, Obtido: ${actual}`);
    failed++;
  }
}

async function runAnalyticsTests() {
  console.log('🧪 Iniciando testes de analytics (test/analytics.test.ts)...\n');

  // =========================================================================
  // 1. getAnalyticsYears
  // =========================================================================
  console.log('--- 1. Testando getAnalyticsYears ---');
  {
    const today = '2026-03-15';
    // Sem transações: deve devolver pelo menos o ano atual
    const emptyYears = getAnalyticsYears([], today);
    assert(
      emptyYears.length === 1 && emptyYears[0] === 2026,
      'Sem transações devolve apenas o ano atual [2026]'
    );

    // Com transações em anos variados e repetidos
    const txs: Transaction[] = [
      { id: '1', description: 'A', amount: 100, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2024-05-10', status: 'completed', createdAt: '2024-05-10' },
      { id: '2', description: 'B', amount: 200, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2024-11-20', status: 'completed', createdAt: '2024-11-20' },
      { id: '3', description: 'C', amount: 300, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2025-01-15', status: 'completed', createdAt: '2025-01-15' },
      { id: '4', description: 'D', amount: 400, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2027-02-01', status: 'completed', createdAt: '2027-02-01' },
      // Excluída não deve entrar
      { id: '5', description: 'E', amount: 500, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2020-01-01', status: 'completed', deleted: true, createdAt: '2020-01-01' },
      { id: '6', description: 'F', amount: 600, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2019-01-01', status: 'completed', deleted: true, createdAt: '2019-01-01' },
      { id: '7', description: 'G', amount: 700, type: 'expense', categoryId: 'c1', accountId: 'a1', paymentMethod: 'pix', date: '2018-01-01', status: 'completed', deletedAt: '2026-01-01T00:00:00Z', createdAt: '2018-01-01' },
    ];

    const years = getAnalyticsYears(txs, today);
    assert(
      JSON.stringify(years) === JSON.stringify([2024, 2025, 2026, 2027]),
      `Anos ordenados e sem duplicatas, incluindo o ano atual: ${JSON.stringify(years)}`
    );
  }

  // =========================================================================
  // 2. computeMonthlySeries: regras de dados e divisões
  // =========================================================================
  console.log('\n--- 2. Testando computeMonthlySeries ---');
  {
    const txs: Transaction[] = [
      // Janeiro 2026
      { id: 't1', description: 'Salário Jan', amount: 5000, type: 'income', categoryId: 'cat-salario', accountId: 'a1', paymentMethod: 'pix', date: '2026-01-05', status: 'completed', createdAt: '2026-01-05' },
      { id: 't2', description: 'Freelance Jan', amount: 1500, type: 'income', categoryId: 'cat-extra', accountId: 'a1', paymentMethod: 'pix', date: '2026-01-15', status: 'completed', createdAt: '2026-01-15' },
      { id: 't3', description: 'Aluguel Jan', amount: 2000, type: 'expense', categoryId: 'cat-moradia', accountId: 'a1', paymentMethod: 'pix', date: '2026-01-10', status: 'completed', createdAt: '2026-01-10' },
      { id: 't4', description: 'Mercado Jan (Cartão)', amount: 800, type: 'expense', categoryId: 'cat-mercado', accountId: 'a1', creditCardId: 'cc1', paymentMethod: 'credit_card', date: '2026-01-20', status: 'completed', createdAt: '2026-01-20' },
      // Pendente de Janeiro: NÃO deve entrar nas realizadas
      { id: 't5', description: 'Bônus Pendente', amount: 1000, type: 'income', categoryId: 'cat-extra', accountId: 'a1', paymentMethod: 'pix', date: '2026-01-30', status: 'pending', createdAt: '2026-01-30' },
      // Transferência de Janeiro: NÃO deve entrar
      { id: 't6', description: 'Transf Poupança', amount: 1200, type: 'transfer', categoryId: 'cat-transf', accountId: 'a1', targetAccountId: 'a2', paymentMethod: 'pix', date: '2026-01-12', status: 'completed', createdAt: '2026-01-12' },
      // Excluída de Janeiro: NÃO deve entrar
      { id: 't7', description: 'Cancelada', amount: 500, type: 'expense', categoryId: 'cat-mercado', accountId: 'a1', paymentMethod: 'pix', date: '2026-01-18', status: 'completed', deleted: true, createdAt: '2026-01-18' },

      // Fevereiro 2026
      { id: 't8', description: 'Salário Fev', amount: 5000, type: 'income', categoryId: 'cat-salario', accountId: 'a1', paymentMethod: 'pix', date: '2026-02-05', status: 'completed', createdAt: '2026-02-05' },
      { id: 't9', description: 'Despesa Fev', amount: 1800, type: 'expense', categoryId: 'cat-contas', accountId: 'a1', paymentMethod: 'pix', date: '2026-02-10', status: 'completed', createdAt: '2026-02-10' },

      // Dezembro 2025 (Outro ano: deve ser ignorado para 2026)
      { id: 't10', description: 'Salário Dez 2025', amount: 4800, type: 'income', categoryId: 'cat-salario', accountId: 'a1', paymentMethod: 'pix', date: '2025-12-31', status: 'completed', createdAt: '2025-12-31' },
      // Janeiro 2027 (Outro ano: deve ser ignorado para 2026)
      { id: 't11', description: 'Ano Novo 2027', amount: 1000, type: 'expense', categoryId: 'cat-festas', accountId: 'a1', paymentMethod: 'pix', date: '2027-01-01', status: 'completed', createdAt: '2027-01-01' },
    ];

    const series2026 = computeMonthlySeries(txs, 2026);
    assert(series2026.length === 12, 'Série possui exatamente 12 meses');

    // Mês 1 (Janeiro)
    const jan = series2026[0];
    assert(jan.month === 1, 'Mês 1 é Janeiro');
    assertClose(jan.salary, 5000, 'Salário Jan é 5000');
    assertClose(jan.otherIncome, 1500, 'Outras receitas Jan é 1500');
    assertClose(jan.income, 6500, 'Receita total Jan é 6500 (5000 + 1500, sem bônus pendente)');
    assertClose(jan.expense, 2800, 'Despesa Jan é 2800 (2000 + 800 cartão, sem cancelada)');
    assertClose(jan.balance, 3700, 'Saldo Jan é 3700 (6500 - 2800)');

    // Mês 2 (Fevereiro)
    const fev = series2026[1];
    assert(fev.month === 2, 'Mês 2 é Fevereiro');
    assertClose(fev.salary, 5000, 'Salário Fev é 5000');
    assertClose(fev.otherIncome, 0, 'Outras receitas Fev é 0');
    assertClose(fev.income, 5000, 'Receita total Fev é 5000');
    assertClose(fev.expense, 1800, 'Despesa Fev é 1800');
    assertClose(fev.balance, 3200, 'Saldo Fev é 3200');

    // Mês 3 a 12 devem estar zerados
    for (let m = 2; m < 12; m++) {
      assert(series2026[m].income === 0, `Mês ${m + 1} receita está zerada`);
      assert(series2026[m].expense === 0, `Mês ${m + 1} despesa está zerada`);
      assert(series2026[m].balance === 0, `Mês ${m + 1} saldo está zerado`);
    }

    // Virada de ano: testar ano 2025
    const series2025 = computeMonthlySeries(txs, 2025);
    const dez2025 = series2025[11];
    assertClose(dez2025.income, 4800, '31/12/2025 cai corretamente em Dezembro de 2025');
  }

  // =========================================================================
  // 3. computePeriodTotals
  // =========================================================================
  console.log('\n--- 3. Testando computePeriodTotals ---');
  {
    const mockSeries = [
      { month: 1, income: 6000, expense: 2000, salary: 5000, otherIncome: 1000, balance: 4000 },
      { month: 2, income: 4000, expense: 3000, salary: 4000, otherIncome: 0, balance: 1000 },
      { month: 3, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 4, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 5, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 6, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 7, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 8, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 9, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 10, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 11, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
      { month: 12, income: 0, expense: 0, salary: 0, otherIncome: 0, balance: 0 },
    ];

    // Mês específico (Janeiro)
    const janTotals = computePeriodTotals(mockSeries, 1);
    assertClose(janTotals.income, 6000, 'Totais Jan income');
    assertClose(janTotals.expense, 2000, 'Totais Jan expense');
    assertClose(janTotals.balance, 4000, 'Totais Jan balance');
    assert(janTotals.savingsRate === 67, `Taxa de poupança Jan esperada 67%, obtida ${janTotals.savingsRate}%`);

    // Ano inteiro (month = null)
    const yearTotals = computePeriodTotals(mockSeries, null);
    assertClose(yearTotals.income, 10000, 'Totais ano income: 10.000 (6000 + 4000)');
    assertClose(yearTotals.expense, 5000, 'Totais ano expense: 5.000 (2000 + 3000)');
    assertClose(yearTotals.salary, 9000, 'Totais ano salary: 9.000 (5000 + 4000)');
    assertClose(yearTotals.otherIncome, 1000, 'Totais ano otherIncome: 1.000');
    assertClose(yearTotals.balance, 5000, 'Totais ano balance: 5.000 (10000 - 5000)');
    assert(yearTotals.savingsRate === 50, `Taxa de poupança anual esperada 50%, obtida ${yearTotals.savingsRate}%`);
  }

  // =========================================================================
  // 4. Teste de Igualdade Estrita com financeDerivedCharacterization
  // =========================================================================
  console.log('\n--- 4. Teste de Igualdade Estrita com financeDerivedCharacterization ---');
  {
    const accounts: Account[] = [
      { id: 'acc-checking', name: 'Conta Corrente Inter', type: 'checking', bankName: 'Banco Inter', initialBalance: 5000, currentBalance: 0, color: '#10b981', icon: 'Wallet' },
      { id: 'acc-savings', name: 'Reserva Poupança', type: 'savings', bankName: 'Nubank', initialBalance: 12000, currentBalance: 0, color: '#3b82f6', icon: 'PiggyBank' },
    ];

    const creditCards: CreditCard[] = [
      { id: 'card-nubank', name: 'Nubank Ultravioleta', bankName: 'Nubank', limit: 8000, closingDay: 25, dueDay: 5, color: '#8b5cf6', currentInvoice: 0 },
      { id: 'card-visa', name: 'Visa Infinite', bankName: 'Bradesco', limit: 5000, closingDay: 15, dueDay: 25, color: '#f59e0b', currentInvoice: 0 },
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

    const computedAccs = computeAccounts(accounts, transactions);
    const computedCards = computeCreditCards(creditCards, transactions);

    // Calcula a série anual com a nova função pura de Analytics
    const series = computeMonthlySeries(transactions, 2026, ['cat-sal']);

    // Para cada mês de 1 a 12, income e expense DEVEM ser exatamente iguais
    for (let month = 1; month <= 12; month++) {
      const monthStr = `2026-${String(month).padStart(2, '0')}`;
      const summary = computeMonthlySummary(computedAccs, computedCards, transactions, monthStr);
      const seriesItem = series[month - 1];

      assertClose(
        seriesItem.income,
        summary.monthRealizedIncome,
        `Mês ${monthStr}: income (${seriesItem.income}) deve ser IDÊNTICO a computeMonthlySummary.monthRealizedIncome (${summary.monthRealizedIncome})`
      );

      assertClose(
        seriesItem.expense,
        summary.monthRealizedExpense,
        `Mês ${monthStr}: expense (${seriesItem.expense}) deve ser IDÊNTICO a computeMonthlySummary.monthRealizedExpense (${summary.monthRealizedExpense})`
      );

      assertClose(
        seriesItem.balance,
        summary.monthNetBalance,
        `Mês ${monthStr}: balance (${seriesItem.balance}) deve ser IDÊNTICO a computeMonthlySummary.monthNetBalance (${summary.monthNetBalance})`
      );
    }
  }

  // =========================================================================
  // 5. isProjectedMonth: regras de meses previstos
  // =========================================================================
  console.log('\n--- 5. Testando isProjectedMonth ---');
  {
    const today = '2026-05-20';

    // Mês atual não é previsto
    assert(
      isProjectedMonth(2026, 5, today) === false,
      'Mês atual (maio de 2026 com hoje em maio/2026) NÃO é previsto'
    );

    // Mês seguinte é previsto
    assert(
      isProjectedMonth(2026, 6, today) === true,
      'Mês seguinte (junho de 2026 com hoje em maio/2026) É previsto'
    );

    // Mês anterior não é previsto
    assert(
      isProjectedMonth(2026, 4, today) === false,
      'Mês anterior (abril de 2026 com hoje em maio/2026) NÃO é previsto'
    );

    // Virada de ano: dezembro de um ano e janeiro do seguinte
    const todayDez = '2026-12-15';
    assert(
      isProjectedMonth(2026, 12, todayDez) === false,
      'Virada de ano: dezembro do ano atual NÃO é previsto'
    );
    assert(
      isProjectedMonth(2027, 1, todayDez) === true,
      'Virada de ano: janeiro do ano seguinte É previsto'
    );

    const todayJan = '2027-01-10';
    assert(
      isProjectedMonth(2026, 12, todayJan) === false,
      'Virada de ano: dezembro do ano passado nunca é previsto'
    );
    assert(
      isProjectedMonth(2027, 1, todayJan) === false,
      'Virada de ano: janeiro do ano atual NÃO é previsto'
    );
    assert(
      isProjectedMonth(2027, 2, todayJan) === true,
      'Virada de ano: fevereiro do ano atual É previsto'
    );

    // Ano futuro inteiro previsto
    let allFutureProjected = true;
    for (let m = 1; m <= 12; m++) {
      if (!isProjectedMonth(2028, m, today)) {
        allFutureProjected = false;
        break;
      }
    }
    assert(
      allFutureProjected,
      'Ano futuro (2028) é inteiramente previsto para todos os 12 meses'
    );

    // Ano passado nunca previsto
    let nonePastProjected = true;
    for (let m = 1; m <= 12; m++) {
      if (isProjectedMonth(2025, m, today)) {
        nonePastProjected = false;
        break;
      }
    }
    assert(
      nonePastProjected,
      'Ano passado (2025) NUNCA é previsto para nenhum dos 12 meses'
    );
  }

  console.log(`\n========================================`);
  console.log(`Resultado dos Testes: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAnalyticsTests().catch(err => {
  console.error('Erro ao executar testes de analytics:', err);
  process.exit(1);
});

