import {
  Account,
  CreditCard,
  Transaction,
  FinancialGoal,
  GoalMovement,
  InvestmentAsset,
  InvestmentTransaction,
} from '../types/finance';
import {
  calculateAccountBalance,
  calculateCreditCardInvoice,
  calculateGoalBalance,
  resolveGoalInitialAmount,
  calculateMonthlySummary,
  calculateFutureCommitments,
  MonthlySummaryResult,
  MonthCommitment,
} from './calculations';
import {
  calculateAllEffectiveInvestmentPositions,
  resolveAllEffectiveInvestments,
  compareAssetWithLedger,
  DerivedInvestmentPosition,
} from './investmentPosition';

export type { DerivedInvestmentPosition, MonthlySummaryResult, MonthCommitment };

/**
 * Recalcula as contas e seus saldos a partir do initialBalance e do histórico de transações.
 */
export function computeAccounts(accounts: Account[], transactions: Transaction[]): Account[] {
  return accounts.map(account => {
    const initial = typeof account.initialBalance === 'number'
      ? account.initialBalance
      : (typeof account.currentBalance === 'number' ? account.currentBalance : 0);
    return {
      ...account,
      initialBalance: initial,
      currentBalance: calculateAccountBalance(initial, account.id, transactions),
    };
  });
}

/**
 * Recalcula a fatura atual dos cartões de crédito a partir das transações ativas.
 */
export function computeCreditCards(creditCards: CreditCard[], transactions: Transaction[]): CreditCard[] {
  return creditCards.map(card => ({
    ...card,
    currentInvoice: calculateCreditCardInvoice(card.id, transactions),
  }));
}

/**
 * Recalcula o saldo acumulado das metas a partir do valor inicial e dos aportes/resgates (GoalMovements).
 */
export function computeGoals(goals: FinancialGoal[], goalMovements: GoalMovement[]): FinancialGoal[] {
  return goals.map(goal => {
    const movements = goalMovements.filter(m => m.goalId === goal.id);
    const initial = resolveGoalInitialAmount(goal, movements);
    const derivedBalance = calculateGoalBalance(initial, movements);
    return {
      ...goal,
      initialAmount: initial,
      currentAmount: derivedBalance,
    };
  });
}

/**
 * Recalcula o mapa de posições derivadas de investimentos a partir do ledger de transações.
 */
export function computeInvestmentPositions(
  investments: InvestmentAsset[],
  investmentTransactions: InvestmentTransaction[]
): Record<string, DerivedInvestmentPosition> {
  const map = calculateAllEffectiveInvestmentPositions(investments, investmentTransactions);
  const result: Record<string, DerivedInvestmentPosition> = {};
  for (const [id, pos] of map.entries()) {
    result[id] = pos;
  }
  return result;
}

/**
 * Recalcula a lista de investimentos com quantidades e preços médios efetivos derivados do ledger.
 */
export function computeEffectiveInvestments(
  investments: InvestmentAsset[],
  investmentTransactions: InvestmentTransaction[]
): InvestmentAsset[] {
  return resolveAllEffectiveInvestments(investments, investmentTransactions);
}

/**
 * Auditoria de desenvolvimento para detectar divergências entre ativos armazenados e ledger.
 */
export function auditInvestmentLedgerDivergences(
  investments: InvestmentAsset[],
  positions: Record<string, DerivedInvestmentPosition>
): void {
  for (const asset of investments) {
    const derived = positions[asset.id];
    if (derived && derived.hasLedger) {
      const div = compareAssetWithLedger(asset, derived);
      if (div.hasDivergence) {
        console.warn(
          `[FinFlow Ledger Audit] Divergência detectada no ativo ${asset.ticker || asset.id}: ` +
          `Armazenado (Qtd: ${div.storedQuantity}, PM: ${div.storedAveragePrice}) vs ` +
          `Ledger (Qtd: ${div.derivedQuantity}, PM: ${div.derivedAveragePrice})`
        );
      }
    }
  }
}

/**
 * Recalcula o resumo financeiro mensal (receitas, despesas, saldo de contas, faturas, etc.).
 */
export function computeMonthlySummary(
  computedAccounts: Account[],
  computedCreditCards: CreditCard[],
  transactions: Transaction[],
  selectedMonth: string
): MonthlySummaryResult {
  return calculateMonthlySummary(computedAccounts, computedCreditCards, transactions, selectedMonth);
}

/**
 * Projeta os comprometimentos financeiros futuros para os próximos meses.
 */
export function computeFutureCommitments(
  transactions: Transaction[],
  selectedMonth: string,
  monthsAhead: number = 6
): MonthCommitment[] {
  return calculateFutureCommitments(transactions, monthsAhead, selectedMonth);
}
