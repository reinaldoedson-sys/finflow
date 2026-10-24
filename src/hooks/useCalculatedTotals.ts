import { useMemo, useCallback, useEffect } from 'react';
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
  computeAccounts,
  computeCreditCards,
  computeGoals,
  computeInvestmentPositions,
  computeEffectiveInvestments,
  auditInvestmentLedgerDivergences,
  computeMonthlySummary,
  computeFutureCommitments,
  DerivedInvestmentPosition,
  MonthlySummaryResult,
  MonthCommitment,
} from '../domain/aggregates';

export interface UseCalculatedTotalsParams {
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  goals: FinancialGoal[];
  goalMovements: GoalMovement[];
  investments: InvestmentAsset[];
  investmentTransactions: InvestmentTransaction[];
  selectedMonth: string;
}

export interface UseCalculatedTotalsResult {
  computedAccounts: Account[];
  computedCreditCards: CreditCard[];
  computedGoals: FinancialGoal[];
  computedInvestmentPositions: Record<string, DerivedInvestmentPosition>;
  computedInvestments: InvestmentAsset[];
  getDerivedPosition: (assetId: string) => DerivedInvestmentPosition | undefined;
  summary: MonthlySummaryResult;
  futureCommitments: MonthCommitment[];
}

/**
 * Hook de composição para derivados e agregados financeiros memoizados.
 * Não cria nem possui estado próprio; orquestra as funções puras de domínio preservando
 * estritamente as dependências originais do useMemo e a identidade referencial.
 */
export function useCalculatedTotals({
  accounts,
  creditCards,
  transactions,
  goals,
  goalMovements,
  investments,
  investmentTransactions,
  selectedMonth,
}: UseCalculatedTotalsParams): UseCalculatedTotalsResult {
  // 1. Recalcula saldos de contas a partir das transações
  const computedAccounts = useMemo(() => {
    return computeAccounts(accounts, transactions);
  }, [accounts, transactions]);

  // 2. Recalcula fatura atual dos cartões a partir das transações
  const computedCreditCards = useMemo(() => {
    return computeCreditCards(creditCards, transactions);
  }, [creditCards, transactions]);

  // 3. Recalcula metas e saldos a partir de GoalMovements
  const computedGoals = useMemo(() => {
    return computeGoals(goals, goalMovements);
  }, [goals, goalMovements]);

  // 4. Recalcula posições derivadas de investimento a partir do ledger
  const computedInvestmentPositions = useMemo(() => {
    return computeInvestmentPositions(investments, investmentTransactions);
  }, [investments, investmentTransactions]);

  // 5. Recalcula ativos de investimento efetivos
  const computedInvestments = useMemo(() => {
    return computeEffectiveInvestments(investments, investmentTransactions);
  }, [investments, investmentTransactions]);

  // 6. Callback de acesso rápido à posição de um ativo
  const getDerivedPosition = useCallback(
    (assetId: string): DerivedInvestmentPosition | undefined => {
      return computedInvestmentPositions[assetId];
    },
    [computedInvestmentPositions]
  );

  // 7. Auditoria em desenvolvimento para detectar divergências com o ledger
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      auditInvestmentLedgerDivergences(investments, computedInvestmentPositions);
    }
  }, [investments, computedInvestmentPositions]);

  // 8. Resumo financeiro mensal
  const summary = useMemo(() => {
    return computeMonthlySummary(computedAccounts, computedCreditCards, transactions, selectedMonth);
  }, [computedAccounts, computedCreditCards, transactions, selectedMonth]);

  // 9. Comprometimentos futuros projetados para os próximos 6 meses
  const futureCommitments = useMemo(() => {
    return computeFutureCommitments(transactions, selectedMonth, 6);
  }, [transactions, selectedMonth]);

  return {
    computedAccounts,
    computedCreditCards,
    computedGoals,
    computedInvestmentPositions,
    computedInvestments,
    getDerivedPosition,
    summary,
    futureCommitments,
  };
}
