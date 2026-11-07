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

/**
 * Determina se determinado mês/ano é estritamente posterior ao mês atual (mês previsto).
 * Compara ano e mês lidos diretamente da string 'YYYY-MM-DD' (sem Date em UTC).
 * Anos posteriores ao atual são inteiramente previstos; anos anteriores nunca.
 *
 * @param year Ano a verificar (ex: 2026)
 * @param month Mês a verificar (1 a 12)
 * @param todayISO Data de referência no formato 'YYYY-MM-DD' (padrão: hoje local)
 */
export function isProjectedMonth(
  year: number,
  month: number,
  todayISO: string = todayLocalISO()
): boolean {
  if (!todayISO || typeof todayISO !== 'string' || todayISO.length < 7) {
    return false;
  }
  const currentYear = parseInt(todayISO.slice(0, 4), 10);
  const currentMonth = parseInt(todayISO.slice(5, 7), 10);

  if (isNaN(currentYear) || isNaN(currentMonth)) {
    return false;
  }

  if (year > currentYear) {
    return true;
  }
  if (year < currentYear) {
    return false;
  }
  return month > currentMonth;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amount: number;
  cents: number;
  percentage: number; // 0 a 100 com 1 casa decimal (ex: 32.5)
  transactionCount: number;
}

export interface TopTransactionItem {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: 'expense' | 'income';
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  paymentMethod?: string;
  creditCardId?: string;
  accountId?: string;
}

const DEFAULT_CATEGORY_PALETTE = [
  '#f43f5e', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#eab308', '#a855f7',
  '#14b8a6', '#f97316', '#6366f1', '#64748b'
];

/**
 * Calcula a distribuição por categoria de despesas ou receitas para o período especificado (mês ou ano inteiro).
 * Regras idênticas ao restante da aba:
 * - Exclui excluídos (deleted / isDeleted / deletedAt)
 * - Exclui transferências (type === 'transfer')
 * - Considera apenas transações realizadas (status === 'completed')
 * - Agregação em centavos inteiros via toCents/fromCents
 * - Ordenação decrescente por valor total
 */
export function computeCategoryBreakdown(
  transactions: Transaction[],
  year: number,
  month: number | null,
  type: 'expense' | 'income' = 'expense',
  categories: { id: string; name: string; icon?: string; color?: string }[] = []
): CategoryBreakdownItem[] {
  const targetYearStr = String(year);
  const categoryMap = new Map<string, { name: string; icon: string; color: string }>();

  categories.forEach((cat, idx) => {
    categoryMap.set(cat.id, {
      name: cat.name,
      icon: cat.icon || 'Tag',
      color: cat.color || DEFAULT_CATEGORY_PALETTE[idx % DEFAULT_CATEGORY_PALETTE.length],
    });
  });

  const groups = new Map<string, { cents: number; count: number }>();
  let totalPeriodCents = 0;

  for (const tx of transactions) {
    if (tx.deleted || tx.deletedAt || (tx as { isDeleted?: boolean }).isDeleted) {
      continue;
    }
    if (tx.type !== type) {
      continue;
    }
    if (tx.status !== 'completed') {
      continue;
    }
    if (!tx.date || typeof tx.date !== 'string' || tx.date.length < 7) {
      continue;
    }

    const txYear = tx.date.slice(0, 4);
    if (txYear !== targetYearStr) {
      continue;
    }

    if (month !== null) {
      const txMonth = parseInt(tx.date.slice(5, 7), 10);
      if (txMonth !== month) {
        continue;
      }
    }

    const amountCents = toCents(tx.amount);
    if (amountCents <= 0) {
      continue;
    }

    totalPeriodCents += amountCents;
    const catId = tx.categoryId || 'uncategorized';
    const current = groups.get(catId) || { cents: 0, count: 0 };
    current.cents += amountCents;
    current.count += 1;
    groups.set(catId, current);
  }

  const items: CategoryBreakdownItem[] = [];
  let index = 0;

  for (const [catId, { cents, count }] of groups.entries()) {
    const meta = categoryMap.get(catId);
    const name = meta?.name || (catId === 'uncategorized' ? 'Sem categoria' : 'Outros');
    const icon = meta?.icon || 'Tag';
    const color = meta?.color || DEFAULT_CATEGORY_PALETTE[index % DEFAULT_CATEGORY_PALETTE.length];
    index++;

    const percentage = totalPeriodCents > 0
      ? Math.round((cents / totalPeriodCents) * 1000) / 10
      : 0;

    items.push({
      categoryId: catId,
      name,
      icon,
      color,
      amount: fromCents(cents),
      cents,
      percentage,
      transactionCount: count,
    });
  }

  // Ordena do maior valor para o menor
  return items.sort((a, b) => b.cents - a.cents);
}

/**
 * Retorna os N maiores lançamentos pontuais do período filtrado, ordenados decrescente pelo valor.
 */
export function getTopTransactions(
  transactions: Transaction[],
  year: number,
  month: number | null,
  type: 'expense' | 'income' = 'expense',
  categories: { id: string; name: string; icon?: string; color?: string }[] = [],
  limit: number = 5
): TopTransactionItem[] {
  const targetYearStr = String(year);
  const categoryMap = new Map<string, { name: string; icon: string; color: string }>();

  categories.forEach((cat, idx) => {
    categoryMap.set(cat.id, {
      name: cat.name,
      icon: cat.icon || 'Tag',
      color: cat.color || DEFAULT_CATEGORY_PALETTE[idx % DEFAULT_CATEGORY_PALETTE.length],
    });
  });

  const filtered: { tx: Transaction; cents: number }[] = [];

  for (const tx of transactions) {
    if (tx.deleted || tx.deletedAt || (tx as { isDeleted?: boolean }).isDeleted) {
      continue;
    }
    if (tx.type !== type) {
      continue;
    }
    if (tx.status !== 'completed') {
      continue;
    }
    if (!tx.date || typeof tx.date !== 'string' || tx.date.length < 7) {
      continue;
    }

    const txYear = tx.date.slice(0, 4);
    if (txYear !== targetYearStr) {
      continue;
    }

    if (month !== null) {
      const txMonth = parseInt(tx.date.slice(5, 7), 10);
      if (txMonth !== month) {
        continue;
      }
    }

    const cents = toCents(tx.amount);
    if (cents > 0) {
      filtered.push({ tx, cents });
    }
  }

  filtered.sort((a, b) => b.cents - a.cents);

  return filtered.slice(0, limit).map(({ tx }) => {
    const meta = categoryMap.get(tx.categoryId);
    return {
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      type: tx.type as 'expense' | 'income',
      categoryId: tx.categoryId,
      categoryName: meta?.name || 'Outros',
      categoryIcon: meta?.icon || 'Tag',
      categoryColor: meta?.color || '#94a3b8',
      paymentMethod: tx.paymentMethod,
      creditCardId: tx.creditCardId,
      accountId: tx.accountId,
    };
  });
}

