import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { 
  Transaction, 
  Account, 
  CreditCard, 
  Category, 
  Budget, 
  FinancialGoal, 
  GoalMovement,
  GoalMovementType,
  CurrencyCode,
  InstallmentPlan,
  InvestmentAsset,
  InvestmentTransaction
} from '../types/finance';
import { 
  DEFAULT_CATEGORIES, 
  INITIAL_ACCOUNTS, 
  INITIAL_CREDIT_CARDS, 
  INITIAL_GOALS, 
  INITIAL_GOAL_MOVEMENTS,
  INITIAL_BUDGETS, 
  INITIAL_TRANSACTIONS,
  INITIAL_INSTALLMENT_PLANS,
  INITIAL_INVESTMENTS,
  INITIAL_INVESTMENT_TRANSACTIONS,
  SAMPLE_ACCOUNT_IDS,
  SAMPLE_CARD_IDS,
  SAMPLE_BUDGET_IDS,
  SAMPLE_GOAL_IDS,
  SAMPLE_GOAL_MOVEMENT_IDS,
  SAMPLE_PLAN_IDS,
  SAMPLE_TRANSACTION_IDS,
  SAMPLE_INVESTMENT_IDS,
  SAMPLE_INVESTMENT_TX_IDS
} from '../utils/mockData';
import { fetchMarketQuotes } from '../services/marketQuotes';
import { getCurrentMonth, getPreviousMonth, getNextMonth } from '../utils/currency';
import { encryptData, decryptData } from '../utils/crypto';
import { useAuth } from './AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  writeBatch,
  getDocs 
} from 'firebase/firestore';
import { generateId } from '../domain/id';
import { toCents, fromCents, addMoney, subtractMoney } from '../domain/money';
import { 
  calculateAccountBalance, 
  calculateCreditCardInvoice, 
  calculateMonthlySummary,
  calculateFutureCommitments,
  calculateGoalBalance,
  resolveGoalInitialAmount,
  MonthCommitment
} from '../domain/calculations';
import { calculateInstallmentSchedule } from '../domain/installments';
import { 
  createInvestmentTransaction, 
  validateInvestmentTransaction, 
  calculateTransactionTotal 
} from '../domain/investmentTransactions';
import { calculateAportePosition } from '../domain/investments';
import {
  SyncStatus,
  PendingSyncOperation,
  SyncCollection,
  SyncOperationType,
  enqueueOperation,
  dequeueOperation,
  mergeCloudWithPending,
  loadPendingQueueFromStorage,
  savePendingQueueToStorage,
  ALL_SYNC_SUBCOLLECTIONS,
  isSampleDataDocument,
  filterOutSampleData
} from '../domain/sync';

interface FinanceContextType {
  transactions: Transaction[];
  accounts: Account[];
  creditCards: CreditCard[];
  categories: Category[];
  budgets: Budget[];
  goals: FinancialGoal[];
  goalMovements: GoalMovement[];
  installmentPlans: InstallmentPlan[];
  investments: InvestmentAsset[];
  investmentTransactions: InvestmentTransaction[];
  currency: CurrencyCode;
  selectedMonth: string;
  futureCommitments: MonthCommitment[];
  isCloudSynced: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  pendingSyncCount: number;
  retrySync: () => Promise<boolean>;
  isDemoActive: boolean;
  clearSampleData: () => Promise<void>;
  syncLocalToCloud: () => Promise<void>;
  setCurrency: (c: CurrencyCode) => void;
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;

  // Investment Actions
  addInvestment: (asset: Omit<InvestmentAsset, 'id' | 'createdAt'>) => Promise<string>;
  updateInvestment: (id: string, updates: Partial<InvestmentAsset>) => Promise<void>;
  deleteInvestment: (id: string) => Promise<void>;
  refreshInvestmentQuotes: () => Promise<void>;
  loadSampleInvestments: () => Promise<void>;
  isRefreshingQuotes: boolean;
  lastQuotesUpdate: string | null;

  // Investment Transaction Actions (Ledger de investimentos - Etapa 9)
  addInvestmentTransaction: (tx: Omit<InvestmentTransaction, 'id' | 'createdAt'>) => Promise<string>;
  updateInvestmentTransaction: (id: string, updates: Partial<InvestmentTransaction>) => Promise<void>;
  deleteInvestmentTransaction: (id: string) => Promise<void>;
  executeInvestmentAporte: (params: {
    assetId: string;
    quantity: number;
    price: number;
    date: string;
    sourceAccountId?: string;
    notes?: string;
  }) => Promise<{ transactionId: string }>;

  // Installment Plan Actions
  addInstallmentPlan: (plan: Omit<InstallmentPlan, 'id' | 'createdAt'>) => Promise<void>;
  deleteInstallmentPlan: (id: string, deleteTransactions?: boolean) => Promise<void>;

  // Transaction Actions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  updateTransaction: (id: string, tx: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  toggleTransactionStatus: (id: string) => Promise<void>;

  // Account Actions
  addAccount: (acc: Omit<Account, 'id' | 'currentBalance'>) => Promise<void>;
  updateAccount: (id: string, acc: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  // Credit Card Actions
  addCreditCard: (card: Omit<CreditCard, 'id' | 'currentInvoice'>) => Promise<void>;
  updateCreditCard: (id: string, card: Partial<CreditCard>) => Promise<void>;
  deleteCreditCard: (id: string) => Promise<void>;

  // Category Actions
  addCategory: (cat: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, cat: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Budget Actions
  setBudget: (categoryId: string, limitAmount: number) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;

  // Goal Actions & Ledger
  addGoal: (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => Promise<void>;
  updateGoal: (id: string, goal: Partial<FinancialGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addGoalDeposit: (id: string, amount: number, notes?: string, date?: string) => Promise<void>;
  addGoalMovement: (movement: Omit<GoalMovement, 'id' | 'createdAt'>) => Promise<void>;
  deleteGoalMovement: (id: string) => Promise<void>;

  // Analytics & Aggregates
  summary: {
    totalNetWorth: number;
    totalAccountsBalance: number;
    totalCreditCardDebt: number;
    monthRealizedIncome: number;
    monthExpectedIncome: number;
    monthRealizedExpense: number;
    monthExpectedExpense: number;
    monthNetBalance: number;
    savingsRate: number;
  };

  // Backup & Restore
  exportData: (passphrase?: string) => Promise<string>;
  importData: (content: string, passphrase?: string) => Promise<{ success: boolean; message: string }>;
  resetToDefaults: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'finflow_app_';
const HAS_INITIALIZED_KEY = STORAGE_KEY_PREFIX + 'has_initialized';
const DEMO_CLEARED_KEY = STORAGE_KEY_PREFIX + 'demo_cleared';

const getInitialData = <T,>(key: string, defaultValue: T): T => {
  try {
    const isDemoCleared = localStorage.getItem(DEMO_CLEARED_KEY) === 'true';
    if (isDemoCleared && key !== 'categories' && key !== 'currency') {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
      return (Array.isArray(defaultValue) ? [] : defaultValue) as unknown as T;
    }

    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + key);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (!isDemoCleared && key === 'investments' && Array.isArray(parsed) && parsed.length === 0) {
        localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(defaultValue));
        return defaultValue;
      }
      return parsed;
    }

    if (!isDemoCleared) {
      localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(defaultValue));
      return defaultValue;
    }

    const hasInit = localStorage.getItem(HAS_INITIALIZED_KEY);
    if (hasInit) {
      return (Array.isArray(defaultValue) ? [] : defaultValue) as unknown as T;
    }

    localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(defaultValue));
    return defaultValue;
  } catch {
    return defaultValue;
  }
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, isAuthReady } = useAuth();

  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    return (localStorage.getItem(STORAGE_KEY_PREFIX + 'currency') as CurrencyCode) || 'BRL';
  });

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return getCurrentMonth();
  });

  const [categories, setCategories] = useState<Category[]>(() =>
    getInitialData('categories', DEFAULT_CATEGORIES)
  );

  const [accounts, setAccounts] = useState<Account[]>(() =>
    getInitialData('accounts', INITIAL_ACCOUNTS)
  );

  const [creditCards, setCreditCards] = useState<CreditCard[]>(() =>
    getInitialData('credit_cards', INITIAL_CREDIT_CARDS)
  );

  const [budgets, setBudgets] = useState<Budget[]>(() =>
    getInitialData('budgets', INITIAL_BUDGETS)
  );

  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    const rawGoals = getInitialData<FinancialGoal[]>('goals', INITIAL_GOALS);
    const rawMovements = getInitialData<GoalMovement[]>('goal_movements', INITIAL_GOAL_MOVEMENTS);
    return rawGoals.map(g => {
      const movs = rawMovements.filter(m => m.goalId === g.id);
      const resolvedInitial = resolveGoalInitialAmount(g, movs);
      return {
        ...g,
        initialAmount: resolvedInitial,
        currentAmount: calculateGoalBalance(resolvedInitial, movs)
      };
    });
  });

  const [goalMovements, setGoalMovements] = useState<GoalMovement[]>(() =>
    getInitialData('goal_movements', INITIAL_GOAL_MOVEMENTS)
  );

  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>(() =>
    getInitialData('installment_plans', INITIAL_INSTALLMENT_PLANS)
  );

  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    getInitialData('transactions', INITIAL_TRANSACTIONS)
  );

  const [investments, setInvestments] = useState<InvestmentAsset[]>(() =>
    getInitialData('investments', INITIAL_INVESTMENTS)
  );
  const [investmentTransactions, setInvestmentTransactions] = useState<InvestmentTransaction[]>(() =>
    getInitialData('investment_transactions', INITIAL_INVESTMENT_TRANSACTIONS)
  );
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [lastQuotesUpdate, setLastQuotesUpdate] = useState<string | null>(null);

  // Set initial flag after first boot
  useEffect(() => {
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
  }, []);

  // Fila de operações pendentes e estado de sincronização
  const [pendingQueue, setPendingQueue] = useState<PendingSyncOperation[]>(() =>
    loadPendingQueueFromStorage()
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => {
    const queue = loadPendingQueueFromStorage();
    return queue.length > 0 ? 'pending' : 'synced';
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const pendingQueueRef = React.useRef(pendingQueue);
  useEffect(() => {
    pendingQueueRef.current = pendingQueue;
    savePendingQueueToStorage(pendingQueue);
  }, [pendingQueue]);

  const isCloudSynced = !!currentUser && syncStatus === 'synced' && pendingQueue.length === 0;

  // Local storage backups for offline support
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify(budgets));
  }, [budgets]);

  useEffect(() => {
    const sanitizedGoals = goals.map(g => {
      const movements = goalMovements.filter(m => m.goalId === g.id);
      const initial = resolveGoalInitialAmount(g, movements);
      return {
        ...g,
        initialAmount: initial,
        currentAmount: calculateGoalBalance(initial, movements)
      };
    });
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify(sanitizedGoals));
  }, [goals, goalMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify(goalMovements));
  }, [goalMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify(installmentPlans));
  }, [installmentPlans]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify(creditCards));
  }, [creditCards]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(investments));
  }, [investments]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(investmentTransactions));
  }, [investmentTransactions]);

  // Auto-process pending sync queue when user logs in or auth resolves
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;
    retrySync();
  }, [currentUser, isAuthReady]);

  // Auto-retry when device comes back online
  useEffect(() => {
    const handleOnline = () => {
      if (currentUser) {
        retrySync();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [currentUser]);

  // Real-time Firestore Sync when user is authenticated
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const uid = currentUser.uid;

    // Listen to Accounts
    const unsubAccounts = onSnapshot(
      collection(db, 'users', uid, 'accounts'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
        setAccounts(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'accounts', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar contas no Firestore:', error);
      }
    );

    // Listen to Credit Cards
    const unsubCards = onSnapshot(
      collection(db, 'users', uid, 'creditCards'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditCard));
        setCreditCards(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'creditCards', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar cartões no Firestore:', error);
      }
    );

    // Listen to Categories
    const unsubCats = onSnapshot(
      collection(db, 'users', uid, 'categories'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
        const effective = list.length > 0 ? list : DEFAULT_CATEGORIES;
        setCategories(prev => mergeCloudWithPending(effective, pendingQueueRef.current, 'categories', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar categorias no Firestore:', error);
      }
    );

    // Listen to Budgets
    const unsubBudgets = onSnapshot(
      collection(db, 'users', uid, 'budgets'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget));
        setBudgets(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'budgets', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar orçamentos no Firestore:', error);
      }
    );

    // Listen to Goals
    const unsubGoals = onSnapshot(
      collection(db, 'users', uid, 'goals'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            initialAmount: typeof data.initialAmount === 'number' ? data.initialAmount : undefined
          } as FinancialGoal;
        });
        setGoals(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'goals', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar metas no Firestore:', error);
      }
    );

    // Listen to Goal Movements (Ledger de metas - Etapa 7)
    const unsubGoalMovements = onSnapshot(
      collection(db, 'users', uid, 'goalMovements'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GoalMovement));
        setGoalMovements(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'goalMovements', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar movimentações de metas no Firestore:', error);
      }
    );

    // Listen to Installment Plans
    const unsubPlans = onSnapshot(
      collection(db, 'users', uid, 'installmentPlans'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstallmentPlan));
        setInstallmentPlans(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'installmentPlans', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar parcelamentos no Firestore:', error);
      }
    );

    // Listen to Transactions
    const unsubTransactions = onSnapshot(
      collection(db, 'users', uid, 'transactions'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        setTransactions(prev => {
          const merged = mergeCloudWithPending(list, pendingQueueRef.current, 'transactions', prev);
          return merged.sort((a, b) => b.date.localeCompare(a.date));
        });
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar transações no Firestore:', error);
      }
    );

    // Listen to Investments
    const unsubInvestments = onSnapshot(
      collection(db, 'users', uid, 'investments'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentAsset));
        setInvestments(prev => mergeCloudWithPending(list, pendingQueueRef.current, 'investments', prev));
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar investimentos no Firestore:', error);
      }
    );

    // Listen to Investment Transactions (Ledger de investimentos - Etapa 9)
    const unsubInvestmentTransactions = onSnapshot(
      collection(db, 'users', uid, 'investmentTransactions'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentTransaction));
        setInvestmentTransactions(prev => {
          const merged = mergeCloudWithPending(list, pendingQueueRef.current, 'investmentTransactions', prev);
          return merged.sort((a, b) => b.date.localeCompare(a.date));
        });
      },
      (error) => {
        console.warn('[FinFlow Sync] Erro ao escutar transações de investimentos no Firestore:', error);
      }
    );

    return () => {
      unsubAccounts();
      unsubCards();
      unsubCats();
      unsubBudgets();
      unsubGoals();
      unsubGoalMovements();
      unsubPlans();
      unsubTransactions();
      unsubInvestments();
      unsubInvestmentTransactions();
    };
  }, [currentUser, isAuthReady]);

  // Check if demo data is currently loaded and visible
  const isDemoActive = useMemo(() => {
    if (localStorage.getItem(DEMO_CLEARED_KEY) === 'true') return false;
    const hasDemoAccounts = accounts.some(a => a.id === 'acc-itau' || a.id === 'acc-nubank' || a.id === 'acc-xp');
    const hasDemoTx = transactions.some(t => t.id === 'tx-1' || t.id === 'tx-2' || t.id === 'tx-3');
    return hasDemoAccounts || hasDemoTx;
  }, [accounts, transactions]);

  // Seeds current dataset to Firestore for authenticated user (never forces demo data if user emptied state)
  const seedInitialDataToCloud = async (
    uid: string,
    customDataset?: {
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
  ) => {
    try {
      const items: { ref: any; data: any }[] = [];

      const targetCategories = customDataset?.categories ?? categories;
      const targetAccounts = customDataset?.accounts ?? accounts;
      const targetCards = customDataset?.creditCards ?? creditCards;
      const targetBudgets = customDataset?.budgets ?? budgets;
      const targetGoals = customDataset?.goals ?? goals;
      const targetMovements = customDataset?.goalMovements ?? goalMovements;
      const targetPlans = customDataset?.installmentPlans ?? installmentPlans;
      const targetTransactions = customDataset?.transactions ?? transactions;
      const targetInvestments = customDataset?.investments ?? investments;
      const targetInvestmentTxs = customDataset?.investmentTransactions ?? investmentTransactions;

      // Seed categories
      for (const cat of targetCategories) {
        items.push({
          ref: doc(db, 'users', uid, 'categories', cat.id),
          data: {
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            type: cat.type,
            userId: uid
          }
        });
      }

      // Seed accounts
      for (const acc of targetAccounts) {
        items.push({
          ref: doc(db, 'users', uid, 'accounts', acc.id),
          data: {
            name: acc.name,
            bankName: acc.bankName,
            type: acc.type,
            color: acc.color,
            initialBalance: acc.initialBalance,
            currentBalance: acc.currentBalance,
            icon: acc.icon,
            userId: uid
          }
        });
      }

      // Seed credit cards
      for (const card of targetCards) {
        items.push({
          ref: doc(db, 'users', uid, 'creditCards', card.id),
          data: {
            name: card.name,
            bankName: card.bankName,
            color: card.color,
            limit: card.limit,
            closingDay: card.closingDay,
            dueDay: card.dueDay,
            currentInvoice: card.currentInvoice,
            userId: uid
          }
        });
      }

      // Seed budgets
      for (const b of targetBudgets) {
        items.push({
          ref: doc(db, 'users', uid, 'budgets', b.id),
          data: {
            categoryId: b.categoryId,
            month: b.month,
            limitAmount: b.limitAmount,
            userId: uid
          }
        });
      }

      // Seed goals - Preserva explicitamente initialAmount para evitar dupla contagem pós-reload (Etapa 9.6A)
      for (const g of targetGoals) {
        const movements = targetMovements.filter(m => m.goalId === g.id);
        const resolvedInitial = resolveGoalInitialAmount(g, movements);
        const derivedBalance = calculateGoalBalance(resolvedInitial, movements);
        items.push({
          ref: doc(db, 'users', uid, 'goals', g.id),
          data: {
            name: g.name,
            targetAmount: g.targetAmount,
            initialAmount: resolvedInitial,
            currentAmount: derivedBalance,
            targetDate: g.targetDate,
            color: g.color,
            icon: g.icon,
            notes: g.notes || '',
            userId: uid
          }
        });
      }

      // Seed goal movements (Ledger de metas - Etapa 7)
      for (const mov of targetMovements) {
        items.push({
          ref: doc(db, 'users', uid, 'goalMovements', mov.id),
          data: {
            goalId: mov.goalId,
            type: mov.type,
            amount: mov.amount,
            date: mov.date,
            createdAt: mov.createdAt,
            ...(mov.notes ? { notes: mov.notes } : {}),
            userId: uid
          }
        });
      }

      // Seed installment plans
      for (const p of targetPlans) {
        items.push({
          ref: doc(db, 'users', uid, 'installmentPlans', p.id),
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
            createdAt: p.createdAt
          }
        });
      }

      // Seed transactions
      for (const tx of targetTransactions) {
        items.push({
          ref: doc(db, 'users', uid, 'transactions', tx.id),
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
            createdAt: tx.createdAt
          }
        });
      }

      // Seed investments
      for (const inv of targetInvestments) {
        items.push({
          ref: doc(db, 'users', uid, 'investments', inv.id),
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
            createdAt: inv.createdAt
          }
        });
      }

      // Seed investment transactions (Ledger de investimentos - Etapa 9)
      for (const itx of targetInvestmentTxs) {
        items.push({
          ref: doc(db, 'users', uid, 'investmentTransactions', itx.id),
          data: {
            assetId: itx.assetId,
            type: itx.type,
            date: itx.date,
            quantity: itx.quantity,
            price: itx.price,
            totalAmount: itx.totalAmount,
            ...(itx.notes ? { notes: itx.notes } : {}),
            userId: uid,
            createdAt: itx.createdAt
          }
        });
      }

      for (let i = 0; i < items.length; i += 400) {
        const chunk = items.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(item => batch.set(item.ref, item.data));
        await batch.commit();
      }
    } catch (err) {
      console.error('Error syncing user cloud data:', err);
      throw err;
    }
  };

  /**
   * Remove valores undefined de objetos para evitar erros no Firestore
   * ("Function setDoc() called with invalid data. Unsupported field value: undefined").
   */
  const sanitizePayload = (obj: any, isRoot = true): any => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const clean: any = {};
    for (const [key, val] of Object.entries(obj)) {
      if (isRoot && key === 'id') continue;
      if (val !== undefined) {
        if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
          clean[key] = sanitizePayload(val, false);
        } else {
          clean[key] = val;
        }
      }
    }
    return clean;
  };

  /**
   * Executa a sincronização de uma operação com o Firestore de forma segura e resiliente.
   * Se a gravação falhar ou o usuário não estiver autenticado, a operação é salva na fila de pendências para retry,
   * garantindo que o FinFlow nunca silencie um erro nem perca a alteração local.
   */
  const executeSync = async (
    collectionName: SyncCollection,
    docId: string,
    type: SyncOperationType,
    payload?: any
  ): Promise<boolean> => {
    const clean = sanitizePayload(payload);

    if (!currentUser) {
      setPendingQueue(prev => enqueueOperation(prev, {
        collection: collectionName,
        docId,
        type,
        payload: clean,
        lastError: 'Aguardando autenticação na conta Google'
      }));
      return true;
    }

    try {
      const docRef = doc(db, 'users', currentUser.uid, collectionName, docId);
      if (type === 'set') {
        await setDoc(docRef, clean);
      } else if (type === 'update') {
        await setDoc(docRef, clean, { merge: true });
      } else if (type === 'delete') {
        await deleteDoc(docRef);
      }

      setPendingQueue(prev => {
        const next = dequeueOperation(prev, collectionName, docId);
        if (next.length === 0) {
          setSyncStatus('synced');
          setSyncError(null);
        }
        return next;
      });
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[FinFlow Sync] Falha ao sincronizar ${collectionName}/${docId} (${type}):`, errMsg);

      setPendingQueue(prev => enqueueOperation(prev, {
        collection: collectionName,
        docId,
        type,
        payload: clean,
        lastError: errMsg
      }));
      setSyncStatus('error');
      setSyncError('Falha temporária ao sincronizar com a nuvem. Sua alteração está segura localmente.');
      return false;
    }
  };

  /**
   * Reprocessa todas as operações pendentes na fila de sincronização.
   * Evita duplicação porque utiliza IDs fixos e operações idempotentes (setDoc / deleteDoc).
   */
  const retrySync = async (): Promise<boolean> => {
    if (!currentUser) return false;
    const currentQueue = pendingQueueRef.current;
    if (currentQueue.length === 0) {
      setSyncStatus('synced');
      setSyncError(null);
      return true;
    }

    setSyncStatus('pending');
    let remaining = [...currentQueue];
    let allSucceeded = true;

    for (const op of currentQueue) {
      try {
        const docRef = doc(db, 'users', currentUser.uid, op.collection, op.docId);
        const payloadWithUser = op.payload
          ? { ...op.payload, userId: currentUser.uid }
          : op.payload;
        const clean = sanitizePayload(payloadWithUser);

        if (op.type === 'set') {
          await setDoc(docRef, clean);
        } else if (op.type === 'update') {
          await setDoc(docRef, clean, { merge: true });
        } else if (op.type === 'delete') {
          await deleteDoc(docRef);
        }
        remaining = dequeueOperation(remaining, op.collection, op.docId);
      } catch (err) {
        allSucceeded = false;
        const errMsg = err instanceof Error ? err.message : String(err);
        remaining = enqueueOperation(remaining, {
          collection: op.collection,
          docId: op.docId,
          type: op.type,
          payload: op.payload,
          lastError: errMsg
        });
      }
    }

    setPendingQueue(remaining);
    if (allSucceeded && remaining.length === 0) {
      setSyncStatus('synced');
      setSyncError(null);
      return true;
    } else {
      setSyncStatus('error');
      setSyncError(`Ainda restam ${remaining.length} operações pendentes de sincronização.`);
      return false;
    }
  };

  const syncLocalToCloud = async () => {
    if (!currentUser) return;
    await retrySync();
    await seedInitialDataToCloud(currentUser.uid);
  };

  // Recalculate account and credit card balances from the single source of truth (transactions)
  const computedAccounts = useMemo(() => {
    return accounts.map(account => {
      const initial = typeof account.initialBalance === 'number'
        ? account.initialBalance
        : (typeof (account as any).currentBalance === 'number' ? (account as any).currentBalance : 0);
      return {
        ...account,
        initialBalance: initial,
        currentBalance: calculateAccountBalance(initial, account.id, transactions)
      };
    });
  }, [accounts, transactions]);

  const computedCreditCards = useMemo(() => {
    return creditCards.map(card => ({
      ...card,
      currentInvoice: calculateCreditCardInvoice(card.id, transactions)
    }));
  }, [creditCards, transactions]);

  // Recalculate goal balances from single source of truth (initialAmount + GoalMovements)
  const computedGoals = useMemo(() => {
    return goals.map(goal => {
      const movements = goalMovements.filter(m => m.goalId === goal.id);
      const initial = resolveGoalInitialAmount(goal, movements);
      const derivedBalance = calculateGoalBalance(initial, movements);
      return {
        ...goal,
        initialAmount: initial,
        currentAmount: derivedBalance
      };
    });
  }, [goals, goalMovements]);

  // Monthly summary calculated via pure domain function
  const summary = useMemo(() => {
    return calculateMonthlySummary(computedAccounts, computedCreditCards, transactions, selectedMonth);
  }, [computedAccounts, computedCreditCards, transactions, selectedMonth]);

  // Comprometimentos futuros projetados para os próximos 6 meses
  const futureCommitments = useMemo(() => {
    return calculateFutureCommitments(transactions, 6, selectedMonth);
  }, [transactions, selectedMonth]);

  const goToPreviousMonth = () => setSelectedMonth(prev => getPreviousMonth(prev));
  const goToNextMonth = () => setSelectedMonth(prev => getNextMonth(prev));
  const goToCurrentMonth = () => setSelectedMonth(getCurrentMonth());
  const setCurrency = (c: CurrencyCode) => setCurrencyState(c);

  // Transaction CRUD (Local + Firestore)
  const addTransaction = async (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newId = generateId('tx');
    const createdAt = new Date().toISOString();
    const newTx: Transaction = {
      ...tx,
      id: newId,
      createdAt
    };

    setTransactions(prev => [newTx, ...prev]);

    if (currentUser) {
      await executeSync('transactions', newId, 'set', {
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        categoryId: tx.categoryId || 'cat-outros',
        accountId: tx.accountId,
        targetAccountId: tx.targetAccountId || '',
        creditCardId: tx.creditCardId || '',
        paymentMethod: tx.paymentMethod,
        date: tx.date,
        status: tx.status,
        notes: tx.notes || '',
        isRecurring: !!tx.isRecurring,
        userId: currentUser.uid,
        createdAt
      });
    }
  };

  const updateTransaction = async (id: string, updatedFields: Partial<Transaction>) => {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, ...updatedFields } : tx));

    if (currentUser) {
      await executeSync('transactions', id, 'update', {
        ...updatedFields,
        userId: currentUser.uid
      });
    }
  };

  const deleteTransaction = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setTransactions(prev => prev.filter(tx => tx.id !== id));

    if (currentUser) {
      await executeSync('transactions', id, 'delete');
    }
  };

  const toggleTransactionStatus = async (id: string) => {
    const target = transactions.find(t => t.id === id);
    if (!target) return;
    const newStatus = target.status === 'completed' ? 'pending' : 'completed';
    await updateTransaction(id, { status: newStatus });
  };

  // Account CRUD
  const addAccount = async (acc: Omit<Account, 'id' | 'currentBalance'>) => {
    const newId = generateId('acc');
    const newAcc: Account = {
      ...acc,
      id: newId,
      currentBalance: acc.initialBalance
    };

    setAccounts(prev => [...prev, newAcc]);

    if (currentUser) {
      await executeSync('accounts', newId, 'set', {
        name: acc.name,
        bankName: acc.bankName,
        type: acc.type,
        color: acc.color,
        initialBalance: acc.initialBalance,
        currentBalance: acc.initialBalance,
        icon: acc.icon,
        userId: currentUser.uid
      });
    }
  };

  const updateAccount = async (id: string, updatedFields: Partial<Account>) => {
    setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, ...updatedFields } : acc));

    if (currentUser) {
      await executeSync('accounts', id, 'update', {
        ...updatedFields,
        userId: currentUser.uid
      });
    }
  };

  const deleteAccount = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setAccounts(prev => prev.filter(acc => acc.id !== id));

    if (currentUser) {
      await executeSync('accounts', id, 'delete');
    }
  };

  // Credit Card CRUD
  const addCreditCard = async (card: Omit<CreditCard, 'id' | 'currentInvoice'>) => {
    const newId = generateId('card');
    const newCard: CreditCard = {
      ...card,
      id: newId,
      currentInvoice: 0
    };

    setCreditCards(prev => [...prev, newCard]);

    if (currentUser) {
      await executeSync('creditCards', newId, 'set', {
        name: card.name,
        bankName: card.bankName,
        color: card.color,
        limit: card.limit,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        currentInvoice: 0,
        userId: currentUser.uid
      });
    }
  };

  const updateCreditCard = async (id: string, updatedFields: Partial<CreditCard>) => {
    setCreditCards(prev => prev.map(c => c.id === id ? { ...c, ...updatedFields } : c));

    if (currentUser) {
      await executeSync('creditCards', id, 'update', {
        ...updatedFields,
        userId: currentUser.uid
      });
    }
  };

  const deleteCreditCard = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setCreditCards(prev => prev.filter(c => c.id !== id));

    if (currentUser) {
      await executeSync('creditCards', id, 'delete');
    }
  };

  // Category CRUD
  const addCategory = async (cat: Omit<Category, 'id'>) => {
    const newId = generateId('cat');
    const newCat: Category = { ...cat, id: newId };
    setCategories(prev => [...prev, newCat]);

    if (currentUser) {
      await executeSync('categories', newId, 'set', {
        ...cat,
        userId: currentUser.uid
      });
    }
  };

  const updateCategory = async (id: string, updatedFields: Partial<Category>) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updatedFields } : c));

    if (currentUser) {
      await executeSync('categories', id, 'update', {
        ...updatedFields,
        userId: currentUser.uid
      });
    }
  };

  const deleteCategory = async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));

    if (currentUser) {
      await executeSync('categories', id, 'delete');
    }
  };

  // Budget Actions
  const setBudget = async (categoryId: string, limitAmount: number) => {
    const existing = budgets.find(b => b.categoryId === categoryId && b.month === selectedMonth);
    const budgetId = existing ? existing.id : generateId('b');

    setBudgets(prev => {
      const existingIndex = prev.findIndex(b => b.categoryId === categoryId && b.month === selectedMonth);
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = { ...copy[existingIndex], limitAmount };
        return copy;
      }
      return [...prev, { id: budgetId, categoryId, month: selectedMonth, limitAmount }];
    });

    if (currentUser) {
      await executeSync('budgets', budgetId, 'set', {
        categoryId,
        month: selectedMonth,
        limitAmount,
        userId: currentUser.uid
      });
    }
  };

  const deleteBudget = async (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id));

    if (currentUser) {
      await executeSync('budgets', id, 'delete');
    }
  };

  // Goal Actions & Ledger
  const addGoal = async (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => {
    const newId = generateId('goal');
    const initialAmount = (goal as any).initialAmount ?? 0;
    const newGoal: FinancialGoal = {
      ...goal,
      id: newId,
      initialAmount,
      currentAmount: initialAmount
    };
    setGoals(prev => [...prev, newGoal]);

    if (currentUser) {
      await executeSync('goals', newId, 'set', {
        name: goal.name,
        targetAmount: goal.targetAmount,
        initialAmount,
        currentAmount: initialAmount,
        targetDate: goal.targetDate,
        color: goal.color,
        icon: goal.icon,
        notes: goal.notes || '',
        userId: currentUser.uid
      });
    }
  };

  const updateGoal = async (id: string, updatedFields: Partial<FinancialGoal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updatedFields } : g));

    if (currentUser) {
      await executeSync('goals', id, 'update', {
        ...updatedFields,
        userId: currentUser.uid
      });
    }
  };

  const deleteGoal = async (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    const movementsToDelete = goalMovements.filter(m => m.goalId === id);
    setGoalMovements(prev => prev.filter(m => m.goalId !== id));

    if (currentUser) {
      await executeSync('goals', id, 'delete');
      for (const mov of movementsToDelete) {
        await executeSync('goalMovements', mov.id, 'delete');
      }
    }
  };

  const addGoalMovement = async (movement: Omit<GoalMovement, 'id' | 'createdAt'>) => {
    const newId = generateId('gmov');
    const createdAt = new Date().toISOString();
    const newMovement: GoalMovement = {
      ...movement,
      id: newId,
      amount: Math.abs(movement.amount),
      createdAt
    };

    setGoalMovements(prev => [...prev, newMovement]);

    // Atualiza compatibilidade/cache no documento da meta
    const targetGoal = goals.find(g => g.id === movement.goalId);
    if (targetGoal) {
      const remainingMovements = goalMovements.filter(m => m.goalId === movement.goalId);
      const initial = resolveGoalInitialAmount(targetGoal, remainingMovements);
      const updatedBalance = calculateGoalBalance(initial, [...remainingMovements, newMovement]);
      
      setGoals(prev => prev.map(g => g.id === targetGoal.id ? { ...g, initialAmount: initial, currentAmount: updatedBalance } : g));
      if (currentUser) {
        await executeSync('goals', targetGoal.id, 'update', {
          initialAmount: initial,
          currentAmount: updatedBalance,
          userId: currentUser.uid
        });
      }
    }

    if (currentUser) {
      await executeSync('goalMovements', newId, 'set', {
        goalId: newMovement.goalId,
        type: newMovement.type,
        amount: newMovement.amount,
        date: newMovement.date,
        createdAt: newMovement.createdAt,
        notes: newMovement.notes || '',
        userId: currentUser.uid
      });
    }
  };

  const addGoalDeposit = async (
    id: string,
    amount: number,
    notes?: string,
    date?: string
  ) => {
    const isWithdrawal = amount < 0;
    const type: GoalMovementType = isWithdrawal ? 'withdrawal' : 'deposit';
    const absAmount = Math.abs(amount);
    const movDate = date || new Date().toISOString().split('T')[0];

    await addGoalMovement({
      goalId: id,
      type,
      amount: absAmount,
      date: movDate,
      notes: notes || (isWithdrawal ? 'Resgate da meta' : 'Aporte na meta')
    });
  };

  const deleteGoalMovement = async (id: string) => {
    const target = goalMovements.find(m => m.id === id);
    setGoalMovements(prev => prev.filter(m => m.id !== id));

    if (target) {
      const goal = goals.find(g => g.id === target.goalId);
      if (goal) {
        const remainingMovements = goalMovements.filter(m => m.goalId === target.goalId && m.id !== id);
        const initial = resolveGoalInitialAmount(goal, remainingMovements);
        const updatedBalance = calculateGoalBalance(initial, remainingMovements);
        setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, initialAmount: initial, currentAmount: updatedBalance } : g));
        if (currentUser) {
          await executeSync('goals', goal.id, 'update', {
            initialAmount: initial,
            currentAmount: updatedBalance,
            userId: currentUser.uid
          });
        }
      }
    }

    if (currentUser) {
      await executeSync('goalMovements', id, 'delete');
    }
  };

  // Installment Plans CRUD
  const addInstallmentPlan = async (plan: Omit<InstallmentPlan, 'id' | 'createdAt'>) => {
    const planId = generateId('plan');
    const createdAt = new Date().toISOString();
    const newPlan: InstallmentPlan = {
      ...plan,
      id: planId,
      createdAt
    };

    // Gera o cronograma exato com distribuição correta de centavos e dias do mês
    const schedule = calculateInstallmentSchedule(
      plan.totalAmount,
      plan.totalInstallments,
      plan.startDate
    );
    const newTransactions: Transaction[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const item of schedule) {
      const txId = `tx-${planId}-${item.number}`;
      const isPastOrToday = item.date <= todayStr;

      const tx: Transaction = {
        id: txId,
        description: `${plan.description} (${item.number}/${plan.totalInstallments})`,
        amount: item.amount,
        type: plan.type,
        categoryId: plan.categoryId || 'cat-compras',
        accountId: plan.accountId,
        creditCardId: plan.creditCardId || '',
        paymentMethod: plan.paymentMethod,
        date: item.date,
        status: isPastOrToday ? 'completed' : 'pending',
        installmentPlanId: planId,
        installments: {
          current: item.number,
          total: plan.totalInstallments,
          parentTransactionId: planId
        },
        createdAt
      };

      newTransactions.push(tx);
    }

    setInstallmentPlans(prev => [newPlan, ...prev]);
    setTransactions(prev => [...newTransactions, ...prev].sort((a, b) => b.date.localeCompare(a.date)));

    if (currentUser) {
      const planPayload = {
        description: plan.description,
        totalAmount: plan.totalAmount,
        installmentAmount: plan.installmentAmount,
        totalInstallments: plan.totalInstallments,
        type: plan.type,
        categoryId: plan.categoryId || 'cat-compras',
        accountId: plan.accountId,
        creditCardId: plan.creditCardId || '',
        paymentMethod: plan.paymentMethod,
        startDate: plan.startDate,
        userId: currentUser.uid,
        createdAt
      };

      try {
        const batch = writeBatch(db);
        const planRef = doc(db, 'users', currentUser.uid, 'installmentPlans', planId);
        batch.set(planRef, planPayload);

        for (const tx of newTransactions) {
          const txRef = doc(db, 'users', currentUser.uid, 'transactions', tx.id);
          batch.set(txRef, {
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            categoryId: tx.categoryId,
            accountId: tx.accountId,
            creditCardId: tx.creditCardId || '',
            paymentMethod: tx.paymentMethod,
            date: tx.date,
            status: tx.status,
            installmentPlanId: planId,
            installments: tx.installments,
            userId: currentUser.uid,
            createdAt
          });
        }

        await batch.commit();

        setPendingQueue(prev => {
          let next = dequeueOperation(prev, 'installmentPlans', planId);
          for (const tx of newTransactions) {
            next = dequeueOperation(next, 'transactions', tx.id);
          }
          if (next.length === 0) {
            setSyncStatus('synced');
            setSyncError(null);
          }
          return next;
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[FinFlow Sync] Falha ao sincronizar parcelamento no Firestore (${planId}):`, errMsg);

        setPendingQueue(prev => {
          let next = enqueueOperation(prev, {
            collection: 'installmentPlans',
            docId: planId,
            type: 'set',
            payload: planPayload,
            lastError: errMsg
          });
          for (const tx of newTransactions) {
            next = enqueueOperation(next, {
              collection: 'transactions',
              docId: tx.id,
              type: 'set',
              payload: {
                description: tx.description,
                amount: tx.amount,
                type: tx.type,
                categoryId: tx.categoryId,
                accountId: tx.accountId,
                creditCardId: tx.creditCardId || '',
                paymentMethod: tx.paymentMethod,
                date: tx.date,
                status: tx.status,
                installmentPlanId: planId,
                installments: tx.installments,
                userId: currentUser.uid,
                createdAt
              },
              lastError: errMsg
            });
          }
          return next;
        });
        setSyncStatus('error');
        setSyncError('Falha temporária ao sincronizar o parcelamento com a nuvem. Lançamentos preservados localmente.');
      }
    }
  };

  const deleteInstallmentPlan = async (planId: string, deleteTransactions: boolean = true) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setInstallmentPlans(prev => prev.filter(p => p.id !== planId));
    if (deleteTransactions) {
      setTransactions(prev => prev.filter(t => t.installmentPlanId !== planId));
    }

    if (currentUser) {
      const associated = transactions.filter(t => t.installmentPlanId === planId);
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'users', currentUser.uid, 'installmentPlans', planId));
        if (deleteTransactions) {
          for (const t of associated) {
            batch.delete(doc(db, 'users', currentUser.uid, 'transactions', t.id));
          }
        }
        await batch.commit();

        setPendingQueue(prev => {
          let next = dequeueOperation(prev, 'installmentPlans', planId);
          for (const t of associated) {
            next = dequeueOperation(next, 'transactions', t.id);
          }
          if (next.length === 0) {
            setSyncStatus('synced');
            setSyncError(null);
          }
          return next;
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[FinFlow Sync] Falha ao excluir parcelamento no Firestore (${planId}):`, errMsg);

        setPendingQueue(prev => {
          let next = enqueueOperation(prev, {
            collection: 'installmentPlans',
            docId: planId,
            type: 'delete',
            lastError: errMsg
          });
          if (deleteTransactions) {
            for (const t of associated) {
              next = enqueueOperation(next, {
                collection: 'transactions',
                docId: t.id,
                type: 'delete',
                lastError: errMsg
              });
            }
          }
          return next;
        });
        setSyncStatus('error');
        setSyncError('Falha temporária ao sincronizar exclusão do parcelamento. Ajustado localmente.');
      }
    }
  };

  // Investment Actions
  const refreshInvestmentQuotes = async () => {
    if (investments.length === 0) return;
    setIsRefreshingQuotes(true);

    const autoTickers = investments
      .filter(inv => inv.autoUpdate && inv.ticker)
      .map(inv => inv.ticker);

    if (autoTickers.length === 0) {
      setIsRefreshingQuotes(false);
      return;
    }

    try {
      const { quotes } = await fetchMarketQuotes(autoTickers);
      if (quotes && Object.keys(quotes).length > 0) {
        setInvestments(prev => prev.map(inv => {
          const upper = inv.ticker.toUpperCase();
          const q = quotes[upper] || quotes[`${upper}.SA`];
          if (q && typeof q.price === 'number') {
            return {
              ...inv,
              currentPrice: q.price,
              previousClose: q.previousClose,
              changePercent: q.changePercent,
              lastPriceUpdate: q.updatedAt || new Date().toISOString()
            };
          }
          return inv;
        }));
        setLastQuotesUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err) {
      console.warn('Erro ao atualizar cotações de investimentos:', err);
    } finally {
      setIsRefreshingQuotes(false);
    }
  };

  // Initial quotes refresh on boot
  useEffect(() => {
    refreshInvestmentQuotes();
  }, []);

  const addInvestment = async (asset: Omit<InvestmentAsset, 'id' | 'createdAt'>): Promise<string> => {
    const newId = generateId('inv');
    const createdAt = new Date().toISOString();
    const newAsset: InvestmentAsset = {
      ...asset,
      id: newId,
      createdAt
    };

    setInvestments(prev => [...prev, newAsset]);

    const syncPayload = {
      id: newId,
      ticker: newAsset.ticker,
      name: newAsset.name,
      type: newAsset.type,
      quantity: newAsset.quantity,
      averagePrice: newAsset.averagePrice,
      currentPrice: newAsset.currentPrice,
      currency: newAsset.currency,
      autoUpdate: !!newAsset.autoUpdate,
      ...(newAsset.previousClose !== undefined ? { previousClose: newAsset.previousClose } : {}),
      ...(newAsset.changePercent !== undefined ? { changePercent: newAsset.changePercent } : {}),
      ...(newAsset.institution ? { institution: newAsset.institution } : {}),
      ...(newAsset.lastPriceUpdate ? { lastPriceUpdate: newAsset.lastPriceUpdate } : {}),
      ...(newAsset.notes ? { notes: newAsset.notes } : {}),
      userId: currentUser?.uid || '',
      createdAt
    };

    await executeSync('investments', newId, 'set', syncPayload);

    if (newAsset.autoUpdate && newAsset.ticker) {
      setTimeout(() => {
        refreshInvestmentQuotes();
      }, 200);
    }

    return newId;
  };

  const updateInvestment = async (id: string, updates: Partial<InvestmentAsset>) => {
    setInvestments(prev => prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv));

    await executeSync('investments', id, 'update', {
      ...updates,
      userId: currentUser?.uid || ''
    });
  };

  const deleteInvestment = async (id: string) => {
    setInvestments(prev => prev.filter(inv => inv.id !== id));
    await executeSync('investments', id, 'delete');
  };

  const loadSampleInvestments = async () => {
    setInvestments(INITIAL_INVESTMENTS);
    setInvestmentTransactions(INITIAL_INVESTMENT_TRANSACTIONS);
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(INITIAL_INVESTMENTS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(INITIAL_INVESTMENT_TRANSACTIONS));
    await refreshInvestmentQuotes();
  };

  // Investment Transactions Actions (Ledger de investimentos - Etapa 9)
  const addInvestmentTransaction = async (tx: Omit<InvestmentTransaction, 'id' | 'createdAt'>): Promise<string> => {
    // Integridade referencial: o ativo deve existir na carteira
    const assetExists = investments.some(a => a.id === tx.assetId);
    if (!assetExists) {
      throw new Error(`Ativo de investimento com ID "${tx.assetId}" não encontrado na carteira.`);
    }

    const validatedTx = createInvestmentTransaction(tx, investments);

    setInvestmentTransactions(prev => [validatedTx, ...prev]);

    const syncTxPayload = {
      id: validatedTx.id,
      assetId: validatedTx.assetId,
      type: validatedTx.type,
      date: validatedTx.date,
      quantity: validatedTx.quantity,
      price: validatedTx.price,
      totalAmount: validatedTx.totalAmount,
      ...(validatedTx.notes ? { notes: validatedTx.notes } : {}),
      userId: currentUser?.uid || '',
      createdAt: validatedTx.createdAt
    };

    await executeSync('investmentTransactions', validatedTx.id, 'set', syncTxPayload);

    return validatedTx.id;
  };

  const updateInvestmentTransaction = async (id: string, updates: Partial<InvestmentTransaction>) => {
    const existing = investmentTransactions.find(t => t.id === id);
    if (!existing) {
      throw new Error(`Operação de investimento com ID "${id}" não encontrada.`);
    }

    const merged: InvestmentTransaction = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt
    };

    // Se totalAmount não foi explicitamente alterado, mas quantidade ou preço mudaram em buy/sell, recalcula
    if (
      updates.totalAmount === undefined &&
      (updates.quantity !== undefined || updates.price !== undefined) &&
      (merged.type === 'buy' || merged.type === 'sell')
    ) {
      merged.totalAmount = calculateTransactionTotal(merged.quantity, merged.price);
    }

    const validation = validateInvestmentTransaction(merged, investments);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Dados da operação inválidos.');
    }

    setInvestmentTransactions(prev => prev.map(t => t.id === id ? merged : t));

    await executeSync('investmentTransactions', id, 'update', {
      ...updates,
      ...(updates.totalAmount === undefined && (merged.type === 'buy' || merged.type === 'sell')
        ? { totalAmount: merged.totalAmount }
        : {}),
      userId: currentUser?.uid || ''
    });
  };

  const deleteInvestmentTransaction = async (id: string) => {
    setInvestmentTransactions(prev => prev.filter(t => t.id !== id));
    await executeSync('investmentTransactions', id, 'delete');
  };

  /**
   * Executa um aporte financeiro em um ativo de investimento:
   * 1. Registra a operação no ledger ('buy') com precisão de centavos
   * 2. Recalcula e atualiza a quantidade e o preço médio ponderado do ativo
   * 3. Opcionalmente debita o valor da conta financeira selecionada
   */
  const executeInvestmentAporte = async (params: {
    assetId: string;
    quantity: number;
    price: number;
    date: string;
    sourceAccountId?: string;
    notes?: string;
  }): Promise<{ transactionId: string }> => {
    const targetAsset = investments.find(a => a.id === params.assetId);
    if (!targetAsset) {
      throw new Error(`Ativo com ID "${params.assetId}" não encontrado na carteira.`);
    }

    if (params.quantity <= 0) {
      throw new Error('A quantidade do aporte deve ser maior que zero.');
    }
    if (params.price <= 0) {
      throw new Error('O preço unitário do aporte deve ser maior que zero.');
    }

    const totalAmount = calculateTransactionTotal(params.quantity, params.price);

    // 1. Registra no ledger de operações de investimentos
    const txId = await addInvestmentTransaction({
      assetId: params.assetId,
      type: 'buy',
      date: params.date,
      quantity: params.quantity,
      price: params.price,
      totalAmount,
      notes: params.notes?.trim() || `Aporte de ${params.quantity} cotas em ${targetAsset.ticker}`
    });

    // 2. Atualiza a posição (quantidade e preço médio ponderado) do ativo
    const { newQuantity, newAveragePrice } = calculateAportePosition(
      { quantity: targetAsset.quantity, averagePrice: targetAsset.averagePrice },
      { quantity: params.quantity, price: params.price }
    );

    await updateInvestment(targetAsset.id, {
      quantity: newQuantity,
      averagePrice: newAveragePrice,
      lastPriceUpdate: new Date().toISOString()
    });

    // 3. Se selecionou uma conta financeira para débito, gera a transação correspondente
    if (params.sourceAccountId && params.sourceAccountId.trim().length > 0) {
      const investCat = categories.find(c => 
        c.id === 'cat-invest' || c.name.toLowerCase().includes('invest')
      );
      await addTransaction({
        description: `Aporte - ${targetAsset.ticker} (${params.quantity} cotas)`,
        amount: totalAmount,
        type: 'expense',
        accountId: params.sourceAccountId,
        categoryId: investCat ? investCat.id : 'cat-outros',
        paymentMethod: 'transfer',
        date: params.date,
        status: 'completed',
        notes: `Aporte de ${params.quantity} cotas a ${params.price} em ${targetAsset.ticker}. Operação: ${txId}`
      });
    }

    return { transactionId: txId };
  };

  // Backup & Restore
  const exportData = async (passphrase?: string): Promise<string> => {
    const backupPayload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      currency,
      categories,
      accounts,
      creditCards,
      budgets,
      goals,
      goalMovements,
      installmentPlans,
      transactions,
      investments,
      investmentTransactions
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);

    if (passphrase && passphrase.trim().length > 0) {
      const encrypted = await encryptData(jsonString, passphrase.trim());
      return JSON.stringify({
        isEncrypted: true,
        cipherText: encrypted,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      });
    }

    return jsonString;
  };

  const importData = async (content: string, passphrase?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const parsed = JSON.parse(content);
      let payload = parsed;

      if (parsed.isEncrypted && parsed.cipherText) {
        if (!passphrase || passphrase.trim().length === 0) {
          return { success: false, message: 'Este arquivo está criptografado. Insira a senha correta para restaurar.' };
        }
        const decryptedJson = await decryptData(parsed.cipherText, passphrase.trim());
        payload = JSON.parse(decryptedJson);
      }

      if (!payload.accounts || !payload.transactions) {
        return { success: false, message: 'Arquivo de backup inválido ou com formato incompatível.' };
      }

      localStorage.setItem(DEMO_CLEARED_KEY, 'true');

      const importedMovements: GoalMovement[] = payload.goalMovements || [];
      const normalizedGoals: FinancialGoal[] | undefined = payload.goals
        ? payload.goals.map((g: FinancialGoal) => {
            const movs = importedMovements.filter((m: GoalMovement) => m.goalId === g.id);
            const initial = resolveGoalInitialAmount(g, movs);
            return {
              ...g,
              initialAmount: initial,
              currentAmount: calculateGoalBalance(initial, movs)
            };
          })
        : undefined;

      if (payload.categories) setCategories(payload.categories);
      if (payload.accounts) setAccounts(payload.accounts);
      if (payload.creditCards) setCreditCards(payload.creditCards);
      if (payload.budgets) setBudgets(payload.budgets);
      if (normalizedGoals) setGoals(normalizedGoals);
      if (payload.goalMovements) setGoalMovements(payload.goalMovements);
      if (payload.installmentPlans) setInstallmentPlans(payload.installmentPlans);
      if (payload.transactions) setTransactions(payload.transactions);
      if (payload.investments) setInvestments(payload.investments);
      if (payload.investmentTransactions) setInvestmentTransactions(payload.investmentTransactions);
      if (payload.currency) setCurrencyState(payload.currency);

      if (currentUser) {
        await seedInitialDataToCloud(currentUser.uid, {
          categories: payload.categories,
          accounts: payload.accounts,
          creditCards: payload.creditCards,
          budgets: payload.budgets,
          goals: normalizedGoals,
          goalMovements: payload.goalMovements,
          installmentPlans: payload.installmentPlans,
          transactions: payload.transactions,
          investments: payload.investments,
          investmentTransactions: payload.investmentTransactions
        });
      }

      return { success: true, message: 'Backup restaurado com sucesso! Seus dados foram atualizados.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao importar dados.';
      return { success: false, message: msg };
    }
  };

  /**
   * Remove documentos de subcoleções do usuário no Firestore em lotes de até 400 escritas.
   * Permite filtrar quais documentos apagar (ex: apenas dados de exemplo em clearSampleData).
   */
  const deleteSubcollectionsFromFirestore = async (
    uid: string,
    subcollections: readonly string[],
    filterFn?: (sub: string, docId: string) => boolean
  ): Promise<void> => {
    for (const sub of subcollections) {
      const snap = await getDocs(collection(db, 'users', uid, sub));
      if (snap.empty) continue;
      let docsToDelete = snap.docs;
      if (filterFn) {
        docsToDelete = docsToDelete.filter(d => filterFn(sub, d.id));
      }
      if (docsToDelete.length === 0) continue;
      for (let i = 0; i < docsToDelete.length; i += 400) {
        const chunk = docsToDelete.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
  };

  /**
   * Grava determinística e estritamente os dados padrão no Firestore (Etapa 9.6A).
   * Garante que initialAmount das metas seja persistido e que coleções sejam salvas em lotes seguros.
   */
  const seedDefaultsToCloud = async (uid: string): Promise<void> => {
    const items: { ref: any; data: any }[] = [];

    for (const cat of DEFAULT_CATEGORIES) {
      items.push({
        ref: doc(db, 'users', uid, 'categories', cat.id),
        data: {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          type: cat.type,
          userId: uid
        }
      });
    }

    for (const acc of INITIAL_ACCOUNTS) {
      items.push({
        ref: doc(db, 'users', uid, 'accounts', acc.id),
        data: {
          name: acc.name,
          bankName: acc.bankName,
          type: acc.type,
          color: acc.color,
          initialBalance: acc.initialBalance,
          currentBalance: acc.currentBalance,
          icon: acc.icon,
          userId: uid
        }
      });
    }

    for (const card of INITIAL_CREDIT_CARDS) {
      items.push({
        ref: doc(db, 'users', uid, 'creditCards', card.id),
        data: {
          name: card.name,
          bankName: card.bankName,
          color: card.color,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          currentInvoice: card.currentInvoice,
          userId: uid
        }
      });
    }

    for (const b of INITIAL_BUDGETS) {
      items.push({
        ref: doc(db, 'users', uid, 'budgets', b.id),
        data: {
          categoryId: b.categoryId,
          month: b.month,
          limitAmount: b.limitAmount,
          userId: uid
        }
      });
    }

    for (const g of INITIAL_GOALS) {
      const movements = INITIAL_GOAL_MOVEMENTS.filter(m => m.goalId === g.id);
      const initial = resolveGoalInitialAmount(g, movements);
      const balance = calculateGoalBalance(initial, movements);
      items.push({
        ref: doc(db, 'users', uid, 'goals', g.id),
        data: {
          name: g.name,
          targetAmount: g.targetAmount,
          initialAmount: initial,
          currentAmount: balance,
          targetDate: g.targetDate,
          color: g.color,
          icon: g.icon,
          notes: g.notes || '',
          userId: uid
        }
      });
    }

    for (const mov of INITIAL_GOAL_MOVEMENTS) {
      items.push({
        ref: doc(db, 'users', uid, 'goalMovements', mov.id),
        data: {
          goalId: mov.goalId,
          type: mov.type,
          amount: mov.amount,
          date: mov.date,
          createdAt: mov.createdAt,
          ...(mov.notes ? { notes: mov.notes } : {}),
          userId: uid
        }
      });
    }

    for (const p of INITIAL_INSTALLMENT_PLANS) {
      items.push({
        ref: doc(db, 'users', uid, 'installmentPlans', p.id),
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
          createdAt: p.createdAt
        }
      });
    }

    for (const tx of INITIAL_TRANSACTIONS) {
      items.push({
        ref: doc(db, 'users', uid, 'transactions', tx.id),
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
          createdAt: tx.createdAt
        }
      });
    }

    for (const inv of INITIAL_INVESTMENTS) {
      items.push({
        ref: doc(db, 'users', uid, 'investments', inv.id),
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
          createdAt: inv.createdAt
        }
      });
    }

    for (const itx of INITIAL_INVESTMENT_TRANSACTIONS) {
      items.push({
        ref: doc(db, 'users', uid, 'investmentTransactions', itx.id),
        data: {
          assetId: itx.assetId,
          type: itx.type,
          date: itx.date,
          quantity: itx.quantity,
          price: itx.price,
          totalAmount: itx.totalAmount,
          ...(itx.notes ? { notes: itx.notes } : {}),
          userId: uid,
          createdAt: itx.createdAt
        }
      });
    }

    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach(item => batch.set(item.ref, item.data));
      await batch.commit();
    }
  };

  const resetToDefaults = async () => {
    const subcollections: readonly SyncCollection[] = [
      'transactions',
      'accounts',
      'creditCards',
      'categories',
      'budgets',
      'goals',
      'goalMovements',
      'installmentPlans',
      'investments',
      'investmentTransactions'
    ];

    if (currentUser) {
      const uid = currentUser.uid;
      try {
        setSyncStatus('pending');
        // Remove determinística e estritamente todos os documentos anteriores do usuário no Firestore
        await deleteSubcollectionsFromFirestore(uid, subcollections);
        // Grava determinística e estritamente os dados padrão canônicos
        await seedDefaultsToCloud(uid);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        console.error('Falha ao restaurar dados padrão no Firestore:', err);
        setSyncStatus('error');
        const msg = err instanceof Error ? err.message : 'Falha ao restaurar dados padrão na nuvem.';
        setSyncError(msg);
        throw new Error(`Não foi possível restaurar os dados padrão na nuvem: ${msg}`);
      }
    }

    setPendingQueue([]);
    savePendingQueueToStorage([]);

    localStorage.removeItem(DEMO_CLEARED_KEY);
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'categories', JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify(INITIAL_ACCOUNTS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify(INITIAL_CREDIT_CARDS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify(INITIAL_BUDGETS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify(INITIAL_GOALS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify(INITIAL_GOAL_MOVEMENTS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify(INITIAL_INSTALLMENT_PLANS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify(INITIAL_TRANSACTIONS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(INITIAL_INVESTMENTS));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(INITIAL_INVESTMENT_TRANSACTIONS));

    setCategories(DEFAULT_CATEGORIES);
    setAccounts(INITIAL_ACCOUNTS);
    setCreditCards(INITIAL_CREDIT_CARDS);
    setBudgets(INITIAL_BUDGETS);
    setGoals(INITIAL_GOALS);
    setGoalMovements(INITIAL_GOAL_MOVEMENTS);
    setInstallmentPlans(INITIAL_INSTALLMENT_PLANS);
    setTransactions(INITIAL_TRANSACTIONS);
    setInvestments(INITIAL_INVESTMENTS);
    setInvestmentTransactions(INITIAL_INVESTMENT_TRANSACTIONS);
    setCurrencyState('BRL');
    setSelectedMonth(getCurrentMonth());
  };

  // Clears all sample/mock data so the user can start from clean scratch
  const clearSampleData = async () => {
    const subcollections: readonly SyncCollection[] = [
      'transactions',
      'accounts',
      'creditCards',
      'categories',
      'budgets',
      'goals',
      'goalMovements',
      'installmentPlans',
      'investments',
      'investmentTransactions'
    ];

    if (currentUser) {
      const uid = currentUser.uid;
      try {
        setSyncStatus('pending');
        await deleteSubcollectionsFromFirestore(uid, subcollections, isSampleDataDocument);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        console.error('Falha ao remover dados de exemplo no Firestore:', err);
        setSyncStatus('error');
        const msg = err instanceof Error ? err.message : 'Falha ao remover dados de exemplo na nuvem.';
        setSyncError(msg);
        throw new Error(`Não foi possível remover dados de exemplo na nuvem: ${msg}`);
      }
    }

    // Filtra preservando estritamente os dados reais do usuário
    const filteredAccounts = filterOutSampleData('accounts', accounts);
    const filteredCards = filterOutSampleData('creditCards', creditCards);
    const filteredBudgets = filterOutSampleData('budgets', budgets);
    const filteredGoals = filterOutSampleData('goals', goals);
    const filteredGoalMovements = filterOutSampleData('goalMovements', goalMovements);
    const filteredPlans = filterOutSampleData('installmentPlans', installmentPlans);
    const filteredTransactions = filterOutSampleData('transactions', transactions);
    const filteredInvestments = filterOutSampleData('investments', investments);
    const filteredInvestmentTxs = filterOutSampleData('investmentTransactions', investmentTransactions);

    // Remove da fila pendente quaisquer operações relativas aos dados de demonstração
    setPendingQueue(prev => prev.filter(op => !isSampleDataDocument(op.collection, op.docId)));

    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify(filteredAccounts));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify(filteredCards));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify(filteredBudgets));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify(filteredGoals));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify(filteredGoalMovements));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify(filteredPlans));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify(filteredTransactions));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(filteredInvestments));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(filteredInvestmentTxs));

    setAccounts(filteredAccounts);
    setCreditCards(filteredCards);
    setBudgets(filteredBudgets);
    setGoals(filteredGoals);
    setGoalMovements(filteredGoalMovements);
    setInstallmentPlans(filteredPlans);
    setTransactions(filteredTransactions);
    setInvestments(filteredInvestments);
    setInvestmentTransactions(filteredInvestmentTxs);
  };

  const clearAllData = async () => {
    const subcollections: readonly SyncCollection[] = [
      'transactions',
      'accounts',
      'creditCards',
      'categories',
      'budgets',
      'goals',
      'goalMovements',
      'installmentPlans',
      'investments',
      'investmentTransactions'
    ];

    if (currentUser) {
      const uid = currentUser.uid;
      try {
        setSyncStatus('pending');
        await deleteSubcollectionsFromFirestore(uid, subcollections);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        console.error('Falha ao apagar dados no Firestore durante clearAllData:', err);
        setSyncStatus('error');
        const msg = err instanceof Error ? err.message : 'Falha ao apagar dados na nuvem.';
        setSyncError(msg);
        throw new Error(`Não foi possível apagar os dados na nuvem: ${msg}`);
      }
    }

    setPendingQueue([]);
    savePendingQueueToStorage([]);

    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'categories', JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify([]));

    setCategories(DEFAULT_CATEGORIES);
    setAccounts([]);
    setCreditCards([]);
    setBudgets([]);
    setGoals([]);
    setGoalMovements([]);
    setInstallmentPlans([]);
    setTransactions([]);
    setInvestments([]);
    setInvestmentTransactions([]);
  };

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        accounts: computedAccounts,
        creditCards: computedCreditCards,
        categories,
        budgets,
        goals: computedGoals,
        goalMovements,
        installmentPlans,
        investments,
        investmentTransactions,
        currency,
        selectedMonth,
        futureCommitments,
        isCloudSynced,
        syncStatus,
        syncError,
        pendingSyncCount: pendingQueue.length,
        retrySync,
        isDemoActive,
        clearSampleData,
        syncLocalToCloud,
        setCurrency,
        setSelectedMonth,
        goToPreviousMonth,
        goToNextMonth,
        goToCurrentMonth,
        addInvestment,
        updateInvestment,
        deleteInvestment,
        refreshInvestmentQuotes,
        loadSampleInvestments,
        isRefreshingQuotes,
        lastQuotesUpdate,
        addInvestmentTransaction,
        updateInvestmentTransaction,
        deleteInvestmentTransaction,
        executeInvestmentAporte,
        addInstallmentPlan,
        deleteInstallmentPlan,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        toggleTransactionStatus,
        addAccount,
        updateAccount,
        deleteAccount,
        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        addCategory,
        updateCategory,
        deleteCategory,
        setBudget,
        deleteBudget,
        addGoal,
        updateGoal,
        deleteGoal,
        addGoalDeposit,
        addGoalMovement,
        deleteGoalMovement,
        summary,
        exportData,
        importData,
        resetToDefaults,
        clearAllData
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
