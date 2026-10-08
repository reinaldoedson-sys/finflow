import { db as defaultDb, FinFlowDatabase } from './database';
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

export const MIGRATION_FLAG_KEY = 'finflow_app_migrated_to_indexeddb_v1';
const STORAGE_KEY_PREFIX = 'finflow_app_';

export interface MigrationResult {
  migrated: boolean;
  alreadyDone: boolean;
  details: {
    transactions: number;
    accounts: number;
    creditCards: number;
    investments: number;
    investmentTransactions: number;
    goals: number;
    goalMovements: number;
    installmentPlans: number;
    budgets: number;
  };
  error?: string;
}

const safeParseLocalStorage = <T>(key: string): T[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const item = localStorage.getItem(STORAGE_KEY_PREFIX + key);
    if (!item) return [];
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    console.warn(`[IndexedDB Migration] Erro ao ler "${key}" do localStorage:`, err);
    return [];
  }
};

/**
 * Executa a migração automática dos dados volumosos do localStorage para o IndexedDB (Dexie).
 * A operação é idempotente (usa bulkPut) e não apaga os dados legados do localStorage,
 * garantindo segurança absoluta contra perda acidental.
 */
export async function migrateFromLocalStorageIfAvailable(
  database: FinFlowDatabase = defaultDb
): Promise<MigrationResult> {
  const emptyDetails = {
    transactions: 0,
    accounts: 0,
    creditCards: 0,
    investments: 0,
    investmentTransactions: 0,
    goals: 0,
    goalMovements: 0,
    installmentPlans: 0,
    budgets: 0,
  };

  try {
    if (typeof localStorage === 'undefined') {
      return { migrated: false, alreadyDone: false, details: emptyDetails, error: 'localStorage unavailable' };
    }

    const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
    if (alreadyMigrated) {
      return { migrated: false, alreadyDone: true, details: emptyDetails };
    }

    // Leitura das listas existentes no localStorage
    const transactions = safeParseLocalStorage<Transaction>('transactions');
    const accounts = safeParseLocalStorage<Account>('accounts');
    const creditCards = safeParseLocalStorage<CreditCard>('credit_cards');
    const investments = safeParseLocalStorage<InvestmentAsset>('investments');
    const investmentTransactions = safeParseLocalStorage<InvestmentTransaction>('investment_transactions');
    const goals = safeParseLocalStorage<FinancialGoal>('goals');
    const goalMovements = safeParseLocalStorage<GoalMovement>('goal_movements');
    const installmentPlans = safeParseLocalStorage<InstallmentPlan>('installment_plans');
    const budgets = safeParseLocalStorage<Budget>('budgets');

    const totalItems =
      transactions.length +
      accounts.length +
      creditCards.length +
      investments.length +
      investmentTransactions.length +
      goals.length +
      goalMovements.length +
      installmentPlans.length +
      budgets.length;

    // Se houver itens a migrar, executa transação no Dexie
    if (totalItems > 0) {
      await database.transaction(
        'rw',
        [
          database.transactions,
          database.accounts,
          database.creditCards,
          database.investments,
          database.investmentTransactions,
          database.goals,
          database.goalMovements,
          database.installmentPlans,
          database.budgets,
        ],
        async () => {
          if (transactions.length > 0) await database.transactions.bulkPut(transactions);
          if (accounts.length > 0) await database.accounts.bulkPut(accounts);
          if (creditCards.length > 0) await database.creditCards.bulkPut(creditCards);
          if (investments.length > 0) await database.investments.bulkPut(investments);
          if (investmentTransactions.length > 0) await database.investmentTransactions.bulkPut(investmentTransactions);
          if (goals.length > 0) await database.goals.bulkPut(goals);
          if (goalMovements.length > 0) await database.goalMovements.bulkPut(goalMovements);
          if (installmentPlans.length > 0) await database.installmentPlans.bulkPut(installmentPlans);
          if (budgets.length > 0) await database.budgets.bulkPut(budgets);
        }
      );
    }

    // Marca como migrado
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

    return {
      migrated: true,
      alreadyDone: false,
      details: {
        transactions: transactions.length,
        accounts: accounts.length,
        creditCards: creditCards.length,
        investments: investments.length,
        investmentTransactions: investmentTransactions.length,
        goals: goals.length,
        goalMovements: goalMovements.length,
        installmentPlans: installmentPlans.length,
        budgets: budgets.length,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[IndexedDB Migration] Falha durante a migração do localStorage para IndexedDB:', error);
    return {
      migrated: false,
      alreadyDone: false,
      details: emptyDetails,
      error: errorMsg,
    };
  }
}
