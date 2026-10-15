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
      transactions: transactions.filter(t => !(t as any).deleted),
      accounts: accounts.filter(a => !(a as any).deleted),
      creditCards: creditCards.filter(c => !(c as any).deleted),
      investments: investments.filter(i => !(i as any).deleted),
      investmentTransactions: investmentTransactions.filter(it => !(it as any).deleted),
      goals: goals.filter(g => !(g as any).deleted),
      goalMovements: goalMovements.filter(gm => !(gm as any).deleted),
      installmentPlans: installmentPlans.filter(p => !(p as any).deleted),
      budgets: budgets.filter(b => !(b as any).deleted),
      categories: categories.filter(c => !(c as any).deleted),
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
    const table = database[collectionName] as any;
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
    const table = database[collectionName] as any;
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
    const table = database[collectionName] as any;
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
