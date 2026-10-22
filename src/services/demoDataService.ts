import type { Firestore, DocumentReference } from 'firebase/firestore';
import { loadFirebase } from '../firebaseLoader';
import {
  DEFAULT_CATEGORIES,
  INITIAL_ACCOUNTS,
  INITIAL_CREDIT_CARDS,
  INITIAL_BUDGETS,
  INITIAL_GOALS,
  INITIAL_GOAL_MOVEMENTS,
  INITIAL_INSTALLMENT_PLANS,
  INITIAL_TRANSACTIONS,
  INITIAL_INVESTMENTS,
  INITIAL_INVESTMENT_TRANSACTIONS,
} from '../utils/mockData';
import { isSampleDataDocument, filterOutSampleData } from '../domain/sync';
import { resolveGoalInitialAmount, calculateGoalBalance } from '../domain/calculations';
import type {
  Category,
  Account,
  CreditCard,
  Budget,
  FinancialGoal,
  GoalMovement,
  InstallmentPlan,
  Transaction,
  InvestmentAsset,
  InvestmentTransaction,
} from '../types/finance';
import type { SyncCollection } from '../domain/sync';

export interface FinancialDataset {
  categories?: Category[];
  accounts?: Account[];
  creditCards?: CreditCard[];
  budgets?: Budget[];
  goals?: FinancialGoal[];
  goalMovements?: GoalMovement[];
  installmentPlans?: InstallmentPlan[];
  transactions?: Transaction[];
  investments?: InvestmentAsset[];
  investmentTransactions?: InvestmentTransaction[];
}

export const FINANCIAL_SUBCOLLECTIONS: readonly SyncCollection[] = [
  'transactions',
  'accounts',
  'creditCards',
  'categories',
  'budgets',
  'goals',
  'goalMovements',
  'installmentPlans',
  'investments',
  'investmentTransactions',
];

/**
 * Serviço desacoplado responsável por:
 * - Gravação e semeadura de dados no Firestore (Seed)
 * - Gestão de dados canônicos de demonstração
 * - Limpeza e filtro de dados de exemplo (Sample Data)
 * Totalmente isolado do ciclo de vida React.
 */
export class DemoDataService {
  constructor(private firestore?: Firestore) {}

  private async getFirestore(): Promise<Firestore> {
    if (this.firestore) return this.firestore;
    const { db } = await loadFirebase();
    this.firestore = db;
    return this.firestore;
  }

  /**
   * Retorna o conjunto completo canônico de dados padrão do FinFlow.
   */
  getDefaultDataset(): Required<FinancialDataset> {
    return {
      categories: [...DEFAULT_CATEGORIES],
      accounts: [...INITIAL_ACCOUNTS],
      creditCards: [...INITIAL_CREDIT_CARDS],
      budgets: [...INITIAL_BUDGETS],
      goals: [...INITIAL_GOALS],
      goalMovements: [...INITIAL_GOAL_MOVEMENTS],
      installmentPlans: [...INITIAL_INSTALLMENT_PLANS],
      transactions: [...INITIAL_TRANSACTIONS],
      investments: [...INITIAL_INVESTMENTS],
      investmentTransactions: [...INITIAL_INVESTMENT_TRANSACTIONS],
    };
  }

  /**
   * Retorna os investimentos de demonstração.
   */
  getSampleInvestments(): {
    investments: InvestmentAsset[];
    investmentTransactions: InvestmentTransaction[];
  } {
    return {
      investments: [...INITIAL_INVESTMENTS],
      investmentTransactions: [...INITIAL_INVESTMENT_TRANSACTIONS],
    };
  }

  /**
   * Verifica se o conjunto de dados atual possui itens da demonstração ativos na UI.
   */
  isDemoActive(
    accounts: Account[],
    transactions: Transaction[],
    demoClearedFlag: boolean = false
  ): boolean {
    if (demoClearedFlag) return false;
    const hasDemoAccounts = accounts.some(
      a => a.id === 'acc-itau' || a.id === 'acc-nubank' || a.id === 'acc-xp'
    );
    const hasDemoTx = transactions.some(
      t => t.id === 'tx-1' || t.id === 'tx-2' || t.id === 'tx-3'
    );
    return hasDemoAccounts || hasDemoTx;
  }

  /**
   * Verifica se determinado documento pertence ao catálogo de exemplo.
   */
  isSampleDataDocument(collectionName: string, docId: string): boolean {
    return isSampleDataDocument(collectionName, docId);
  }

  /**
   * Filtra registros de exemplo de todas as entidades de um dataset em memória.
   */
  filterSampleData(dataset: FinancialDataset): Required<FinancialDataset> {
    return {
      categories: dataset.categories ? [...dataset.categories] : [...DEFAULT_CATEGORIES],
      accounts: filterOutSampleData('accounts', dataset.accounts || []),
      creditCards: filterOutSampleData('creditCards', dataset.creditCards || []),
      budgets: filterOutSampleData('budgets', dataset.budgets || []),
      goals: filterOutSampleData('goals', dataset.goals || []),
      goalMovements: filterOutSampleData('goalMovements', dataset.goalMovements || []),
      installmentPlans: filterOutSampleData('installmentPlans', dataset.installmentPlans || []),
      transactions: filterOutSampleData('transactions', dataset.transactions || []),
      investments: filterOutSampleData('investments', dataset.investments || []),
      investmentTransactions: filterOutSampleData('investmentTransactions', dataset.investmentTransactions || []),
    };
  }

  /**
   * Grava um dataset completo ou parcial no Firestore em lotes de até 400 escritas.
   * Se dataset não for fornecido, grava o conjunto padrão (seedDefaults).
   */
  async seed(uid: string, dataset?: FinancialDataset): Promise<void> {
    if (!uid) return;

    const [firestore, { doc, writeBatch }] = await Promise.all([
      this.getFirestore(),
      import('firebase/firestore'),
    ]);

    const data = dataset || this.getDefaultDataset();
    const items: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

    // Categorias
    for (const cat of data.categories || DEFAULT_CATEGORIES) {
      items.push({
        ref: doc(firestore, 'users', uid, 'categories', cat.id),
        data: {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          type: cat.type,
          userId: uid,
        },
      });
    }

    // Contas
    for (const acc of data.accounts || INITIAL_ACCOUNTS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'accounts', acc.id),
        data: {
          name: acc.name,
          bankName: acc.bankName,
          type: acc.type,
          color: acc.color,
          initialBalance: acc.initialBalance,
          currentBalance: acc.currentBalance,
          icon: acc.icon,
          userId: uid,
        },
      });
    }

    // Cartões de Crédito
    for (const card of data.creditCards || INITIAL_CREDIT_CARDS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'creditCards', card.id),
        data: {
          name: card.name,
          bankName: card.bankName,
          color: card.color,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          currentInvoice: card.currentInvoice,
          userId: uid,
        },
      });
    }

    // Orçamentos
    for (const b of data.budgets || INITIAL_BUDGETS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'budgets', b.id),
        data: {
          categoryId: b.categoryId,
          month: b.month,
          limitAmount: b.limitAmount,
          userId: uid,
        },
      });
    }

    // Metas
    const targetMovements = data.goalMovements || INITIAL_GOAL_MOVEMENTS;
    for (const g of data.goals || INITIAL_GOALS) {
      const movements = targetMovements.filter(m => m.goalId === g.id);
      const initial = resolveGoalInitialAmount(g, movements);
      const balance = calculateGoalBalance(initial, movements);
      items.push({
        ref: doc(firestore, 'users', uid, 'goals', g.id),
        data: {
          name: g.name,
          targetAmount: g.targetAmount,
          initialAmount: initial,
          currentAmount: balance,
          targetDate: g.targetDate,
          color: g.color,
          icon: g.icon,
          notes: g.notes || '',
          userId: uid,
        },
      });
    }

    // Movimentações de Metas
    for (const mov of targetMovements) {
      items.push({
        ref: doc(firestore, 'users', uid, 'goalMovements', mov.id),
        data: {
          goalId: mov.goalId,
          type: mov.type,
          amount: mov.amount,
          date: mov.date,
          createdAt: mov.createdAt,
          ...(mov.notes ? { notes: mov.notes } : {}),
          userId: uid,
        },
      });
    }

    // Planos de Parcelamento
    for (const p of data.installmentPlans || INITIAL_INSTALLMENT_PLANS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'installmentPlans', p.id),
        data: {
          description: p.description,
          totalAmount: p.totalAmount,
          installmentAmount: p.installmentAmount,
          totalInstallments: p.totalInstallments,
          type: p.type,
          categoryId: p.categoryId || 'cat-compras',
          accountId: p.accountId,
          creditCardId: p.creditCardId || '',
          paymentMethod: p.paymentMethod,
          startDate: p.startDate,
          userId: uid,
          createdAt: p.createdAt,
        },
      });
    }

    // Transações
    for (const tx of data.transactions || INITIAL_TRANSACTIONS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'transactions', tx.id),
        data: {
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          categoryId: tx.categoryId,
          accountId: tx.accountId,
          targetAccountId: tx.targetAccountId || '',
          creditCardId: tx.creditCardId || '',
          paymentMethod: tx.paymentMethod,
          date: tx.date,
          status: tx.status,
          notes: tx.notes || '',
          isRecurring: !!tx.isRecurring,
          ...(tx.installmentPlanId ? { installmentPlanId: tx.installmentPlanId } : {}),
          ...(tx.installments ? { installments: tx.installments } : {}),
          userId: uid,
          createdAt: tx.createdAt,
        },
      });
    }

    // Investimentos
    for (const inv of data.investments || INITIAL_INVESTMENTS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'investments', inv.id),
        data: {
          ticker: inv.ticker,
          name: inv.name,
          type: inv.type,
          quantity: inv.quantity,
          averagePrice: inv.averagePrice,
          currentPrice: inv.currentPrice,
          currency: inv.currency,
          autoUpdate: !!inv.autoUpdate,
          ...(inv.previousClose !== undefined ? { previousClose: inv.previousClose } : {}),
          ...(inv.changePercent !== undefined ? { changePercent: inv.changePercent } : {}),
          ...(inv.institution ? { institution: inv.institution } : {}),
          ...(inv.lastPriceUpdate ? { lastPriceUpdate: inv.lastPriceUpdate } : {}),
          ...(inv.notes ? { notes: inv.notes } : {}),
          userId: uid,
          createdAt: inv.createdAt,
        },
      });
    }

    // Transações de Investimento
    for (const itx of data.investmentTransactions || INITIAL_INVESTMENT_TRANSACTIONS) {
      items.push({
        ref: doc(firestore, 'users', uid, 'investmentTransactions', itx.id),
        data: {
          assetId: itx.assetId,
          type: itx.type,
          date: itx.date,
          quantity: itx.quantity,
          price: itx.price,
          totalAmount: itx.totalAmount,
          ...(itx.notes ? { notes: itx.notes } : {}),
          userId: uid,
          createdAt: itx.createdAt,
        },
      });
    }

    // Persistência em chunks de até 400 operações atômicas
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = writeBatch(firestore);
      chunk.forEach(item => batch.set(item.ref, item.data));
      await batch.commit();
    }
  }

  /**
   * Remove apenas os documentos de exemplo do Firestore na conta do usuário.
   */
  async clear(uid?: string): Promise<void> {
    if (!uid) return;
    await this.deleteSubcollectionsFromFirestore(uid, FINANCIAL_SUBCOLLECTIONS, isSampleDataDocument);
  }

  /**
   * Reseta completamente os dados do usuário para o conjunto canônico padrão no Firestore.
   */
  async resetToDefaults(uid?: string): Promise<Required<FinancialDataset>> {
    if (uid) {
      await this.deleteSubcollectionsFromFirestore(uid, FINANCIAL_SUBCOLLECTIONS);
      await this.seed(uid);
    }
    return this.getDefaultDataset();
  }

  /**
   * Remove todos os dados do usuário em todas as coleções no Firestore.
   */
  async clearAll(uid: string): Promise<void> {
    if (!uid) return;
    await this.deleteSubcollectionsFromFirestore(uid, FINANCIAL_SUBCOLLECTIONS);
  }

  /**
   * Helper que remove documentos de subcoleções em lotes seguros.
   */
  private async deleteSubcollectionsFromFirestore(
    uid: string,
    subcollections: readonly string[],
    filterFn?: (sub: string, docId: string) => boolean
  ): Promise<void> {
    const [firestore, { collection, getDocs, writeBatch }] = await Promise.all([
      this.getFirestore(),
      import('firebase/firestore'),
    ]);

    for (const sub of subcollections) {
      try {
        const snap = await getDocs(collection(firestore, 'users', uid, sub));
        if (snap.empty) continue;
        let docsToDelete = snap.docs;
        if (filterFn) {
          docsToDelete = docsToDelete.filter(d => filterFn(sub, d.id));
        }
        if (docsToDelete.length === 0) continue;
        for (let i = 0; i < docsToDelete.length; i += 400) {
          const chunk = docsToDelete.slice(i, i + 400);
          const batch = writeBatch(firestore);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        console.warn(`[DemoDataService] Erro ao remover documentos da subcoleção "${sub}":`, err);
        throw err;
      }
    }
  }
}

export const demoDataService = new DemoDataService();
export default demoDataService;
