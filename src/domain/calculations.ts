import { Account, CreditCard, Transaction, FinancialGoal } from '../types/finance';
import { toCents, fromCents, addMoney, subtractMoney } from './money';

/**
 * Fonte única de verdade para saldo de conta bancária.
 * Calculado a partir de initialBalance + transações concluídas/realizadas.
 */
export function calculateAccountBalance(
  initialBalance: number,
  accountId: string,
  transactions: Transaction[]
): number {
  let balanceCents = toCents(initialBalance);

  for (const tx of transactions) {
    // Apenas transações concluídas afetam o saldo da conta bancária.
    // Transações pendentes ('pending') não devem alterar o saldo realizado.
    if (tx.status !== 'completed') {
      continue;
    }

    // Compras no cartão de crédito afetam a fatura do cartão, não o saldo imediato da conta corrente
    if (tx.paymentMethod === 'credit_card' && tx.creditCardId) {
      continue;
    }

    const amountCents = toCents(tx.amount);

    if (tx.type === 'income' && tx.accountId === accountId) {
      balanceCents += amountCents;
    } else if (tx.type === 'expense' && tx.accountId === accountId) {
      balanceCents -= amountCents;
    } else if (tx.type === 'transfer') {
      if (tx.accountId === accountId) {
        balanceCents -= amountCents;
      }
      if (tx.targetAccountId === accountId) {
        balanceCents += amountCents;
      }
    }
  }

  return fromCents(balanceCents);
}

/**
 * Fonte única de verdade para fatura de cartão de crédito.
 * Calculada a partir das despesas atribuídas ao cartão.
 */
export function calculateCreditCardInvoice(
  cardId: string,
  transactions: Transaction[],
  month?: string
): number {
  let invoiceCents = 0;

  for (const tx of transactions) {
    if (tx.creditCardId === cardId && tx.type === 'expense') {
      // Se um mês específico for passado, filtra pela competência do mês
      if (month && !tx.date.startsWith(month)) {
        continue;
      }
      invoiceCents += toCents(tx.amount);
    }
  }

  return fromCents(invoiceCents);
}

export interface MonthlySummaryResult {
  totalNetWorth: number;
  totalAccountsBalance: number;
  totalCreditCardDebt: number;
  monthRealizedIncome: number;
  monthExpectedIncome: number;
  monthRealizedExpense: number;
  monthExpectedExpense: number;
  monthNetBalance: number;
  savingsRate: number;
}

/**
 * Fonte única de verdade para o resumo mensal e patrimonial consolidado.
 */
export function calculateMonthlySummary(
  accounts: Account[],
  creditCards: CreditCard[],
  transactions: Transaction[],
  selectedMonth: string
): MonthlySummaryResult {
  // 1. Calcula saldos reais de todas as contas
  let totalAccountsBalanceCents = 0;
  for (const acc of accounts) {
    const bal = calculateAccountBalance(acc.initialBalance, acc.id, transactions);
    totalAccountsBalanceCents += toCents(bal);
  }

  // 2. Calcula débitos totais de todos os cartões de crédito
  let totalCreditCardDebtCents = 0;
  for (const card of creditCards) {
    const inv = calculateCreditCardInvoice(card.id, transactions);
    totalCreditCardDebtCents += toCents(inv);
  }

  const totalNetWorthCents = totalAccountsBalanceCents - totalCreditCardDebtCents;

  // 3. Métricas do mês selecionado
  let monthRealizedIncomeCents = 0;
  let monthExpectedIncomeCents = 0;
  let monthRealizedExpenseCents = 0;
  let monthExpectedExpenseCents = 0;

  for (const tx of transactions) {
    if (tx.date.startsWith(selectedMonth)) {
      const amountCents = toCents(tx.amount);

      if (tx.type === 'income') {
        monthExpectedIncomeCents += amountCents;
        if (tx.status === 'completed') {
          monthRealizedIncomeCents += amountCents;
        }
      } else if (tx.type === 'expense') {
        monthExpectedExpenseCents += amountCents;
        if (tx.status === 'completed') {
          monthRealizedExpenseCents += amountCents;
        }
      }
    }
  }

  const monthNetBalanceCents = monthRealizedIncomeCents - monthRealizedExpenseCents;
  const savingsRate = monthRealizedIncomeCents > 0
    ? Math.max(0, Math.round((monthNetBalanceCents / monthRealizedIncomeCents) * 100))
    : 0;

  return {
    totalNetWorth: fromCents(totalNetWorthCents),
    totalAccountsBalance: fromCents(totalAccountsBalanceCents),
    totalCreditCardDebt: fromCents(totalCreditCardDebtCents),
    monthRealizedIncome: fromCents(monthRealizedIncomeCents),
    monthExpectedIncome: fromCents(monthExpectedIncomeCents),
    monthRealizedExpense: fromCents(monthRealizedExpenseCents),
    monthExpectedExpense: fromCents(monthExpectedExpenseCents),
    monthNetBalance: fromCents(monthNetBalanceCents),
    savingsRate
  };
}

import { GoalMovement, GoalMovementType } from '../types/finance';
export type { GoalMovement, GoalMovementType };

/**
 * Fonte única de verdade para saldo de meta financeira (Etapa 7).
 * Saldo = Math.max(0, initialAmount + depósitos - retiradas).
 * Suporta o modelo canônico de ledger (amount estritamente positivo e type 'deposit' | 'withdrawal')
 * além de compatibilidade retroativa com valores prévios com sinal.
 */
export function calculateGoalBalance(
  initialAmount: number,
  movements: GoalMovement[] = []
): number {
  let totalCents = toCents(initialAmount || 0);
  for (const m of movements) {
    if (m.type === 'withdrawal' || (m.type as any) === 'withdraw' || m.amount < 0) {
      totalCents -= toCents(Math.abs(m.amount));
    } else {
      totalCents += toCents(Math.abs(m.amount));
    }
  }
  return Math.max(0, fromCents(totalCents));
}

/**
 * Resolve o initialAmount canônico de uma meta (Etapa 9.6A).
 * 
 * Regra:
 * 1. Se initialAmount estiver presente e for numérico (mesmo 0), ele é a fonte da verdade.
 * 2. Se initialAmount não existir (legado), deduz initialAmount a partir de
 *    rawCurrentAmount - movimentações líquidas, com piso em zero:
 *    inferredInitial = Math.max(0, rawCurrentAmount - (depósitos - resgates)).
 *    Isso garante que ao aplicar calculateGoalBalance(inferredInitial, movements),
 *    o saldo final continue sendo exatamente rawCurrentAmount, prevenindo dupla contagem!
 */
export function resolveGoalInitialAmount(
  goal: { initialAmount?: number; currentAmount?: number },
  movements: GoalMovement[] = []
): number {
  if (typeof goal.initialAmount === 'number' && !isNaN(goal.initialAmount)) {
    return Math.max(0, fromCents(toCents(goal.initialAmount)));
  }

  const rawCurrent = typeof goal.currentAmount === 'number' && !isNaN(goal.currentAmount)
    ? goal.currentAmount
    : 0;

  let netMovementsCents = 0;
  for (const m of movements) {
    if (m.type === 'withdrawal' || (m.type as any) === 'withdraw' || m.amount < 0) {
      netMovementsCents -= toCents(Math.abs(m.amount));
    } else {
      netMovementsCents += toCents(Math.abs(m.amount));
    }
  }

  const inferredCents = Math.max(0, toCents(rawCurrent) - netMovementsCents);
  return fromCents(inferredCents);
}

export interface MonthCommitment {
  month: string; // YYYY-MM
  installmentsAmount: number;
  recurringAmount: number;
  creditCardAmount: number;
  totalCommitted: number;
}

/**
 * Calcula os comprometimentos futuros (parcelamentos, despesas recorrentes e faturas).
 * Permite projetar quanto da renda já está bloqueado para os próximos meses.
 */
export function calculateFutureCommitments(
  transactions: Transaction[],
  monthsCount: number = 6,
  startMonth?: string
): MonthCommitment[] {
  const result: MonthCommitment[] = [];
  const now = new Date();
  
  let baseYear = now.getFullYear();
  let baseMonth = now.getMonth() + 1; // 1-12

  if (startMonth) {
    const parts = startMonth.split('-').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      baseYear = parts[0];
      baseMonth = parts[1];
    }
  }

  // Coleta despesas recorrentes fixas mensais
  const recurringExpenses = transactions.filter(t => t.type === 'expense' && t.isRecurring);
  let recurringMonthCents = 0;
  for (const r of recurringExpenses) {
    recurringMonthCents += toCents(r.amount);
  }

  for (let i = 0; i < monthsCount; i++) {
    const targetDate = new Date(baseYear, (baseMonth - 1) + i, 1);
    const yStr = String(targetDate.getFullYear());
    const mStr = String(targetDate.getMonth() + 1).padStart(2, '0');
    const monthKey = `${yStr}-${mStr}`;

    let installmentsCents = 0;
    let cardCents = 0;

    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.date.startsWith(monthKey)) {
        const isInstallment = !!(tx.installmentPlanId || tx.installments || /\(\d+\/\d+\)/.test(tx.description));
        if (isInstallment) {
          installmentsCents += toCents(tx.amount);
        } else if (tx.paymentMethod === 'credit_card') {
          cardCents += toCents(tx.amount);
        }
      }
    }

    const totalCents = installmentsCents + recurringMonthCents + cardCents;

    result.push({
      month: monthKey,
      installmentsAmount: fromCents(installmentsCents),
      recurringAmount: fromCents(recurringMonthCents),
      creditCardAmount: fromCents(cardCents),
      totalCommitted: fromCents(totalCents)
    });
  }

  return result;
}
