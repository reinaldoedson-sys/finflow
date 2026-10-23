import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { 
  Transaction, 
  Account, 
  CreditCard, 
  Category, 
  Budget, 
  FinancialGoal, 
  GoalMovement,
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
  INITIAL_INVESTMENT_TRANSACTIONS
} from '../utils/mockData';
import { fetchMarketQuotes, getCachedQuotes } from '../services/marketQuotes';
import { getCurrentMonth, getPreviousMonth, getNextMonth } from '../utils/currency';
import { backupService } from '../services/backupService';
import { demoDataService } from '../services/demoDataService';
import { useAuth } from './AuthContext';
import { loadFirebase } from '../firebaseLoader';
import {
  db,
  isIndexedDBAvailable,
  migrateFromLocalStorageIfAvailable,
  loadAllFinancialEntities,
  replaceCollection,
  clearAllFinancialEntities,
} from '../storage/indexedDB';
import {
  IndexedDBTransactionRepository,
  IndexedDBAccountRepository,
  IndexedDBCreditCardRepository,
  IndexedDBInvestmentRepository,
  IndexedDBGoalRepository,
  IndexedDBBudgetRepository,
  IndexedDBCategoryRepository,
  IndexedDBInstallmentPlanRepository,
  IndexedDBSyncQueueRepository,
} from '../repositories/implementations';
import { SyncQueue } from '../services/syncQueue';
import { ConflictResolver } from '../services/conflictResolver';
import { FinancialSyncService } from '../services/financialSyncService';
import { FirestoreSyncProvider } from '../services/providers/FirestoreSyncProvider';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import {
  decideOwnership,
  canPushItem,
  getStoredLocalOwner,
  setStoredLocalOwner,
  getLocalStorageKeysToClearOnAccountSwitch,
  getLocalStorageKeysToClearOnWipe,
} from '../domain/localOwnership';
import {
  TransactionApplicationService,
  AccountApplicationService,
  GoalApplicationService,
  InvestmentApplicationService,
} from '../services/application';
import { generateId } from '../domain/id';
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
  calculateAllEffectiveInvestmentPositions,
  resolveAllEffectiveInvestments,
  compareAssetWithLedger,
  DerivedInvestmentPosition
} from '../domain/investmentPosition';
import {
  SyncStatus,
  PendingSyncOperation,
  SyncCollection,
  enqueueOperation,
  dequeueOperation,
  loadPendingQueueFromStorage,
  savePendingQueueToStorage
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
  computedInvestmentPositions: Record<string, DerivedInvestmentPosition>;
  getDerivedPosition: (assetId: string) => DerivedInvestmentPosition | undefined;
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
    idempotencyKey?: string;
    transactionId?: string;
    debitTransactionId?: string;
  }) => Promise<{ transactionId: string; debitTransactionId?: string }>;

  // Installment Plan Actions
  addInstallmentPlan: (plan: Omit<InstallmentPlan, 'id' | 'createdAt'>) => Promise<void>;
  updateInstallmentPlan?: (id: string, updates: Partial<InstallmentPlan>) => Promise<void>;
  deleteInstallmentPlan: (id: string, deleteTransactions?: boolean) => Promise<void>;

  // Transaction Actions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  updateTransaction: (id: string, tx: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  toggleTransactionStatus: (id: string) => Promise<void>;
  loadHistoricalTransactions: (options?: {
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    reset?: boolean;
  }) => Promise<{ count: number; hasMore: boolean }>;
  historicalPagination: {
    hasMore: boolean;
    isLoading: boolean;
  };

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
  isOwnershipConflict: boolean;
  confirmClearAndSwitchAccount: () => Promise<void>;
  cancelConflictLogout: () => Promise<void>;
  signOutAndWipeDevice: () => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'finflow_app_';
const HAS_INITIALIZED_KEY = STORAGE_KEY_PREFIX + 'has_initialized';
const DEMO_CLEARED_KEY = STORAGE_KEY_PREFIX + 'demo_cleared';

/**
 * Remove valores undefined de objetos para evitar erros no Firestore
 * ("Function setDoc() called with invalid data. Unsupported field value: undefined").
 */
const sanitizePayload = (obj: unknown, isRoot = true): unknown => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
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
  const { currentUser, isAuthReady, logout } = useAuth();

  // Guarda de Propriedade dos Dados Locais (Local Ownership & Cross-Account Isolation)
  const [ownershipConflict, setOwnershipConflict] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) {
      setOwnershipConflict(false);
      return;
    }

    const storedOwner = getStoredLocalOwner();
    const decision = decideOwnership(storedOwner, currentUser.uid);

    if (decision === 'claim') {
      // Cenário (a): Primeira conta entrando assume os dados locais anônimos prévios
      setStoredLocalOwner(currentUser.uid);
      setOwnershipConflict(false);
    } else if (decision === 'same') {
      setOwnershipConflict(false);
    } else if (decision === 'conflict') {
      // Cenários (c e d): Conta diferente tentando entrar em aparelho com dados de outra conta
      setOwnershipConflict(true);
    }
  }, [currentUser?.uid]);

  // Se houver conflito de propriedade, desativa a sincronização na nuvem até resolução explícita
  const effectiveUserId = (currentUser?.uid && !ownershipConflict) ? currentUser.uid : undefined;

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

  const [investments, setInvestments] = useState<InvestmentAsset[]>(() => {
    const initial = getInitialData<InvestmentAsset[]>('investments', INITIAL_INVESTMENTS);
    const cachedQuotes = getCachedQuotes();
    if (!cachedQuotes || Object.keys(cachedQuotes).length === 0) {
      return initial;
    }
    return initial.map(inv => {
      const sym = (inv.ticker || '').toUpperCase();
      const q = cachedQuotes[sym] || cachedQuotes[`${sym}.SA`];
      if (q && typeof q.price === 'number') {
        return {
          ...inv,
          currentPrice: q.price,
          previousClose: q.previousClose ?? inv.previousClose,
          changePercent: q.changePercent ?? inv.changePercent,
          lastPriceUpdate: q.updatedAt || inv.lastPriceUpdate,
        };
      }
      return inv;
    });
  });
  const [investmentTransactions, setInvestmentTransactions] = useState<InvestmentTransaction[]>(() =>
    getInitialData('investment_transactions', INITIAL_INVESTMENT_TRANSACTIONS)
  );
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [lastQuotesUpdate, setLastQuotesUpdate] = useState<string | null>(null);

  // Instâncias dos repositórios locais e serviços Local-First (Etapa 2.4 - TRANSACTIONS)
  const transactionRepo = useMemo(() => new IndexedDBTransactionRepository(), []);
  const accountRepo = useMemo(() => new IndexedDBAccountRepository(), []);
  const creditCardRepo = useMemo(() => new IndexedDBCreditCardRepository(), []);
  const investmentRepo = useMemo(() => new IndexedDBInvestmentRepository(), []);
  const goalRepo = useMemo(() => new IndexedDBGoalRepository(), []);
  const budgetRepo = useMemo(() => new IndexedDBBudgetRepository(), []);
  const categoryRepo = useMemo(() => new IndexedDBCategoryRepository(), []);
  const installmentPlanRepo = useMemo(() => new IndexedDBInstallmentPlanRepository(), []);
  const syncQueueRepo = useMemo(() => new IndexedDBSyncQueueRepository(), []);

  const syncQueue = useMemo(
    () => new SyncQueue(syncQueueRepo, 1000, 30000, () => effectiveUserId ?? null),
    [syncQueueRepo, effectiveUserId]
  );
  const conflictResolver = useMemo(() => new ConflictResolver(), []);
  const cloudSyncProvider = useMemo(() => new FirestoreSyncProvider(effectiveUserId), [effectiveUserId]);

  const financialSyncService = useMemo(() => new FinancialSyncService({
    repositories: {
      transactions: transactionRepo,
      accounts: accountRepo,
      creditCards: creditCardRepo,
      investments: investmentRepo,
      goals: goalRepo,
      budgets: budgetRepo,
      categories: categoryRepo,
      installmentPlans: installmentPlanRepo,
    },
    syncQueue,
    conflictResolver,
    cloudProvider: cloudSyncProvider,
    autoProcessQueue: true,
  }), [transactionRepo, accountRepo, creditCardRepo, investmentRepo, goalRepo, budgetRepo, categoryRepo, installmentPlanRepo, syncQueue, conflictResolver, cloudSyncProvider]);

  // Application Services (Camada de Aplicação - Fase 3.3)
  const transactionAppService = useMemo(
    () => new TransactionApplicationService(financialSyncService),
    [financialSyncService]
  );
  const accountAppService = useMemo(
    () => new AccountApplicationService(financialSyncService),
    [financialSyncService]
  );
  const goalAppService = useMemo(
    () => new GoalApplicationService(financialSyncService),
    [financialSyncService]
  );
  const investmentAppService = useMemo(
    () => new InvestmentApplicationService(financialSyncService),
    [financialSyncService]
  );

  useEffect(() => {
    cloudSyncProvider.setUserId(effectiveUserId);
  }, [effectiveUserId, cloudSyncProvider]);

  // Set initial flag after first boot and run IndexedDB migration/hydration
  const isIndexedDBHydratedRef = React.useRef(false);

  useEffect(() => {
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');

    // Executa migração assíncrona segura do localStorage para o IndexedDB
    const initIndexedDB = async () => {
      try {
        if (!isIndexedDBAvailable()) return;

        // Migra dados caso seja a primeira execução com Dexie
        await migrateFromLocalStorageIfAvailable();

        // Se o usuário não estiver autenticado na nuvem, podemos carregar
        // os dados do IndexedDB se existirem mais recentes
        const stored = await loadAllFinancialEntities();
        if (stored) {
          // Atualiza o estado se houver dados persistidos no IndexedDB
          if (stored.categories && stored.categories.length > 0) setCategories(stored.categories);
          if (stored.accounts.length > 0) setAccounts(stored.accounts);
          if (stored.creditCards.length > 0) setCreditCards(stored.creditCards);
          if (stored.budgets.length > 0) setBudgets(stored.budgets);
          if (stored.goals.length > 0) setGoals(stored.goals);
          if (stored.goalMovements.length > 0) setGoalMovements(stored.goalMovements);
          if (stored.installmentPlans.length > 0) setInstallmentPlans(stored.installmentPlans);
          if (stored.transactions.length > 0) setTransactions(stored.transactions);
          if (stored.investments.length > 0) setInvestments(stored.investments);
          if (stored.investmentTransactions.length > 0) setInvestmentTransactions(stored.investmentTransactions);
        }
      } catch (err) {
        console.warn('[FinFlow IndexedDB] Erro não impeditivo ao inicializar IndexedDB:', err);
      } finally {
        isIndexedDBHydratedRef.current = true;
      }
    };

    initIndexedDB();
  }, []);

  // Fila de operações pendentes e estado de sincronização
  const [pendingQueue, setPendingQueue] = useState<PendingSyncOperation[]>(() =>
    loadPendingQueueFromStorage()
  );
  const [dexieQueueCount, setDexieQueueCount] = useState<number>(0);

  // Monitora alterações na fila persistente Dexie
  useEffect(() => {
    let isMounted = true;
    const updateDexieCount = async () => {
      if (isIndexedDBAvailable()) {
        try {
          const count = await db.syncQueue.count();
          if (isMounted) setDexieQueueCount(count);
        } catch {
          // ignore
        }
      }
    };
    updateDexieCount();
    const unsubscribe = financialSyncService.subscribe(() => {
      updateDexieCount();
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [financialSyncService]);

  const totalPendingSyncCount = pendingQueue.length + dexieQueueCount;
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

  const isCloudSynced = !!effectiveUserId && syncStatus === 'synced' && totalPendingSyncCount === 0;

  // Local storage backups for offline support
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'categories', JSON.stringify(categories));
    replaceCollection('categories', categories).catch(err => {
      console.warn('[FinFlow IndexedDB] Erro ao sincronizar categories no IndexedDB:', err);
    });
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify(budgets));
    replaceCollection('budgets', budgets).catch(err => {
      console.warn('[FinFlow IndexedDB] Erro ao sincronizar budgets no IndexedDB:', err);
    });
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
    replaceCollection('goals', sanitizedGoals).catch(err => {
      console.warn('[FinFlow IndexedDB] Erro ao sincronizar goals no IndexedDB:', err);
    });
  }, [goals, goalMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify(goalMovements));
    replaceCollection('goalMovements', goalMovements).catch(err => {
      console.warn('[FinFlow IndexedDB] Erro ao sincronizar goalMovements no IndexedDB:', err);
    });
  }, [goalMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify(installmentPlans));
    replaceCollection('installmentPlans', installmentPlans).catch(err => {
      console.warn('[FinFlow IndexedDB] Erro ao sincronizar installmentPlans no IndexedDB:', err);
    });
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

  /**
   * Reprocessa todas as operações pendentes na fila de sincronização.
   * Evita duplicação porque utiliza IDs fixos e operações idempotentes (setDoc / deleteDoc).
   */
  const retrySync = useCallback(async (): Promise<boolean> => {
    if (!effectiveUserId) return false;
    const currentQueue = pendingQueueRef.current;
    if (currentQueue.length === 0) {
      setSyncStatus('synced');
      setSyncError(null);
      return true;
    }

    setSyncStatus('pending');
    let remaining = [...currentQueue];
    let allSucceeded = true;

    const [fb, { doc, setDoc, deleteDoc }] = await Promise.all([
      loadFirebase(),
      import('firebase/firestore'),
    ]);

    for (const op of currentQueue) {
      // Se a operação pertencer a outro dono, não envia nem apaga (fica na fila até a decisão do usuário)
      if (!canPushItem(op.ownerUid, effectiveUserId)) {
        continue;
      }

      try {
        const docRef = doc(fb.db, 'users', effectiveUserId, op.collection, op.docId);
        const payloadWithUser = op.payload
          ? { ...op.payload, userId: effectiveUserId }
          : op.payload;
        const clean = sanitizePayload(payloadWithUser) as Record<string, unknown>;

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
          ownerUid: op.ownerUid,
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
  }, [effectiveUserId]);

  // Auto-process pending sync queue when user logs in or auth resolves
  useEffect(() => {
    if (!isAuthReady || !effectiveUserId) return;
    retrySync();
  }, [effectiveUserId, isAuthReady, retrySync]);

  // Auto-retry when device comes back online
  useEffect(() => {
    const handleOnline = () => {
      if (effectiveUserId) {
        retrySync();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [effectiveUserId, retrySync]);

  // Sincroniza fila de pendências em memória quando o FinancialSyncService conclui mutações
  useEffect(() => {
    return financialSyncService.subscribe(event => {
      if (event.type === 'item_synced' && event.item) {
        const item = event.item;
        setPendingQueue(prev => dequeueOperation(prev, item.entityName as SyncCollection, item.entityId));
      }
    });
  }, [financialSyncService]);

  // Real-time Firestore Sync migrado para o hook dedicado useFirestoreSync (Fase 3.2)
  useFirestoreSync({
    userId: effectiveUserId,
    isAuthReady,
    selectedMonth,
    financialSyncService,
    pendingQueueRef,
    setAccounts,
    setCreditCards,
    setCategories,
    setBudgets,
    setGoals,
    setGoalMovements,
    setInstallmentPlans,
    setInvestments,
    setInvestmentTransactions,
    setTransactions,
  });

  // Check if demo data is currently loaded and visible
  const isDemoActive = useMemo(() => {
    return demoDataService.isDemoActive(
      accounts,
      transactions,
      localStorage.getItem(DEMO_CLEARED_KEY) === 'true'
    );
  }, [accounts, transactions]);

  const syncLocalToCloud = async () => {
    if (!effectiveUserId) return;
    await retrySync();
    await demoDataService.seed(effectiveUserId, {
      categories,
      accounts,
      creditCards,
      budgets,
      goals,
      goalMovements,
      installmentPlans,
      transactions,
      investments,
      investmentTransactions,
    });
  };

  // Recalculate account and credit card balances from the single source of truth (transactions)
  const computedAccounts = useMemo(() => {
    return accounts.map(account => {
      const initial = typeof account.initialBalance === 'number'
        ? account.initialBalance
        : (typeof account.currentBalance === 'number' ? account.currentBalance : 0);
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

  // Recalculate investment positions and effective assets from single source of truth (InvestmentTransaction ledger) (Etapa 10.2)
  const computedInvestmentPositions = useMemo(() => {
    const map = calculateAllEffectiveInvestmentPositions(investments, investmentTransactions);
    const result: Record<string, DerivedInvestmentPosition> = {};
    for (const [id, pos] of map.entries()) {
      result[id] = pos;
    }
    return result;
  }, [investments, investmentTransactions]);

  const computedInvestments = useMemo(() => {
    return resolveAllEffectiveInvestments(investments, investmentTransactions);
  }, [investments, investmentTransactions]);

  const getDerivedPosition = useCallback((assetId: string): DerivedInvestmentPosition | undefined => {
    return computedInvestmentPositions[assetId];
  }, [computedInvestmentPositions]);

  // Auditoria interna em ambiente de desenvolvimento para detectar divergências entre dados armazenados e ledger (Etapa 10.2)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      for (const asset of investments) {
        const derived = computedInvestmentPositions[asset.id];
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
  }, [investments, computedInvestmentPositions]);

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

  // Transaction CRUD (Delegado para TransactionApplicationService - Fase 3.3)
  const addTransaction = async (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTx = await transactionAppService.create(tx);
    setTransactions(prev => [newTx, ...prev]);
  };

  const updateTransaction = async (id: string, updatedFields: Partial<Transaction>) => {
    const currentTx = transactions.find(t => t.id === id);
    const updatedTx = await transactionAppService.update(id, updatedFields, currentTx);
    setTransactions(prev => prev.map(tx => tx.id === id ? updatedTx : tx));
  };

  const deleteTransaction = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    await transactionAppService.delete(id);
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const toggleTransactionStatus = async (id: string) => {
    const target = transactions.find(t => t.id === id);
    if (!target) return;
    const updated = await transactionAppService.toggleStatus(id, target);
    setTransactions(prev => prev.map(tx => tx.id === id ? updated : tx));
  };

  // Estado e cursor para paginação de histórico de transações sob demanda (Cursor Pagination via Repository)
  const [historicalPagination, setHistoricalPagination] = useState<{
    hasMore: boolean;
    isLoading: boolean;
  }>({
    hasMore: true,
    isLoading: false,
  });
  const lastTxCursorRef = React.useRef<string | undefined>(undefined);

  const loadHistoricalTransactions = async (options?: {
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    reset?: boolean;
  }): Promise<{ count: number; hasMore: boolean }> => {
    if (options?.reset) {
      lastTxCursorRef.current = undefined;
    }

    setHistoricalPagination(prev => ({ ...prev, isLoading: true }));

    try {
      // Consulta paginada via IndexedDBTransactionRepository usando cursor pagination
      const result = await transactionRepo.getPaged({
        cursor: lastTxCursorRef.current,
        limit: options?.pageSize || 30,
        startDate: options?.startDate,
        endDate: options?.endDate,
      });

      lastTxCursorRef.current = result.nextCursor;

      if (result.items.length > 0) {
        setTransactions(prev => {
          // Merge sem duplicar transações já existentes
          const existingIds = new Set(prev.map(t => t.id));
          const newUnique = result.items.filter(item => !existingIds.has(item.id));
          const combined = [...prev, ...newUnique];
          return combined.sort((a, b) => b.date.localeCompare(a.date));
        });
      }

      setHistoricalPagination({
        hasMore: result.hasMore,
        isLoading: false,
      });

      return {
        count: result.items.length,
        hasMore: result.hasMore,
      };
    } catch (err) {
      console.warn('[FinFlow Repository] Falha ao paginar histórico de transações locais:', err);
      setHistoricalPagination(prev => ({ ...prev, isLoading: false }));
      return { count: 0, hasMore: false };
    }
  };

  // Account CRUD (Delegado para AccountApplicationService - Fase 3.3)
  const addAccount = async (acc: Omit<Account, 'id' | 'currentBalance'>) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    const newAcc = await accountAppService.create(acc);
    setPendingQueue(prev => enqueueOperation(prev, {
      collection: 'accounts',
      docId: newAcc.id,
      type: 'set',
      payload: newAcc,
    }));
    setAccounts(prev => {
      if (prev.some(a => a.id === newAcc.id)) return prev;
      return [...prev, newAcc];
    });
  };

  const updateAccount = async (id: string, updatedFields: Partial<Account>) => {
    const currentAcc = accounts.find(acc => acc.id === id);
    const updatedAcc = await accountAppService.update(id, updatedFields, currentAcc);
    setPendingQueue(prev => enqueueOperation(prev, {
      collection: 'accounts',
      docId: id,
      type: 'update',
      payload: updatedFields,
    }));
    setAccounts(prev => prev.map(acc => acc.id === id ? updatedAcc : acc));
  };

  const deleteAccount = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    await accountAppService.delete(id);
    setPendingQueue(prev => enqueueOperation(prev, {
      collection: 'accounts',
      docId: id,
      type: 'delete',
    }));
    setAccounts(prev => prev.filter(acc => acc.id !== id));
  };

  // Credit Card CRUD (Etapa 2.6 - CREDIT CARDS Local-First)
  const addCreditCard = async (card: Omit<CreditCard, 'id' | 'currentInvoice'>) => {
    const newId = generateId('card');
    const newCard: CreditCard = {
      ...card,
      id: newId,
      currentInvoice: 0
    };

    // 1. Primeiro: persistência Local-First via FinancialSyncService (IndexedDB + SyncQueue)
    // Sincroniza metadados do cartão; snapshot de fatura não polui a fila de sincronização
    await financialSyncService.saveCreditCard(newCard);
    await financialSyncService.saveCreditCardInvoiceSnapshot(newId, 0).catch(err => {
      console.warn('[FinFlow Local-First] Erro ao salvar invoice snapshot inicial:', err);
    });

    // 2. Depois: atualiza estado da UI apenas após persistência local garantida
    setCreditCards(prev => [...prev, newCard]);
  };

  const updateCreditCard = async (id: string, updatedFields: Partial<CreditCard>) => {
    const existing = creditCards.find(c => c.id === id);
    if (!existing) return;

    const mergedCard: CreditCard = {
      ...existing,
      ...updatedFields,
      id,
    };

    // 1. Primeiro: persistência Local-First via FinancialSyncService
    await financialSyncService.saveCreditCard(mergedCard);

    // 2. Depois: atualiza estado da UI
    setCreditCards(prev => prev.map(c => c.id === id ? mergedCard : c));
  };

  const deleteCreditCard = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');

    // 1. Preservação de integridade referencial:
    // Verifica existência de transações ou parcelamentos vinculados antes da exclusão
    const linkedTransactions = transactions.filter(t => t.creditCardId === id && !t.deleted);
    const linkedPlans = installmentPlans.filter(p => p.creditCardId === id);

    if (linkedTransactions.length > 0 || linkedPlans.length > 0) {
      console.warn(
        `[FinFlow CreditCard] Cartão ${id} possui histórico financeiro vinculado ` +
        `(${linkedTransactions.length} transações, ${linkedPlans.length} parcelamentos). ` +
        `Preservando registros históricos com exclusão lógica via tombstone.`
      );
    }

    // 2. Primeiro: persistência no IndexedDB com tombstone e enfileiramento na SyncQueue
    await financialSyncService.deleteCreditCard(id);

    // 3. Depois: remove da visão ativa da UI
    setCreditCards(prev => prev.filter(c => c.id !== id));
  };

  // Category CRUD (Migrado para FinancialSyncService Local-First - Fase 2.3)
  const addCategory = async (cat: Omit<Category, 'id'>) => {
    const newId = generateId('cat');
    const newCat: Category = { ...cat, id: newId };

    // 1. Persistência Local-First no IndexedDB e SyncQueue
    await financialSyncService.saveCategory(newCat);

    // 2. Atualização de estado da UI
    setCategories(prev => [...prev, newCat]);
  };

  const updateCategory = async (id: string, updatedFields: Partial<Category>) => {
    const existing = categories.find(c => c.id === id);
    if (!existing) return;
    const updated: Category = { ...existing, ...updatedFields };

    // 1. Persistência Local-First no IndexedDB e SyncQueue
    await financialSyncService.saveCategory(updated);

    // 2. Atualização de estado da UI
    setCategories(prev => prev.map(c => c.id === id ? updated : c));
  };

  const deleteCategory = async (id: string) => {
    // 1. Soft delete / tombstone no IndexedDB e SyncQueue
    await financialSyncService.deleteCategory(id);

    // 2. Remove da visão ativa da UI
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  // Budget Actions (Migrado para FinancialSyncService Local-First - Fase 2.2)
  const setBudget = async (categoryId: string, limitAmount: number) => {
    const existing = budgets.find(b => b.categoryId === categoryId && b.month === selectedMonth);
    const budgetId = existing ? existing.id : generateId('b');
    const newBudget: Budget = {
      ...(existing || {}),
      id: budgetId,
      categoryId,
      month: selectedMonth,
      limitAmount,
    };

    // 1. Persistência Local-First no IndexedDB e SyncQueue
    await financialSyncService.saveBudget(newBudget);

    // 2. Atualização de estado da UI
    setBudgets(prev => {
      const existingIndex = prev.findIndex(b => b.categoryId === categoryId && b.month === selectedMonth);
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = newBudget;
        return copy;
      }
      return [...prev, newBudget];
    });
  };

  const deleteBudget = async (id: string) => {
    // 1. Soft-delete / tombstone Local-First no IndexedDB e SyncQueue
    await financialSyncService.deleteBudget(id);

    // 2. Atualização de estado da UI
    setBudgets(prev => prev.filter(b => b.id !== id));
  };

  // Goal Actions & Ledger (Delegado para GoalApplicationService - Fase 3.3)
  const addGoal = async (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => {
    const newGoal = await goalAppService.create(goal);
    setGoals(prev => [...prev, newGoal]);
  };

  const updateGoal = async (id: string, updatedFields: Partial<FinancialGoal>) => {
    const existing = goals.find(g => g.id === id);
    const merged = await goalAppService.update(id, updatedFields, existing);
    setGoals(prev => prev.map(g => g.id === id ? merged : g));
  };

  const deleteGoal = async (id: string) => {
    const movementsToDelete = goalMovements.filter(m => m.goalId === id);
    await goalAppService.delete(id, movementsToDelete);
    setGoals(prev => prev.filter(g => g.id !== id));
    setGoalMovements(prev => prev.filter(m => m.goalId !== id));
  };

  const addGoalMovement = async (movement: Omit<GoalMovement, 'id' | 'createdAt'>) => {
    const targetGoal = goals.find(g => g.id === movement.goalId);
    const { movement: newMovement, updatedGoal } = await goalAppService.addMovement(
      movement,
      targetGoal,
      goalMovements
    );
    setGoalMovements(prev => [...prev, newMovement]);
    if (updatedGoal) {
      setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }
  };

  const addGoalDeposit = async (
    id: string,
    amount: number,
    notes?: string,
    date?: string
  ) => {
    const targetGoal = goals.find(g => g.id === id);
    const { movement: newMovement, updatedGoal } = await goalAppService.addDeposit(
      id,
      amount,
      notes,
      date,
      targetGoal,
      goalMovements
    );
    setGoalMovements(prev => [...prev, newMovement]);
    if (updatedGoal) {
      setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }
  };

  const deleteGoalMovement = async (id: string) => {
    const target = goalMovements.find(m => m.id === id);
    const targetGoal = target ? goals.find(g => g.id === target.goalId) : undefined;
    const { updatedGoal } = await goalAppService.deleteMovement(id, targetGoal, goalMovements);
    setGoalMovements(prev => prev.filter(m => m.id !== id));
    if (updatedGoal) {
      setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    }
  };

  // Installment Plans CRUD (Migrado para FinancialSyncService Local-First - Fase 2.3)
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

    // 1. Salva o plano no FinancialSyncService (IndexedDB + SyncQueue)
    await financialSyncService.saveInstallmentPlan(newPlan);

    // 2. Salva cada transação via FinancialSyncService com dependência causal
    for (const tx of newTransactions) {
      await financialSyncService.saveTransaction(tx, {
        dependsOn: [{ entityName: 'installmentPlans', entityId: planId }],
      });
    }

    // 3. Atualiza estado da UI
    setInstallmentPlans(prev => [newPlan, ...prev]);
    setTransactions(prev => [...newTransactions, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
  };

  const updateInstallmentPlan = async (id: string, updatedFields: Partial<InstallmentPlan>) => {
    const existing = installmentPlans.find(p => p.id === id);
    if (!existing) return;
    const updatedPlan: InstallmentPlan = { ...existing, ...updatedFields };

    // 1. Salva a atualização no FinancialSyncService (IndexedDB + SyncQueue)
    await financialSyncService.saveInstallmentPlan(updatedPlan);

    // 2. Atualiza estado da UI
    setInstallmentPlans(prev => prev.map(p => p.id === id ? updatedPlan : p));
  };

  const deleteInstallmentPlan = async (planId: string, deleteTransactions: boolean = true) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');

    // 1. Exclui o plano via FinancialSyncService (soft delete tombstone + SyncQueue)
    await financialSyncService.deleteInstallmentPlan(planId);

    // 2. Se solicitado, exclui as transações vinculadas via FinancialSyncService (soft delete tombstone + SyncQueue)
    if (deleteTransactions) {
      const associated = transactions.filter(t => t.installmentPlanId === planId);
      for (const t of associated) {
        await financialSyncService.deleteTransaction(t.id);
      }
      setTransactions(prev => prev.filter(t => t.installmentPlanId !== planId));
    }

    // 3. Atualiza estado da UI
    setInstallmentPlans(prev => prev.filter(p => p.id !== planId));
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
        let updatedList: InvestmentAsset[] = [];
        setInvestments(prev => {
          updatedList = prev.map(inv => {
            const upper = (inv.ticker || '').toUpperCase();
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
          });
          try {
            localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(updatedList));
          } catch (e) {
            console.warn('Erro ao salvar investimentos no localStorage:', e);
          }
          return updatedList;
        });
        setLastQuotesUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

        // Atualiza cache local no IndexedDB e sincroniza na nuvem Firestore se autenticado
        for (const inv of updatedList) {
          const upper = (inv.ticker || '').toUpperCase();
          const q = quotes[upper] || quotes[`${upper}.SA`];
          if (q && typeof q.price === 'number') {
            const quoteMetadata = {
              previousClose: q.previousClose,
              changePercent: q.changePercent,
              lastPriceUpdate: inv.lastPriceUpdate || new Date().toISOString(),
            };
            financialSyncService.updateInvestmentMarketQuote(inv.id, q.price, quoteMetadata).catch(console.warn);

            if (currentUser) {
              loadFirebase().then(async (fb) => {
                const { doc, setDoc } = await import('firebase/firestore');
                const invDocRef = doc(fb.db, 'users', currentUser.uid, 'investments', inv.id);
                setDoc(invDocRef, {
                  userId: currentUser.uid,
                  currentPrice: q.price,
                  ...(q.previousClose !== undefined ? { previousClose: q.previousClose } : {}),
                  ...(q.changePercent !== undefined ? { changePercent: q.changePercent } : {}),
                  lastPriceUpdate: quoteMetadata.lastPriceUpdate,
                  updatedAt: quoteMetadata.lastPriceUpdate,
                }, { merge: true }).catch(err => {
                  console.warn('[FinanceContext] Erro ao sincronizar cotação no Firestore:', err);
                });
              }).catch(console.warn);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao atualizar cotações de investimentos:', err);
    } finally {
      setIsRefreshingQuotes(false);
    }
  };

  // Quotes refresh automático ao inicializar e quando a lista de investimentos for carregada
  const lastAutoQuoteCheckRef = React.useRef<number>(0);
  const refreshInvestmentQuotesRef = useRef(refreshInvestmentQuotes);
  refreshInvestmentQuotesRef.current = refreshInvestmentQuotes;

  useEffect(() => {
    if (investments.length > 0) {
      const now = Date.now();
      if (now - lastAutoQuoteCheckRef.current > 5 * 60 * 1000) {
        lastAutoQuoteCheckRef.current = now;
        refreshInvestmentQuotesRef.current();
      }
    }
  }, [investments.length]);

  // Investment CRUD (Delegado para InvestmentApplicationService - Fase 3.3)
  const addInvestment = async (asset: Omit<InvestmentAsset, 'id' | 'createdAt'>): Promise<string> => {
    const newAsset = await investmentAppService.createAsset(asset);
    setInvestments(prev => [...prev, newAsset]);

    if (newAsset.autoUpdate && newAsset.ticker) {
      setTimeout(() => {
        refreshInvestmentQuotes();
      }, 200);
    }

    return newAsset.id;
  };

  const updateInvestment = async (id: string, updates: Partial<InvestmentAsset>) => {
    const existing = investments.find(inv => inv.id === id);
    const merged = await investmentAppService.updateAsset(id, updates, existing);
    setInvestments(prev => prev.map(inv => inv.id === id ? merged : inv));
  };

  const deleteInvestment = async (id: string) => {
    await investmentAppService.deleteAsset(id, investmentTransactions);
    setInvestments(prev => prev.filter(inv => inv.id !== id));
  };

  const loadSampleInvestments = async () => {
    const { investments: sampleInvs, investmentTransactions: sampleTxs } = demoDataService.getSampleInvestments();
    setInvestments(sampleInvs);
    setInvestmentTransactions(sampleTxs);
    await investmentRepo.saveAssetsBatch(sampleInvs).catch(console.warn);
    await investmentRepo.saveTransactionsBatch(sampleTxs).catch(console.warn);
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(sampleInvs));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(sampleTxs));
    await refreshInvestmentQuotes();
  };

  // Investment Transactions Actions (Delegado para InvestmentApplicationService - Fase 3.3)
  const addInvestmentTransaction = async (tx: Omit<InvestmentTransaction, 'id' | 'createdAt'>): Promise<string> => {
    const validatedTx = await investmentAppService.createTransaction(tx, investments);
    setInvestmentTransactions(prev => [validatedTx, ...prev]);
    return validatedTx.id;
  };

  const updateInvestmentTransaction = async (id: string, updates: Partial<InvestmentTransaction>) => {
    const existing = investmentTransactions.find(t => t.id === id);
    const merged = await investmentAppService.updateTransaction(id, updates, existing, investments);
    setInvestmentTransactions(prev => prev.map(t => t.id === id ? merged : t));
  };

  const deleteInvestmentTransaction = async (id: string) => {
    await investmentAppService.deleteTransaction(id);
    setInvestmentTransactions(prev => prev.filter(t => t.id !== id));
  };

  const executeInvestmentAporte = async (params: {
    assetId: string;
    quantity: number;
    price: number;
    date: string;
    sourceAccountId?: string;
    notes?: string;
    idempotencyKey?: string;
    transactionId?: string;
    debitTransactionId?: string;
  }): Promise<{ transactionId: string; debitTransactionId?: string }> => {
    const result = await investmentAppService.executeAporte(params, {
      investments,
      accounts,
      categories,
      investmentTransactions,
      transactions,
      applyLocalPersist: async (plan, idempotency) => {
        if (!idempotency.assetAlreadyUpdated) {
          await investmentRepo.saveAsset(plan.updatedAsset);
        }
        if (!idempotency.itxExists) {
          await investmentRepo.saveTransaction(plan.newInvestmentTransaction);
        }
        if (plan.newDebitTransaction && !idempotency.debitExists) {
          await transactionRepo.save(plan.newDebitTransaction);
        }
      },
    });

    const { plan, idempotency } = result;
    const nextInvestmentTxs = !idempotency.itxExists
      ? [plan.newInvestmentTransaction, ...investmentTransactions.filter(t => t.id !== plan.itxId)]
      : investmentTransactions;

    const nextInvestments = !idempotency.assetAlreadyUpdated
      ? investments.map(inv => inv.id === plan.updatedAsset.id ? plan.updatedAsset : inv)
      : investments;

    const nextTransactions = (plan.newDebitTransaction && !idempotency.debitExists)
      ? [plan.newDebitTransaction, ...transactions.filter(t => t.id !== plan.debitTxId)]
      : transactions;

    setInvestmentTransactions(nextInvestmentTxs);
    setInvestments(nextInvestments);
    if (plan.newDebitTransaction && !idempotency.debitExists) {
      setTransactions(nextTransactions);
    }

    return { transactionId: result.transactionId, debitTransactionId: result.debitTransactionId };
  };

  // Backup & Restore (Migrado para BackupService - Fase 3.1)
  const exportData = async (passphrase?: string): Promise<string> => {
    return backupService.export({
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
      investmentTransactions,
    }, passphrase);
  };

  const importData = async (content: string, passphrase?: string): Promise<{ success: boolean; message: string }> => {
    const result = await backupService.import(content, passphrase);
    if (!result.success || !result.data) {
      return { success: false, message: result.message };
    }

    localStorage.setItem(DEMO_CLEARED_KEY, 'true');

    const {
      categories: impCats,
      accounts: impAccounts,
      creditCards: impCards,
      budgets: impBudgets,
      goals: impGoals,
      goalMovements: impMovements,
      installmentPlans: impPlans,
      transactions: impTxs,
      investments: impInvestments,
      investmentTransactions: impInvTxs,
      currency: impCurrency,
    } = result.data;

    if (impCats) setCategories(impCats);
    if (impAccounts) setAccounts(impAccounts);
    if (impCards) setCreditCards(impCards);
    if (impBudgets) setBudgets(impBudgets);
    if (impGoals) setGoals(impGoals);
    if (impMovements) setGoalMovements(impMovements);
    if (impPlans) setInstallmentPlans(impPlans);
    if (impTxs) setTransactions(impTxs);
    if (impInvestments) setInvestments(impInvestments);
    if (impInvTxs) setInvestmentTransactions(impInvTxs);
    if (impCurrency) setCurrencyState(impCurrency);

    if (currentUser) {
      await demoDataService.seed(currentUser.uid, {
        categories: impCats,
        accounts: impAccounts,
        creditCards: impCards,
        budgets: impBudgets,
        goals: impGoals,
        goalMovements: impMovements,
        installmentPlans: impPlans,
        transactions: impTxs,
        investments: impInvestments,
        investmentTransactions: impInvTxs,
      });
    }

    return { success: true, message: result.message };
  };

  // Demo & Reset Actions (Migrado para DemoDataService - Fase 3.1)
  const resetToDefaults = async () => {
    if (currentUser) {
      const uid = currentUser.uid;
      try {
        setSyncStatus('pending');
        // deleteSubcollectionsFromFirestore antes de seedDefaultsToCloud via demoDataService
        await demoDataService.resetToDefaults(uid);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        console.error('Falha ao restaurar dados padrão no Firestore:', err);
        setSyncStatus('error');
        const msg = err instanceof Error ? err.message : 'Falha ao restaurar dados padrão na nuvem.';
        setSyncError(msg);
        throw new Error(`Não foi possível restaurar os dados padrão na nuvem: ${msg}`, { cause: err });
      }
    }

    setPendingQueue([]);
    savePendingQueueToStorage([]);

    // Restauração das entidades padrão canônicas:
    // setAccounts(INITIAL_ACCOUNTS)
    // setCreditCards(INITIAL_CREDIT_CARDS)
    // setBudgets(INITIAL_BUDGETS)
    // setGoals(INITIAL_GOALS)
    // setGoalMovements(INITIAL_GOAL_MOVEMENTS)
    // setInstallmentPlans(INITIAL_INSTALLMENT_PLANS)
    // setTransactions(INITIAL_TRANSACTIONS)
    // setInvestments(INITIAL_INVESTMENTS)
    // setInvestmentTransactions(INITIAL_INVESTMENT_TRANSACTIONS)
    const defaults = demoDataService.getDefaultDataset();

    localStorage.removeItem(DEMO_CLEARED_KEY);
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'categories', JSON.stringify(defaults.categories));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify(defaults.accounts));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify(defaults.creditCards));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify(defaults.budgets));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify(defaults.goals));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify(defaults.goalMovements));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify(defaults.installmentPlans));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify(defaults.transactions));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(defaults.investments));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(defaults.investmentTransactions));

    setCategories(defaults.categories);
    setAccounts(defaults.accounts);
    setCreditCards(defaults.creditCards);
    setBudgets(defaults.budgets);
    setGoals(defaults.goals);
    setGoalMovements(defaults.goalMovements);
    setInstallmentPlans(defaults.installmentPlans);
    setTransactions(defaults.transactions);
    setInvestments(defaults.investments);
    setInvestmentTransactions(defaults.investmentTransactions);
    setCurrencyState('BRL');
    setSelectedMonth(getCurrentMonth());
  };

  // Clears all sample/mock data so the user can start from clean scratch
  const clearSampleData = async () => {
    if (currentUser) {
      const uid = currentUser.uid;
      try {
        setSyncStatus('pending');
        // deleteSubcollectionsFromFirestore com filtro isSampleDataDocument via demoDataService
        await demoDataService.clear(uid);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        console.error('Falha ao remover dados de exemplo no Firestore:', err);
        setSyncStatus('error');
        const msg = err instanceof Error ? err.message : 'Falha ao remover dados de exemplo na nuvem.';
        setSyncError(msg);
        throw new Error(`Não foi possível remover dados de exemplo na nuvem: ${msg}`, { cause: err });
      }
    }

    // Filtra preservando estritamente os dados reais do usuário (filterOutSampleData)
    const filtered = demoDataService.filterSampleData({
      categories,
      accounts,
      creditCards,
      budgets,
      goals,
      goalMovements,
      installmentPlans,
      transactions,
      investments,
      investmentTransactions,
    });

    // Remove da fila pendente quaisquer operações relativas aos dados de demonstração
    setPendingQueue(prev => prev.filter(op => !demoDataService.isSampleDataDocument(op.collection, op.docId)));

    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify(filtered.accounts));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify(filtered.creditCards));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify(filtered.budgets));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify(filtered.goals));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goal_movements', JSON.stringify(filtered.goalMovements));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify(filtered.installmentPlans));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify(filtered.transactions));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investments', JSON.stringify(filtered.investments));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify(filtered.investmentTransactions));

    setAccounts(filtered.accounts);
    setCreditCards(filtered.creditCards);
    setBudgets(filtered.budgets);
    setGoals(filtered.goals);
    setGoalMovements(filtered.goalMovements);
    setInstallmentPlans(filtered.installmentPlans);
    setTransactions(filtered.transactions);
    setInvestments(filtered.investments);
    setInvestmentTransactions(filtered.investmentTransactions);
  };

  const clearAllData = async () => {
    if (currentUser) {
      const uid = currentUser.uid;
      try {
        setSyncStatus('pending');
        // subcollections apagadas no Firestore: 'transactions', 'accounts', 'creditCards', 'categories', 'budgets', 'goals', 'goalMovements', 'installmentPlans', 'investments', 'investmentTransactions'
        await demoDataService.clearAll(uid);
        setSyncStatus('synced');
        setSyncError(null);
      } catch (err: unknown) {
        console.error('Falha ao apagar dados no Firestore durante clearAllData:', err);
        setSyncStatus('error');
        const msg = err instanceof Error ? err.message : 'Falha ao apagar dados na nuvem.';
        setSyncError(msg);
        throw new Error(`Não foi possível apagar os dados na nuvem: ${msg}`, { cause: err });
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

    clearAllFinancialEntities().catch(err => {
      console.warn('[FinFlow IndexedDB] Erro ao limpar entidades no IndexedDB:', err);
    });

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

  const cancelConflictLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const wipeLocalFinancialStorage = async (keysToRemove: string[]) => {
    // 1. Limpa IndexedDB financeiro e fila de sincronização
    await clearAllFinancialEntities();
    if (isIndexedDBAvailable()) {
      await db.syncQueue.clear();
    }

    // 2. Limpa localStorage das chaves selecionadas e zera fila pendente legada
    for (const k of keysToRemove) {
      try {
        localStorage.removeItem(k);
      } catch (err) {
        console.warn(`[FinanceContext] Falha ao remover chave "${k}" do localStorage:`, err);
      }
    }
    savePendingQueueToStorage([]);
  };

  const confirmClearAndSwitchAccount = useCallback(async () => {
    if (!currentUser?.uid) return;
    const newUid = currentUser.uid;

    try {
      const keysToRemove = getLocalStorageKeysToClearOnAccountSwitch(Object.keys(localStorage));
      await wipeLocalFinancialStorage(keysToRemove);
      setStoredLocalOwner(newUid);
      window.location.reload();
    } catch (err) {
      console.error('[FinanceContext] Erro ao limpar dados locais para troca de conta:', err);
      setStoredLocalOwner(newUid);
      window.location.reload();
    }
  }, [currentUser]);

  const signOutAndWipeDevice = useCallback(async () => {
    try {
      await logout();
      const keysToRemove = getLocalStorageKeysToClearOnWipe(Object.keys(localStorage));
      await wipeLocalFinancialStorage(keysToRemove);
      window.location.reload();
    } catch (err) {
      console.error('[FinanceContext] Erro ao sair e apagar dados deste aparelho:', err);
      const keysToRemove = getLocalStorageKeysToClearOnWipe(Object.keys(localStorage));
      await wipeLocalFinancialStorage(keysToRemove);
      window.location.reload();
    }
  }, [logout]);

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
        investments: computedInvestments,
        investmentTransactions,
        computedInvestmentPositions,
        getDerivedPosition,
        currency,
        selectedMonth,
        futureCommitments,
        isCloudSynced,
        syncStatus,
        syncError,
        pendingSyncCount: totalPendingSyncCount,
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
        updateInstallmentPlan,
        deleteInstallmentPlan,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        toggleTransactionStatus,
        loadHistoricalTransactions,
        historicalPagination,
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
        clearAllData,
        isOwnershipConflict: ownershipConflict,
        confirmClearAndSwitchAccount,
        cancelConflictLogout,
        signOutAndWipeDevice
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
