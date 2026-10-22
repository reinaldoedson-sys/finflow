import { useEffect, useRef, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { loadFirebase } from '../firebaseLoader';
import { subscribeMonthTransactions } from '../services/firestoreTransactions';
import { createAsyncSubscription } from '../utils/asyncSubscription';
import { mergeCloudWithPending, type PendingSyncOperation } from '../domain/sync';
import { resolveGoalInitialAmount } from '../domain/calculations';
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
  getCurrentUserId?: () => string | null | undefined;
}

export interface UseFirestoreSyncResult {
  isListening: boolean;
  activeListenersCount: number;
  unsubscribeAll: () => void;
}

/**
 * Registra os 10 listeners Firestore e coordena a sincronização reativa,
 * prevenção de loops de eco e hidratação local via FinancialSyncService.
 * Protegido contra condições de corrida por createAsyncSubscription e checagem de UID.
 */
export function setupFirestoreSync(options: UseFirestoreSyncOptions): UseFirestoreSyncResult {
  const {
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
    firestore,
    getCurrentUserId,
  } = options;

  if (!isAuthReady || !userId) {
    return {
      isListening: false,
      activeListenersCount: 0,
      unsubscribeAll: () => {},
    };
  }

  const lastProcessedHash: Record<string, string> = {};
  let activeCount = 10;

  interface SyncHashableItem {
    id: string;
    updatedAt?: string;
    lastPriceUpdate?: string;
    currentPrice?: number;
    date?: string;
    tombstoneRevision?: number;
  }

  // Prevenção de loop de eco
  const hasContentChanged = (entityName: string, items: SyncHashableItem[]): boolean => {
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

  const cancelAsyncSub = createAsyncSubscription(async (isCancelled) => {
    try {
      const [fb, firestorePkg] = await Promise.all([
        firestore ? Promise.resolve(null) : loadFirebase(),
        import('firebase/firestore'),
      ]);

      if (isCancelled()) return;
      if (getCurrentUserId && getCurrentUserId() !== userId) return;

      const activeFirestore = firestore || fb!.db;
      const { collection, onSnapshot } = firestorePkg;

      const unsubs: (() => void)[] = [];

      // Guarda contra snapshots tardios ou vindos de contas desautenticadas/trocadas
      const isSnapshotValid = () => {
        if (isCancelled()) return false;
        if (getCurrentUserId && getCurrentUserId() !== userId) return false;
        return true;
      };

      // 1. Accounts
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'accounts'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar contas no Firestore:', error);
          }
        )
      );

      // 2. Credit Cards
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'creditCards'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar cartões no Firestore:', error);
          }
        )
      );

      // 3. Categories
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'categories'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar categorias no Firestore:', error);
          }
        )
      );

      // 4. Budgets
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'budgets'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar orçamentos no Firestore:', error);
          }
        )
      );

      // 5. Goals
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'goals'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
            const list = snapshot.docs.map(doc => {
              const data = doc.data();
              const movements = [] as GoalMovement[];
              const initial = resolveGoalInitialAmount(data, movements);
              return {
                id: doc.id,
                ...data,
                initialAmount: initial,
                currentAmount: data.currentAmount ?? initial
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar metas no Firestore:', error);
          }
        )
      );

      // 6. Goal Movements
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'goalMovements'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar movimentações de metas no Firestore:', error);
          }
        )
      );

      // 7. Installment Plans
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'installmentPlans'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar parcelamentos no Firestore:', error);
          }
        )
      );

      // 8. Investments
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'investments'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
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
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar investimentos no Firestore:', error);
          }
        )
      );

      // 9. Investment Transactions
      unsubs.push(
        onSnapshot(
          collection(activeFirestore, 'users', userId, 'investmentTransactions'),
          (snapshot) => {
            if (!isSnapshotValid()) return;
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentTransaction));
            if (!hasContentChanged('investmentTransactions', list)) return;

            if (setInvestmentTransactions) {
              setInvestmentTransactions(prev => mergeCloudWithPending(list, getPendingQueue(), 'investmentTransactions', prev));
            }
            financialSyncService.hydrateFromCloud('investmentTransactions', list).catch(err => {
              console.warn('[useFirestoreSync] Erro ao hidratar ledger de investimentos no IndexedDB:', err);
            });
          },
          (error) => {
            if (!isSnapshotValid()) return;
            console.warn('[useFirestoreSync] Erro ao escutar transações de investimentos no Firestore:', error);
          }
        )
      );

      // 10. Transactions
      if (selectedMonth) {
        unsubs.push(
          subscribeMonthTransactions(
            userId,
            selectedMonth,
            (list) => {
              if (!isSnapshotValid()) return;
              if (!hasContentChanged('transactions', list)) return;

              if (setTransactions) {
                setTransactions(prev => mergeCloudWithPending(list, getPendingQueue(), 'transactions', prev));
              }
              financialSyncService.hydrateFromCloud('transactions', list).catch(err => {
                console.warn('[useFirestoreSync] Erro ao hidratar transações no IndexedDB:', err);
              });
            },
            (error) => {
              if (!isSnapshotValid()) return;
              console.warn('[useFirestoreSync] Erro no listener mensal de transações:', error);
            },
            activeFirestore,
            isSnapshotValid
          )
        );
      } else {
        unsubs.push(
          onSnapshot(
            collection(activeFirestore, 'users', userId, 'transactions'),
            (snapshot) => {
              if (!isSnapshotValid()) return;
              const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
              if (!hasContentChanged('transactions', list)) return;

              if (setTransactions) {
                setTransactions(prev => mergeCloudWithPending(list, getPendingQueue(), 'transactions', prev));
              }
              financialSyncService.hydrateFromCloud('transactions', list).catch(err => {
                console.warn('[useFirestoreSync] Erro ao hidratar transações no IndexedDB:', err);
              });
            },
            (error) => {
              if (!isSnapshotValid()) return;
              console.warn('[useFirestoreSync] Erro ao escutar transações gerais no Firestore:', error);
            }
          )
        );
      }

      return () => {
        unsubs.forEach(u => {
          try {
            u();
          } catch (err) {
            console.warn('[useFirestoreSync] Erro durante unsubscribe:', err);
          }
        });
      };
    } catch (err) {
      if (!isCancelled()) {
        console.warn('[useFirestoreSync] Erro ao inicializar listeners do Firestore:', err);
      }
    }
  });

  return {
    get isListening() {
      return activeCount > 0;
    },
    get activeListenersCount() {
      return activeCount;
    },
    unsubscribeAll: () => {
      activeCount = 0;
      cancelAsyncSub();
    },
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

    // Registra listeners com guarda contra troca de conta
    const engine = setupFirestoreSync({
      ...optionsRef.current,
      getCurrentUserId: () => optionsRef.current.userId,
    });
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
