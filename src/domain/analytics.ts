import { Transaction } from '../types/finance';
import { toCents, fromCents } from './money';
import { todayLocalISO } from '../utils/localDate';

export interface MonthlySeriesItem {
  month: number; // 1 a 12
  income: number;
  expense: number;
  salary: number;
  otherIncome: number;
  balance: number;
}

export interface PeriodTotals {
  income: number;
  expense: number;
  salary: number;
  otherIncome: number;
  balance: number;
  savingsRate: number;
}

export const DEFAULT_SALARY_CATEGORY_IDS: readonly string[] = ['cat-salario'];

/**
 * Retorna os anos com lançamentos não excluídos, acrescido do ano atual, em ordem crescente e sem duplicatas.
 *
 * @param transactions Lista de transações
 * @param today Data de hoje (padrão: hoje local via todayLocalISO())
 */
export function getAnalyticsYears(
  transactions: Transaction[],
  today: string = todayLocalISO()
): number[] {
  const yearsSet = new Set<number>();

  const currentYear = parseInt(today.slice(0, 4), 10);
  if (!isNaN(currentYear)) {
    yearsSet.add(currentYear);
  }

  for (const tx of transactions) {
    if (tx.deleted || tx.deletedAt || (tx as { isDeleted?: boolean }).isDeleted) {
      continue;
    }
    if (tx.date && typeof tx.date === 'string' && tx.date.length >= 4) {
      const y = parseInt(tx.date.slice(0, 4), 10);
      if (!isNaN(y) && y >= 1900 && y <= 2100) {
        yearsSet.add(y);
      }
    }
  }

  return Array.from(yearsSet).sort((a, b) => a - b);
}

/**
 * Calcula a série de 12 meses (janeiro a dezembro) para um ano específico.
 * Utiliza EXATAMENTE as mesmas regras de computeMonthlySummary (src/domain/aggregates.ts):
 * - Exclui transferências (type === 'transfer')
 * - Exclui excluídos (deleted / isDeleted / deletedAt)
 * - Considera apenas transações realizadas (status === 'completed')
 * - Despesas em cartão de crédito e parcelamentos entram normalmente no mês de competência (tx.date)
 * - Salário = receitas das categorias em salaryCategoryIds (padrão: ['cat-salario'])
 * - Outras receitas = demais receitas realizadas
 * - Valores computados em centavos inteiros via toCents/fromCents para precisão absoluta
 */
export function computeMonthlySeries(
  transactions: Transaction[],
  year: number,
  salaryCategoryIds: string[] = ['cat-salario']
): MonthlySeriesItem[] {
  const targetYearStr = String(year);
  const salarySet = new Set(salaryCategoryIds);

  // Acumuladores de centavos para cada um dos 12 meses (índices 0..11)
  const incomeCents = new Array<number>(12).fill(0);
  const expenseCents = new Array<number>(12).fill(0);
  const salaryCents = new Array<number>(12).fill(0);
  const otherIncomeCents = new Array<number>(12).fill(0);

  for (const tx of transactions) {
    // 1. Exclui excluídos e transferências
    if (tx.deleted || tx.deletedAt || (tx as { isDeleted?: boolean }).isDeleted) {
      continue;
    }
    if (tx.type === 'transfer') {
      continue;
    }

    // 2. Apenas realizadas contam como receitas/despesas efetivas (mesma regra de computeMonthlySummary)
    if (tx.status !== 'completed') {
      continue;
    }

    // 3. Validação de data YYYY-MM-DD
    if (!tx.date || typeof tx.date !== 'string' || tx.date.length < 7) {
      continue;
    }

    const txYear = tx.date.slice(0, 4);
    if (txYear !== targetYearStr) {
      continue;
    }

    const txMonth = parseInt(tx.date.slice(5, 7), 10);
    if (isNaN(txMonth) || txMonth < 1 || txMonth > 12) {
      continue;
    }

    const monthIndex = txMonth - 1;
    const amountCents = toCents(tx.amount);

    if (tx.type === 'income') {
      incomeCents[monthIndex] += amountCents;
      if (salarySet.has(tx.categoryId)) {
        salaryCents[monthIndex] += amountCents;
      } else {
        otherIncomeCents[monthIndex] += amountCents;
      }
    } else if (tx.type === 'expense') {
      expenseCents[monthIndex] += amountCents;
    }
  }

  const series: MonthlySeriesItem[] = [];
  for (let m = 0; m < 12; m++) {
    const inc = incomeCents[m];
    const exp = expenseCents[m];
    const sal = salaryCents[m];
    const oth = otherIncomeCents[m];
    const bal = inc - exp;

    series.push({
      month: m + 1,
      income: fromCents(inc),
      expense: fromCents(exp),
      salary: fromCents(sal),
      otherIncome: fromCents(oth),
      balance: fromCents(bal),
    });
  }

  return series;
}

/**
 * Consolida os totais do período selecionado:
 * - Se month for null: consolida os 12 meses do ano inteiro.
 * - Se month for 1..12: consolida o mês específico.
 */
export function computePeriodTotals(
  series: MonthlySeriesItem[],
  month: number | null
): PeriodTotals {
  if (month !== null && month >= 1 && month <= 12) {
    const item = series.find(s => s.month === month) || {
      month,
      income: 0,
      expense: 0,
      salary: 0,
      otherIncome: 0,
      balance: 0,
    };

    const incomeCents = toCents(item.income);
    const balanceCents = toCents(item.balance);
    const savingsRate = incomeCents > 0
      ? Math.max(0, Math.round((balanceCents / incomeCents) * 100))
      : 0;

    return {
      income: item.income,
      expense: item.expense,
      salary: item.salary,
      otherIncome: item.otherIncome,
      balance: item.balance,
      savingsRate,
    };
  }

  // Ano inteiro: soma segura em centavos
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let totalSalaryCents = 0;
  let totalOtherIncomeCents = 0;

  for (const item of series) {
    totalIncomeCents += toCents(item.income);
    totalExpenseCents += toCents(item.expense);
    totalSalaryCents += toCents(item.salary);
    totalOtherIncomeCents += toCents(item.otherIncome);
  }

  const totalBalanceCents = totalIncomeCents - totalExpenseCents;
  const savingsRate = totalIncomeCents > 0
    ? Math.max(0, Math.round((totalBalanceCents / totalIncomeCents) * 100))
    : 0;

  return {
    income: fromCents(totalIncomeCents),
    expense: fromCents(totalExpenseCents),
    salary: fromCents(totalSalaryCents),
    otherIncome: fromCents(totalOtherIncomeCents),
    balance: fromCents(totalBalanceCents),
    savingsRate,
  };
}
