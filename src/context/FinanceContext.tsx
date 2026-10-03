import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { 
  Transaction, 
  Account, 
  CreditCard, 
  Category, 
  Budget, 
  FinancialGoal, 
  CurrencyCode,
  InstallmentPlan 
} from '../types/finance';
import { 
  DEFAULT_CATEGORIES, 
  INITIAL_ACCOUNTS, 
  INITIAL_CREDIT_CARDS, 
  INITIAL_GOALS, 
  INITIAL_BUDGETS, 
  INITIAL_TRANSACTIONS,
  INITIAL_INSTALLMENT_PLANS
} from '../utils/mockData';
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

interface FinanceContextType {
  transactions: Transaction[];
  accounts: Account[];
  creditCards: CreditCard[];
  categories: Category[];
  budgets: Budget[];
  goals: FinancialGoal[];
  installmentPlans: InstallmentPlan[];
  currency: CurrencyCode;
  selectedMonth: string;
  isCloudSynced: boolean;
  isDemoActive: boolean;
  clearSampleData: () => Promise<void>;
  syncLocalToCloud: () => Promise<void>;
  setCurrency: (c: CurrencyCode) => void;
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;

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

  // Goal Actions
  addGoal: (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => Promise<void>;
  updateGoal: (id: string, goal: Partial<FinancialGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addGoalDeposit: (id: string, amount: number) => Promise<void>;

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
      return JSON.parse(stored);
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

  const [goals, setGoals] = useState<FinancialGoal[]>(() =>
    getInitialData('goals', INITIAL_GOALS)
  );

  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>(() =>
    getInitialData('installment_plans', INITIAL_INSTALLMENT_PLANS)
  );

  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    getInitialData('transactions', INITIAL_TRANSACTIONS)
  );

  // Set initial flag after first boot
  useEffect(() => {
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
  }, []);

  const isCloudSynced = !!currentUser;

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
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify(goals));
  }, [goals]);

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

  // Real-time Firestore Sync when user is authenticated
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const uid = currentUser.uid;

    // Listen to Accounts
    const accPath = `users/${uid}/accounts`;
    const unsubAccounts = onSnapshot(
      collection(db, 'users', uid, 'accounts'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
        setAccounts(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, accPath)
    );

    // Listen to Credit Cards
    const cardPath = `users/${uid}/creditCards`;
    const unsubCards = onSnapshot(
      collection(db, 'users', uid, 'creditCards'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditCard));
        setCreditCards(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, cardPath)
    );

    // Listen to Categories
    const catPath = `users/${uid}/categories`;
    const unsubCats = onSnapshot(
      collection(db, 'users', uid, 'categories'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
        setCategories(list.length > 0 ? list : DEFAULT_CATEGORIES);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, catPath)
    );

    // Listen to Budgets
    const budgetPath = `users/${uid}/budgets`;
    const unsubBudgets = onSnapshot(
      collection(db, 'users', uid, 'budgets'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget));
        setBudgets(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, budgetPath)
    );

    // Listen to Goals
    const goalPath = `users/${uid}/goals`;
    const unsubGoals = onSnapshot(
      collection(db, 'users', uid, 'goals'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialGoal));
        setGoals(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, goalPath)
    );

    // Listen to Installment Plans
    const plansPath = `users/${uid}/installmentPlans`;
    const unsubPlans = onSnapshot(
      collection(db, 'users', uid, 'installmentPlans'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InstallmentPlan));
        setInstallmentPlans(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, plansPath)
    );

    // Listen to Transactions
    const txPath = `users/${uid}/transactions`;
    const unsubTransactions = onSnapshot(
      collection(db, 'users', uid, 'transactions'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        list.sort((a, b) => b.date.localeCompare(a.date));
        setTransactions(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, txPath)
    );

    return () => {
      unsubAccounts();
      unsubCards();
      unsubCats();
      unsubBudgets();
      unsubGoals();
      unsubPlans();
      unsubTransactions();
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
  const seedInitialDataToCloud = async (uid: string) => {
    try {
      const batch = writeBatch(db);

      // Seed categories
      for (const cat of categories) {
        const ref = doc(db, 'users', uid, 'categories', cat.id);
        batch.set(ref, {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          type: cat.type,
          userId: uid
        });
      }

      // Seed accounts
      for (const acc of accounts) {
        const ref = doc(db, 'users', uid, 'accounts', acc.id);
        batch.set(ref, {
          name: acc.name,
          bankName: acc.bankName,
          type: acc.type,
          color: acc.color,
          initialBalance: acc.initialBalance,
          currentBalance: acc.currentBalance,
          icon: acc.icon,
          userId: uid
        });
      }

      // Seed credit cards
      for (const card of creditCards) {
        const ref = doc(db, 'users', uid, 'creditCards', card.id);
        batch.set(ref, {
          name: card.name,
          bankName: card.bankName,
          color: card.color,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          currentInvoice: card.currentInvoice,
          userId: uid
        });
      }

      // Seed budgets
      for (const b of budgets) {
        const ref = doc(db, 'users', uid, 'budgets', b.id);
        batch.set(ref, {
          categoryId: b.categoryId,
          month: b.month,
          limitAmount: b.limitAmount,
          userId: uid
        });
      }

      // Seed goals
      for (const g of goals) {
        const ref = doc(db, 'users', uid, 'goals', g.id);
        batch.set(ref, {
          name: g.name,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          targetDate: g.targetDate,
          color: g.color,
          icon: g.icon,
          notes: g.notes || '',
          userId: uid
        });
      }

      // Seed installment plans
      for (const p of installmentPlans) {
        const ref = doc(db, 'users', uid, 'installmentPlans', p.id);
        batch.set(ref, {
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
        });
      }

      // Seed transactions
      for (const tx of transactions) {
        const ref = doc(db, 'users', uid, 'transactions', tx.id);
        batch.set(ref, {
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
        });
      }

      await batch.commit();
    } catch (err) {
      console.error('Error syncing user cloud data:', err);
    }
  };

  const syncLocalToCloud = async () => {
    if (!currentUser) return;
    await seedInitialDataToCloud(currentUser.uid);
  };

  // Recalculate account and credit card balances
  const computedAccounts = useMemo(() => {
    return accounts.map(account => {
      let balance = account.initialBalance;

      transactions.forEach(tx => {
        if (tx.status !== 'completed') return;

        if (tx.paymentMethod === 'credit_card' && tx.creditCardId) {
          return;
        }

        if (tx.type === 'income' && tx.accountId === account.id) {
          balance += tx.amount;
        } else if (tx.type === 'expense' && tx.accountId === account.id) {
          balance -= tx.amount;
        } else if (tx.type === 'transfer') {
          if (tx.accountId === account.id) {
            balance -= tx.amount;
          }
          if (tx.targetAccountId === account.id) {
            balance += tx.amount;
          }
        }
      });

      return {
        ...account,
        currentBalance: balance
      };
    });
  }, [accounts, transactions]);

  const computedCreditCards = useMemo(() => {
    return creditCards.map(card => {
      let invoice = 0;
      transactions.forEach(tx => {
        if (tx.creditCardId === card.id && tx.type === 'expense') {
          invoice += tx.amount;
        }
      });
      return {
        ...card,
        currentInvoice: invoice
      };
    });
  }, [creditCards, transactions]);

  // Monthly summary
  const summary = useMemo(() => {
    const totalAccountsBalance = computedAccounts.reduce((acc, a) => acc + a.currentBalance, 0);
    const totalCreditCardDebt = computedCreditCards.reduce((acc, c) => acc + c.currentInvoice, 0);
    const totalNetWorth = totalAccountsBalance - totalCreditCardDebt;

    let monthRealizedIncome = 0;
    let monthExpectedIncome = 0;
    let monthRealizedExpense = 0;
    let monthExpectedExpense = 0;

    transactions.forEach(tx => {
      if (tx.date.startsWith(selectedMonth)) {
        if (tx.type === 'income') {
          monthExpectedIncome += tx.amount;
          if (tx.status === 'completed') {
            monthRealizedIncome += tx.amount;
          }
        } else if (tx.type === 'expense') {
          monthExpectedExpense += tx.amount;
          if (tx.status === 'completed') {
            monthRealizedExpense += tx.amount;
          }
        }
      }
    });

    const monthNetBalance = monthRealizedIncome - monthRealizedExpense;
    const savingsRate = monthRealizedIncome > 0 
      ? Math.max(0, Math.round((monthNetBalance / monthRealizedIncome) * 100))
      : 0;

    return {
      totalNetWorth,
      totalAccountsBalance,
      totalCreditCardDebt,
      monthRealizedIncome,
      monthExpectedIncome,
      monthRealizedExpense,
      monthExpectedExpense,
      monthNetBalance,
      savingsRate
    };
  }, [computedAccounts, computedCreditCards, transactions, selectedMonth]);

  const goToPreviousMonth = () => setSelectedMonth(prev => getPreviousMonth(prev));
  const goToNextMonth = () => setSelectedMonth(prev => getNextMonth(prev));
  const goToCurrentMonth = () => setSelectedMonth(getCurrentMonth());
  const setCurrency = (c: CurrencyCode) => setCurrencyState(c);

  // Transaction CRUD (Local + Firestore)
  const addTransaction = async (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newId = 'tx-' + Date.now();
    const createdAt = new Date().toISOString();
    const newTx: Transaction = {
      ...tx,
      id: newId,
      createdAt
    };

    setTransactions(prev => [newTx, ...prev]);

    if (currentUser) {
      const path = `users/${currentUser.uid}/transactions/${newId}`;
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'transactions', newId), {
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
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const updateTransaction = async (id: string, updatedFields: Partial<Transaction>) => {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, ...updatedFields } : tx));

    if (currentUser) {
      const path = `users/${currentUser.uid}/transactions/${id}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'transactions', id), {
          ...updatedFields,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const deleteTransaction = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setTransactions(prev => prev.filter(tx => tx.id !== id));

    if (currentUser) {
      const path = `users/${currentUser.uid}/transactions/${id}`;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
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
    const newId = 'acc-' + Date.now();
    const newAcc: Account = {
      ...acc,
      id: newId,
      currentBalance: acc.initialBalance
    };

    setAccounts(prev => [...prev, newAcc]);

    if (currentUser) {
      const path = `users/${currentUser.uid}/accounts/${newId}`;
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'accounts', newId), {
          name: acc.name,
          bankName: acc.bankName,
          type: acc.type,
          color: acc.color,
          initialBalance: acc.initialBalance,
          currentBalance: acc.initialBalance,
          icon: acc.icon,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const updateAccount = async (id: string, updatedFields: Partial<Account>) => {
    setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, ...updatedFields } : acc));

    if (currentUser) {
      const path = `users/${currentUser.uid}/accounts/${id}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'accounts', id), {
          ...updatedFields,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const deleteAccount = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setAccounts(prev => prev.filter(acc => acc.id !== id));

    if (currentUser) {
      const path = `users/${currentUser.uid}/accounts/${id}`;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'accounts', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  // Credit Card CRUD
  const addCreditCard = async (card: Omit<CreditCard, 'id' | 'currentInvoice'>) => {
    const newId = 'card-' + Date.now();
    const newCard: CreditCard = {
      ...card,
      id: newId,
      currentInvoice: 0
    };

    setCreditCards(prev => [...prev, newCard]);

    if (currentUser) {
      const path = `users/${currentUser.uid}/creditCards/${newId}`;
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'creditCards', newId), {
          name: card.name,
          bankName: card.bankName,
          color: card.color,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          currentInvoice: 0,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const updateCreditCard = async (id: string, updatedFields: Partial<CreditCard>) => {
    setCreditCards(prev => prev.map(c => c.id === id ? { ...c, ...updatedFields } : c));

    if (currentUser) {
      const path = `users/${currentUser.uid}/creditCards/${id}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'creditCards', id), {
          ...updatedFields,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const deleteCreditCard = async (id: string) => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    setCreditCards(prev => prev.filter(c => c.id !== id));

    if (currentUser) {
      const path = `users/${currentUser.uid}/creditCards/${id}`;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'creditCards', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  // Category CRUD
  const addCategory = async (cat: Omit<Category, 'id'>) => {
    const newId = 'cat-' + Date.now();
    const newCat: Category = { ...cat, id: newId };
    setCategories(prev => [...prev, newCat]);

    if (currentUser) {
      const path = `users/${currentUser.uid}/categories/${newId}`;
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'categories', newId), {
          ...cat,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const updateCategory = async (id: string, updatedFields: Partial<Category>) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updatedFields } : c));

    if (currentUser) {
      const path = `users/${currentUser.uid}/categories/${id}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'categories', id), {
          ...updatedFields,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const deleteCategory = async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));

    if (currentUser) {
      const path = `users/${currentUser.uid}/categories/${id}`;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'categories', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  // Budget Actions
  const setBudget = async (categoryId: string, limitAmount: number) => {
    const existing = budgets.find(b => b.categoryId === categoryId && b.month === selectedMonth);
    const budgetId = existing ? existing.id : 'b-' + Date.now();

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
      const path = `users/${currentUser.uid}/budgets/${budgetId}`;
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'budgets', budgetId), {
          categoryId,
          month: selectedMonth,
          limitAmount,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  };

  const deleteBudget = async (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id));

    if (currentUser) {
      const path = `users/${currentUser.uid}/budgets/${id}`;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'budgets', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  // Goal Actions
  const addGoal = async (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => {
    const newId = 'goal-' + Date.now();
    const newGoal: FinancialGoal = {
      ...goal,
      id: newId,
      currentAmount: 0
    };
    setGoals(prev => [...prev, newGoal]);

    if (currentUser) {
      const path = `users/${currentUser.uid}/goals/${newId}`;
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'goals', newId), {
          name: goal.name,
          targetAmount: goal.targetAmount,
          currentAmount: 0,
          targetDate: goal.targetDate,
          color: goal.color,
          icon: goal.icon,
          notes: goal.notes || '',
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const updateGoal = async (id: string, updatedFields: Partial<FinancialGoal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updatedFields } : g));

    if (currentUser) {
      const path = `users/${currentUser.uid}/goals/${id}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'goals', id), {
          ...updatedFields,
          userId: currentUser.uid
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const deleteGoal = async (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));

    if (currentUser) {
      const path = `users/${currentUser.uid}/goals/${id}`;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'goals', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const addGoalDeposit = async (id: string, amount: number) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    const newAmount = Math.max(0, goal.currentAmount + amount);
    await updateGoal(id, { currentAmount: newAmount });
  };

  // Installment Plans CRUD
  const addInstallmentPlan = async (plan: Omit<InstallmentPlan, 'id' | 'createdAt'>) => {
    const planId = 'plan-' + Date.now();
    const createdAt = new Date().toISOString();
    const newPlan: InstallmentPlan = {
      ...plan,
      id: planId,
      createdAt
    };

    // Generate monthly installment dates
    const [startYear, startMonth, startDay] = plan.startDate.split('-').map(Number);
    const newTransactions: Transaction[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < plan.totalInstallments; i++) {
      const txId = `tx-${planId}-${i + 1}`;
      
      const d = new Date(startYear, (startMonth - 1) + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const maxDaysInMonth = new Date(year, d.getMonth() + 1, 0).getDate();
      const day = String(Math.min(startDay, maxDaysInMonth)).padStart(2, '0');
      const installmentDate = `${year}-${month}-${day}`;

      const isPastOrToday = installmentDate <= todayStr;

      const tx: Transaction = {
        id: txId,
        description: `${plan.description} (${i + 1}/${plan.totalInstallments})`,
        amount: plan.installmentAmount,
        type: plan.type,
        categoryId: plan.categoryId || 'cat-compras',
        accountId: plan.accountId,
        creditCardId: plan.creditCardId || '',
        paymentMethod: plan.paymentMethod,
        date: installmentDate,
        status: isPastOrToday ? 'completed' : 'pending',
        installmentPlanId: planId,
        installments: {
          current: i + 1,
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
      const batch = writeBatch(db);
      const planRef = doc(db, 'users', currentUser.uid, 'installmentPlans', planId);
      batch.set(planRef, {
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
      });

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

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/installmentPlans/${planId}`);
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
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', currentUser.uid, 'installmentPlans', planId));
      if (deleteTransactions) {
        const associated = transactions.filter(t => t.installmentPlanId === planId);
        for (const t of associated) {
          batch.delete(doc(db, 'users', currentUser.uid, 'transactions', t.id));
        }
      }
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/installmentPlans/${planId}`);
      }
    }
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
      installmentPlans,
      transactions
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

      if (payload.categories) setCategories(payload.categories);
      if (payload.accounts) setAccounts(payload.accounts);
      if (payload.creditCards) setCreditCards(payload.creditCards);
      if (payload.budgets) setBudgets(payload.budgets);
      if (payload.goals) setGoals(payload.goals);
      if (payload.installmentPlans) setInstallmentPlans(payload.installmentPlans);
      if (payload.transactions) setTransactions(payload.transactions);
      if (payload.currency) setCurrencyState(payload.currency);

      if (currentUser) {
        await seedInitialDataToCloud(currentUser.uid);
      }

      return { success: true, message: 'Backup restaurado com sucesso! Seus dados foram atualizados.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao importar dados.';
      return { success: false, message: msg };
    }
  };

  const resetToDefaults = async () => {
    localStorage.removeItem(DEMO_CLEARED_KEY);
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');

    setCategories(DEFAULT_CATEGORIES);
    setAccounts(INITIAL_ACCOUNTS);
    setCreditCards(INITIAL_CREDIT_CARDS);
    setBudgets(INITIAL_BUDGETS);
    setGoals(INITIAL_GOALS);
    setInstallmentPlans(INITIAL_INSTALLMENT_PLANS);
    setTransactions(INITIAL_TRANSACTIONS);
    setCurrencyState('BRL');
    setSelectedMonth(getCurrentMonth());

    if (currentUser) {
      await seedInitialDataToCloud(currentUser.uid);
    }
  };

  // Clears all sample/mock data so the user can start from clean scratch
  const clearSampleData = async () => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify([]));

    setAccounts([]);
    setCreditCards([]);
    setBudgets([]);
    setGoals([]);
    setInstallmentPlans([]);
    setTransactions([]);

    if (currentUser) {
      const uid = currentUser.uid;
      const subcollections = ['transactions', 'accounts', 'creditCards', 'budgets', 'goals', 'installmentPlans'];
      for (const sub of subcollections) {
        try {
          const snap = await getDocs(collection(db, 'users', uid, sub));
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (err) {
          console.error(`Error deleting ${sub} from cloud:`, err);
        }
      }
    }
  };

  const clearAllData = async () => {
    localStorage.setItem(DEMO_CLEARED_KEY, 'true');
    localStorage.setItem(HAS_INITIALIZED_KEY, 'true');
    localStorage.setItem(STORAGE_KEY_PREFIX + 'categories', JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'budgets', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'goals', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'installment_plans', JSON.stringify([]));
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify([]));

    setCategories(DEFAULT_CATEGORIES);
    setAccounts([]);
    setCreditCards([]);
    setBudgets([]);
    setGoals([]);
    setInstallmentPlans([]);
    setTransactions([]);

    if (currentUser) {
      const uid = currentUser.uid;
      const subcollections = ['transactions', 'accounts', 'creditCards', 'budgets', 'goals', 'installmentPlans'];
      for (const sub of subcollections) {
        try {
          const snap = await getDocs(collection(db, 'users', uid, sub));
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (err) {
          console.error(`Error clearing ${sub} from cloud:`, err);
        }
      }
    }
  };

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        accounts: computedAccounts,
        creditCards: computedCreditCards,
        categories,
        budgets,
        goals,
        installmentPlans,
        currency,
        selectedMonth,
        isCloudSynced,
        isDemoActive,
        clearSampleData,
        syncLocalToCloud,
        setCurrency,
        setSelectedMonth,
        goToPreviousMonth,
        goToNextMonth,
        goToCurrentMonth,
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
