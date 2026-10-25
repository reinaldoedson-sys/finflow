import { db, FinFlowDatabase } from './database';
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
  Category,
} from '../../types/finance';
import {
  SAMPLE_ACCOUNT_IDS,
  SAMPLE_CARD_IDS,
  SAMPLE_BUDGET_IDS,
  SAMPLE_GOAL_IDS,
  SAMPLE_GOAL_MOVEMENT_IDS,
  SAMPLE_PLAN_IDS,
  SAMPLE_TRANSACTION_IDS,
  SAMPLE_INVESTMENT_IDS,
  SAMPLE_INVESTMENT_TX_IDS,
} from '../../utils/mockData';

export interface AllFinancialData {
  transactions: Transaction[];
  accounts: Account[];
  creditCards: CreditCard[];
  investments: InvestmentAsset[];
  investmentTransactions: InvestmentTransaction[];
  goals: FinancialGoal[];
  goalMovements: GoalMovement[];
  installmentPlans: InstallmentPlan[];
  budgets: Budget[];
  categories: Category[];
}

export type StorageCollectionName =
  | 'transactions'
  | 'accounts'
  | 'creditCards'
  | 'investments'
  | 'investmentTransactions'
  | 'goals'
  | 'goalMovements'
  | 'installmentPlans'
  | 'budgets'
  | 'categories';

/**
 * Carrega todos os registros das tabelas financeiras do IndexedDB.
 * Retorna null se houver falha de acesso ou se o IndexedDB não estiver disponível.
 */
export async function loadAllFinancialEntities(
  database: FinFlowDatabase = db
): Promise<AllFinancialData | null> {
  try {
    const [
      transactions,
      accounts,
      creditCards,
      investments,
      investmentTransactions,
      goals,
      goalMovements,
      installmentPlans,
      budgets,
      categories,
    ] = await Promise.all([
      database.transactions.toArray(),
      database.accounts.toArray(),
      database.creditCards.toArray(),
      database.investments.toArray(),
      database.investmentTransactions.toArray(),
      database.goals.toArray(),
      database.goalMovements.toArray(),
      database.installmentPlans.toArray(),
      database.budgets.toArray(),
      database.categories.toArray(),
    ]);

    return {
      transactions: transactions.filter(t => !t.deleted),
      accounts: accounts.filter(a => !a.deleted),
      creditCards: creditCards.filter(c => !c.deleted),
      investments: investments.filter(i => !i.deleted),
      investmentTransactions: investmentTransactions.filter(it => !it.deleted),
      goals: goals.filter(g => !g.deleted),
      goalMovements: goalMovements.filter(gm => !gm.deleted),
      installmentPlans: installmentPlans.filter(p => !p.deleted),
      budgets: budgets.filter(b => !b.deleted),
      categories: categories.filter(c => !c.deleted),
    };
  } catch (error) {
    console.error('[IndexedDB Repository] Erro ao carregar dados do IndexedDB:', error);
    return null;
  }
}

/**
 * Salva uma coleção completa no IndexedDB substituindo todos os registros anteriores
 * de forma atômica dentro de uma transação.
 */
export async function replaceCollection<T extends { id: string }>(
  collectionName: StorageCollectionName,
  items: T[],
  database: FinFlowDatabase = db
): Promise<boolean> {
  try {
    const table = database.table<T, string>(collectionName);
    if (!table) return false;

    await database.transaction('rw', table, async () => {
      await table.clear();
      if (items.length > 0) {
        await table.bulkPut(items);
      }
    });

    return true;
  } catch (error) {
    console.error(`[IndexedDB Repository] Erro ao salvar coleção "${collectionName}":`, error);
    return false;
  }
}

/**
 * Salva ou atualiza itens específicos via bulkPut sem apagar o restante da coleção.
 */
export async function putItems<T extends { id: string }>(
  collectionName: StorageCollectionName,
  items: T[],
  database: FinFlowDatabase = db
): Promise<boolean> {
  try {
    const table = database.table<T, string>(collectionName);
    if (!table || items.length === 0) return true;

    await table.bulkPut(items);
    return true;
  } catch (error) {
    console.error(`[IndexedDB Repository] Erro em bulkPut na coleção "${collectionName}":`, error);
    return false;
  }
}

/**
 * Remove itens por IDs.
 */
export async function deleteItems(
  collectionName: StorageCollectionName,
  ids: string[],
  database: FinFlowDatabase = db
): Promise<boolean> {
  try {
    const table = database.table(collectionName);
    if (!table || ids.length === 0) return true;

    await table.bulkDelete(ids);
    return true;
  } catch (error) {
    console.error(`[IndexedDB Repository] Erro em deleteItems na coleção "${collectionName}":`, error);
    return false;
  }
}

/**
 * Limpa todas as coleções financeiras no IndexedDB (ex: para Reset de Fábrica ou Logout).
 */
export async function clearAllFinancialEntities(
  database: FinFlowDatabase = db
): Promise<boolean> {
  try {
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
        database.categories,
      ],
      async () => {
        await database.transactions.clear();
        await database.accounts.clear();
        await database.creditCards.clear();
        await database.investments.clear();
        await database.investmentTransactions.clear();
        await database.goals.clear();
        await database.goalMovements.clear();
        await database.installmentPlans.clear();
        await database.budgets.clear();
        await database.categories.clear();
      }
    );
    return true;
  } catch (error) {
    console.error('[IndexedDB Repository] Erro ao limpar tabelas financeiras do IndexedDB:', error);
    return false;
  }
}

/**
 * Retorna transações armazenadas no IndexedDB ordenadas por data decrescente
 * com filtro opcional por período (datas no formato YYYY-MM-DD).
 */
export async function getTransactionsByDateRange(
  startDate?: string,
  endDate?: string,
  database: FinFlowDatabase = db
): Promise<Transaction[]> {
  try {
    let collection = database.transactions.toCollection();
    if (startDate && endDate) {
      collection = database.transactions.where('date').between(startDate, endDate, true, true);
    } else if (startDate) {
      collection = database.transactions.where('date').aboveOrEqual(startDate);
    } else if (endDate) {
      collection = database.transactions.where('date').belowOrEqual(endDate);
    }
    const items = await collection.toArray();
    return items.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[IndexedDB Repository] Erro ao buscar transações por data no IndexedDB:', error);
    return [];
  }
}

/**
 * Verifica se já existe qualquer dado financeiro registrado no IndexedDB.
 */
export async function hasAnyDataInIndexedDB(
  database: FinFlowDatabase = db
): Promise<boolean> {
  try {
    const count = await database.transactions.count();
    if (count > 0) return true;
    const accCount = await database.accounts.count();
    return accCount > 0;
  } catch {
    return false;
  }
}

/**
 * Remove atomicamente todos os registros de exemplo das tabelas do IndexedDB e da SyncQueue.
 * Preserva estritamente dados criados pelo usuário.
 */
export async function clearSampleDataFromIndexedDB(
  database: FinFlowDatabase = db
): Promise<boolean> {
  try {
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
        database.syncQueue,
      ],
      async () => {
        await Promise.all([
          database.transactions.bulkDelete(Array.from(SAMPLE_TRANSACTION_IDS)),
          database.accounts.bulkDelete(Array.from(SAMPLE_ACCOUNT_IDS)),
          database.creditCards.bulkDelete(Array.from(SAMPLE_CARD_IDS)),
          database.investments.bulkDelete(Array.from(SAMPLE_INVESTMENT_IDS)),
          database.investmentTransactions.bulkDelete(Array.from(SAMPLE_INVESTMENT_TX_IDS)),
          database.goals.bulkDelete(Array.from(SAMPLE_GOAL_IDS)),
          database.goalMovements.bulkDelete(Array.from(SAMPLE_GOAL_MOVEMENT_IDS)),
          database.installmentPlans.bulkDelete(Array.from(SAMPLE_PLAN_IDS)),
          database.budgets.bulkDelete(Array.from(SAMPLE_BUDGET_IDS)),
        ]);

        const queue = await database.syncQueue.toArray();
        const sampleQueueIds = queue
          .filter(q => {
            const id = q.entityId;
            return (
              SAMPLE_ACCOUNT_IDS.has(id) ||
              SAMPLE_CARD_IDS.has(id) ||
              SAMPLE_TRANSACTION_IDS.has(id) ||
              SAMPLE_INVESTMENT_IDS.has(id) ||
              SAMPLE_INVESTMENT_TX_IDS.has(id) ||
              SAMPLE_GOAL_IDS.has(id) ||
              SAMPLE_GOAL_MOVEMENT_IDS.has(id) ||
              SAMPLE_PLAN_IDS.has(id) ||
              SAMPLE_BUDGET_IDS.has(id)
            );
          })
          .map(q => q.id);

        if (sampleQueueIds.length > 0) {
          await database.syncQueue.bulkDelete(sampleQueueIds);
        }
      }
    );
    return true;
  } catch (err) {
    console.warn('[IndexedDB] Erro ao limpar dados de exemplo do IndexedDB:', err);
    return false;
  }
}

