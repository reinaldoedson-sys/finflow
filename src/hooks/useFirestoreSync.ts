import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import { db as defaultDb } from '../firebase';
import { subscribeMonthTransactions } from '../services/firestoreTransactions';
import { mergeCloudWithPending, type PendingSyncOperation } from '../domain/sync';
import { DEFAULT_CATEGORIES } from '../utils/mockData';
import type { FinancialSyncService } from '../services/financialSyncService';
import type {
  Account,
  CreditCard,
  Category,
  Budget,
  FinancialGoal,
  GoalMovement,
  InstallmentPlan,
  InvestmentAsset,
  InvestmentTransaction,
  Transaction,
} from '../types/finance';

export interface UseFirestoreSyncOptions {
  userId: string | null | undefined;
  isAuthReady?: boolean;
  selectedMonth?: string;
  financialSyncService: FinancialSyncService;
  pendingQueueRef?: React.MutableRefObject<PendingSyncOperation[]> | { current: PendingSyncOperation[] };
  setAccounts?: React.Dispatch<React.SetStateAction<Account[]>>;
  setCreditCards?: React.Dispatch<React.SetStateAction<CreditCard[]>>;
  setCategories?: React.Dispatch<React.SetStateAction<Category[]>>;
  setBudgets?: React.Dispatch<React.SetStateAction<Budget[]>>;
  setGoals?: React.Dispatch<React.SetStateAction<FinancialGoal[]>>;
  setGoalMovements?: React.Dispatch<React.SetStateAction<GoalMovement[]>>;
  setInstallmentPlans?: React.Dispatch<React.SetStateAction<InstallmentPlan[]>>;
  setInvestments?: React.Dispatch<React.SetStateAction<InvestmentAsset[]>>;
  setInvestmentTransactions?: React.Dispatch<React.SetStateAction<InvestmentTransaction[]>>;
  setTransactions?: React.Dispatch<React.SetStateAction<Transaction[]>>;
  firestore?: Firestore;
}

export interface UseFirestoreSyncResult {
  isListening: boolean;
  activeListenersCount: number;
  unsubscribeAll: () => void;
}

/**
 * Registra os 10 listeners Firestore e coordena a sincronização reativa,
 * prevenção de loops de eco e hidratação local via FinancialSyncService.
 * Pode ser invocado diretamente pelo hook `useFirestoreSync` ou por testes.
 */
export function setupFirestoreSync({
  userId,
  isAuthReady = true,
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
  firestore = defaultDb,
}: UseFirestoreSyncOptions): UseFirestoreSyncResult {
  if (!isAuthReady || !userId) {
    return {
      isListening: false,
      activeListenersCount: 0,
      unsubscribeAll: () => {},
    };
  }

  const currentUnsubs: (() => void)[] = [];
  const lastProcessedHash: Record<string, string> = {};

  // Prevenção de loop de eco:
  // Se os dados não sofreram alteração real de conteúdo ou revisão, não dispara setters nem hidratação
  const hasContentChanged = (entityName: string, items: any[]): boolean => {
    const signature = items
      .map(item => `${item.id}:${item.updatedAt || item.lastPriceUpdate || item.currentPrice || item.date || item.tombstoneRevision || ''}`)
      .join('|');
    if (lastProcessedHash[entityName] === signature) {
      return false;
    }
    lastProcessedHash[entityName] = signature;
    return true;
  };

  const getPendingQueue = () => pendingQueueRef?.current || [];

  // 1. Accounts
  const unsubAccounts = onSnapshot(
    collection(firestore, 'users', userId, 'accounts'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
      if (!hasContentChanged('accounts', list)) return;

      if (setAccounts) {
        setAccounts(prev => mergeCloudWithPending(list, getPendingQueue(), 'accounts', prev));
      }
      financialSyncService.hydrateFromCloud('accounts', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar contas no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar contas no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubAccounts);

  // 2. Credit Cards
  const unsubCards = onSnapshot(
    collection(firestore, 'users', userId, 'creditCards'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditCard));
      if (!hasContentChanged('creditCards', list)) return;

      if (setCreditCards) {
        setCreditCards(prev => mergeCloudWithPending(list, getPendingQueue(), 'creditCards', prev));
      }
      financialSyncService.hydrateFromCloud('creditCards', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar cartões no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar cartões no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubCards);

  // 3. Categories
  const unsubCats = onSnapshot(
    collection(firestore, 'users', userId, 'categories'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      const effective = list.length > 0 ? list : DEFAULT_CATEGORIES;
      if (!hasContentChanged('categories', effective)) return;

      if (setCategories) {
        setCategories(prev => mergeCloudWithPending(effective, getPendingQueue(), 'categories', prev));
      }
      financialSyncService.hydrateFromCloud('categories', effective).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar categorias no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar categorias no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubCats);

  // 4. Budgets
  const unsubBudgets = onSnapshot(
    collection(firestore, 'users', userId, 'budgets'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget));
      if (!hasContentChanged('budgets', list)) return;

      if (setBudgets) {
        setBudgets(prev => mergeCloudWithPending(list, getPendingQueue(), 'budgets', prev));
      }
      financialSyncService.hydrateFromCloud('budgets', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar orçamentos no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar orçamentos no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubBudgets);

  // 5. Goals
  const unsubGoals = onSnapshot(
    collection(firestore, 'users', userId, 'goals'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          initialAmount: typeof data.initialAmount === 'number' ? data.initialAmount : undefined,
        } as FinancialGoal;
      });
      if (!hasContentChanged('goals', list)) return;

      if (setGoals) {
        setGoals(prev => mergeCloudWithPending(list, getPendingQueue(), 'goals', prev));
      }
      financialSyncService.hydrateFromCloud('goals', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar metas no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar metas no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubGoals);

  // 6. Goal Movements (Ledger de metas)
  const unsubGoalMovements = onSnapshot(
    collection(firestore, 'users', userId, 'goalMovements'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GoalMovement));
      if (!hasContentChanged('goalMovements', list)) return;

      if (setGoalMovements) {
        setGoalMovements(prev => mergeCloudWithPending(list, getPendingQueue(), 'goalMovements', prev));
      }
      financialSyncService.hydrateFromCloud('goalMovements', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar movimentações de metas no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar movimentações de metas no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubGoalMovements);

  // 7. Installment Plans
  const unsubPlans = onSnapshot(
    collection(firestore, 'users', userId, 'installmentPlans'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstallmentPlan));
      if (!hasContentChanged('installmentPlans', list)) return;

      if (setInstallmentPlans) {
        setInstallmentPlans(prev => mergeCloudWithPending(list, getPendingQueue(), 'installmentPlans', prev));
      }
      financialSyncService.hydrateFromCloud('installmentPlans', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar parcelamentos no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar parcelamentos no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubPlans);

  // 8. Investments
  const unsubInvestments = onSnapshot(
    collection(firestore, 'users', userId, 'investments'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentAsset));
      if (!hasContentChanged('investments', list)) return;

      if (setInvestments) {
        setInvestments(prev => mergeCloudWithPending(list, getPendingQueue(), 'investments', prev));
      }
      financialSyncService.hydrateFromCloud('investments', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar investimentos no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar investimentos no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubInvestments);

  // 9. Investment Transactions (Ledger de investimentos)
  const unsubInvestmentTransactions = onSnapshot(
    collection(firestore, 'users', userId, 'investmentTransactions'),
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentTransaction));
      if (!hasContentChanged('investmentTransactions', list)) return;

      if (setInvestmentTransactions) {
        setInvestmentTransactions(prev => {
          const merged = mergeCloudWithPending(list, getPendingQueue(), 'investmentTransactions', prev);
          return merged.sort((a, b) => b.date.localeCompare(a.date));
        });
      }
      financialSyncService.hydrateFromCloud('investmentTransactions', list).catch(err => {
        console.warn('[useFirestoreSync] Erro ao hidratar ledger de investimentos no IndexedDB:', err);
      });
    },
    (error) => {
      console.warn('[useFirestoreSync] Erro ao escutar transações de investimentos no Firestore:', error);
    }
  );
  currentUnsubs.push(unsubInvestmentTransactions);

  // 10. Transactions (Escuta por mês selecionado se fornecido, ou coleção inteira)
  if (selectedMonth) {
    const unsubTransactions = subscribeMonthTransactions(
      userId,
      selectedMonth,
      (cloudMonthList) => {
        if (!hasContentChanged(`transactions_${selectedMonth}`, cloudMonthList)) return;

        if (setTransactions) {
          setTransactions(prev => {
            const mergedMonth = mergeCloudWithPending(
              cloudMonthList,
              getPendingQueue(),
              'transactions',
              prev
            );
            const otherMonths = prev.filter(t => !t.date.startsWith(selectedMonth));
            const combined = [...mergedMonth, ...otherMonths];
            return combined.sort((a, b) => b.date.localeCompare(a.date));
          });
        }

        financialSyncService.hydrateFromCloud('transactions', cloudMonthList).catch(err => {
          console.warn('[useFirestoreSync] Erro ao hidratar transações no IndexedDB:', err);
        });
      }
    );
    currentUnsubs.push(unsubTransactions);
  } else {
    const unsubTransactions = onSnapshot(
      collection(firestore, 'users', userId, 'transactions'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        if (!hasContentChanged('transactions', list)) return;

        if (setTransactions) {
          setTransactions(prev => {
            const merged = mergeCloudWithPending(list, getPendingQueue(), 'transactions', prev);
            return merged.sort((a, b) => b.date.localeCompare(a.date));
          });
        }

        financialSyncService.hydrateFromCloud('transactions', list).catch(err => {
          console.warn('[useFirestoreSync] Erro ao hidratar transações no IndexedDB:', err);
        });
      },
      (error) => {
        console.warn('[useFirestoreSync] Erro ao escutar transações gerais no Firestore:', error);
      }
    );
    currentUnsubs.push(unsubTransactions);
  }

  const unsubscribeAll = () => {
    currentUnsubs.forEach(unsub => {
      try {
        unsub();
      } catch (err) {
        console.warn('[useFirestoreSync] Erro durante unsubscribe:', err);
      }
    });
    currentUnsubs.length = 0;
  };

  return {
    get isListening() {
      return currentUnsubs.length > 0;
    },
    get activeListenersCount() {
      return currentUnsubs.length;
    },
    unsubscribeAll,
  };
}

/**
 * Hook customizado responsável pelo ciclo de vida React de sincronização em tempo real do Firestore.
 * Conecta e desconecta listeners automaticamente com base no userId autenticado e mês ativo.
 */
export function useFirestoreSync(options: UseFirestoreSyncOptions): UseFirestoreSyncResult {
  const [activeListenersCount, setActiveListenersCount] = useState<number>(0);
  const engineRef = useRef<UseFirestoreSyncResult | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { userId, isAuthReady, selectedMonth, financialSyncService, firestore } = options;

  useEffect(() => {
    // Se não há usuário ou a autenticação não está pronta, limpa listeners prévios
    if (!isAuthReady || !userId) {
      if (engineRef.current) {
        engineRef.current.unsubscribeAll();
        engineRef.current = null;
        setActiveListenersCount(0);
      }
      return;
    }

    // Registra listeners
    const engine = setupFirestoreSync(optionsRef.current);
    engineRef.current = engine;
    setActiveListenersCount(engine.activeListenersCount);

    return () => {
      engine.unsubscribeAll();
      engineRef.current = null;
      setActiveListenersCount(0);
    };
  }, [
    userId,
    isAuthReady,
    selectedMonth,
    financialSyncService,
    firestore,
  ]);

  return {
    isListening: activeListenersCount > 0,
    activeListenersCount,
    unsubscribeAll: () => {
      engineRef.current?.unsubscribeAll();
      engineRef.current = null;
      setActiveListenersCount(0);
    },
  };
}

export default useFirestoreSync;
