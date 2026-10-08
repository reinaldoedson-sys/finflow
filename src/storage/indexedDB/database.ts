import Dexie, { type EntityTable } from 'dexie';
import type {
  Transaction,
  Account,
  CreditCard,
  InvestmentAsset,
  InvestmentTransaction,
  FinancialGoal,
  GoalMovement,
  InstallmentPlan,
  Budget,
} from '../../types/finance';
import type { SyncQueueItem } from '../../services/syncTypes';

export class FinFlowDatabase extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  creditCards!: EntityTable<CreditCard, 'id'>;
  investments!: EntityTable<InvestmentAsset, 'id'>;
  investmentTransactions!: EntityTable<InvestmentTransaction, 'id'>;
  goals!: EntityTable<FinancialGoal, 'id'>;
  goalMovements!: EntityTable<GoalMovement, 'id'>;
  installmentPlans!: EntityTable<InstallmentPlan, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

  constructor(databaseName = 'FinFlowDatabase') {
    super(databaseName);

    // Schema Version 1
    this.version(1).stores({
      transactions: 'id, accountId, date, type, categoryId, creditCardId, installmentPlanId',
      accounts: 'id, type',
      creditCards: 'id',
      investments: 'id, ticker, type',
      investmentTransactions: 'id, assetId, date, type',
      goals: 'id, targetDate',
      goalMovements: 'id, goalId, date, type',
      installmentPlans: 'id, accountId, creditCardId',
      budgets: 'id, categoryId, month',
    });

    // Schema Version 2: Fila de Sincronização Local-First com persistência própria
    this.version(2).stores({
      syncQueue: 'id, operationId, entityName, entityId, timestamp, nextRetryAt',
    });
  }
}

/**
 * Instância singleton do banco Dexie para uso na aplicação.
 */
export const db = new FinFlowDatabase();

/**
 * Função utilitária para verificar se o IndexedDB está acessível no ambiente atual.
 * Trata casos de modo anônimo restritivo, browsers legados ou falhas de permissão.
 */
export const isIndexedDBAvailable = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
};
