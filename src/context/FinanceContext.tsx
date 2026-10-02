import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { 
  Transaction, 
  Account, 
  CreditCard, 
  Category, 
  Budget, 
  FinancialGoal, 
  CurrencyCode 
} from '../types/finance';
import { 
  DEFAULT_CATEGORIES, 
  INITIAL_ACCOUNTS, 
  INITIAL_CREDIT_CARDS, 
  INITIAL_GOALS, 
  INITIAL_BUDGETS, 
  INITIAL_TRANSACTIONS 
} from '../utils/mockData';
import { getCurrentMonth, getPreviousMonth, getNextMonth } from '../utils/currency';
import { encryptData, decryptData } from '../utils/crypto';

interface FinanceContextType {
  transactions: Transaction[];
  accounts: Account[];
  creditCards: CreditCard[];
  categories: Category[];
  budgets: Budget[];
  goals: FinancialGoal[];
  currency: CurrencyCode;
  selectedMonth: string;
  setCurrency: (c: CurrencyCode) => void;
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;

  // Transaction Actions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  toggleTransactionStatus: (id: string) => void;

  // Account Actions
  addAccount: (acc: Omit<Account, 'id' | 'currentBalance'>) => void;
  updateAccount: (id: string, acc: Partial<Account>) => void;
  deleteAccount: (id: string) => void;

  // Credit Card Actions
  addCreditCard: (card: Omit<CreditCard, 'id' | 'currentInvoice'>) => void;
  updateCreditCard: (id: string, card: Partial<CreditCard>) => void;
  deleteCreditCard: (id: string) => void;

  // Category Actions
  addCategory: (cat: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, cat: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Budget Actions
  setBudget: (categoryId: string, limitAmount: number) => void;
  deleteBudget: (id: string) => void;

  // Goal Actions
  addGoal: (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => void;
  updateGoal: (id: string, goal: Partial<FinancialGoal>) => void;
  deleteGoal: (id: string) => void;
  addGoalDeposit: (id: string, amount: number) => void;

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
  resetToDefaults: () => void;
  clearAllData: () => void;
}

const STORAGE_KEY_PREFIX = 'finflow_app_';

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    return (localStorage.getItem(STORAGE_KEY_PREFIX + 'currency') as CurrencyCode) || 'BRL';
  });

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return getCurrentMonth();
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'categories');
      return stored ? JSON.parse(stored) : DEFAULT_CATEGORIES;
    } catch {
      return DEFAULT_CATEGORIES;
    }
  });

  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'accounts');
      return stored ? JSON.parse(stored) : INITIAL_ACCOUNTS;
    } catch {
      return INITIAL_ACCOUNTS;
    }
  });

  const [creditCards, setCreditCards] = useState<CreditCard[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'credit_cards');
      return stored ? JSON.parse(stored) : INITIAL_CREDIT_CARDS;
    } catch {
      return INITIAL_CREDIT_CARDS;
    }
  });

  const [budgets, setBudgets] = useState<Budget[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'budgets');
      return stored ? JSON.parse(stored) : INITIAL_BUDGETS;
    } catch {
      return INITIAL_BUDGETS;
    }
  });

  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'goals');
      return stored ? JSON.parse(stored) : INITIAL_GOALS;
    } catch {
      return INITIAL_GOALS;
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFIX + 'transactions');
      return stored ? JSON.parse(stored) : INITIAL_TRANSACTIONS;
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  });

  // Save changes to localStorage
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
    localStorage.setItem(STORAGE_KEY_PREFIX + 'transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Recalculate account and credit card balances whenever transactions or initial balances change
  const computedAccounts = useMemo(() => {
    return accounts.map(account => {
      let balance = account.initialBalance;

      transactions.forEach(tx => {
        if (tx.status !== 'completed') return;

        // If paying via credit card, the account balance is not deducted yet (card invoice handles it)
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

  // Save accounts when structure changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'accounts', JSON.stringify(accounts));
  }, [accounts]);

  // Calculate credit card invoice amounts
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFIX + 'credit_cards', JSON.stringify(creditCards));
  }, [creditCards]);

  // Monthly summary calculations for the currently selected month
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

  // Month navigation helpers
  const goToPreviousMonth = () => setSelectedMonth(prev => getPreviousMonth(prev));
  const goToNextMonth = () => setSelectedMonth(prev => getNextMonth(prev));
  const goToCurrentMonth = () => setSelectedMonth(getCurrentMonth());

  // Transaction CRUD
  const addTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTx: Transaction = {
      ...tx,
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [newTx, ...prev]);
  };

  const updateTransaction = (id: string, updatedFields: Partial<Transaction>) => {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, ...updatedFields } : tx));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const toggleTransactionStatus = (id: string) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.id === id) {
        return {
          ...tx,
          status: tx.status === 'completed' ? 'pending' : 'completed'
        };
      }
      return tx;
    }));
  };

  // Account CRUD
  const addAccount = (acc: Omit<Account, 'id' | 'currentBalance'>) => {
    const newAcc: Account = {
      ...acc,
      id: 'acc-' + Date.now(),
      currentBalance: acc.initialBalance
    };
    setAccounts(prev => [...prev, newAcc]);
  };

  const updateAccount = (id: string, updatedFields: Partial<Account>) => {
    setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, ...updatedFields } : acc));
  };

  const deleteAccount = (id: string) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id));
  };

  // Credit Card CRUD
  const addCreditCard = (card: Omit<CreditCard, 'id' | 'currentInvoice'>) => {
    const newCard: CreditCard = {
      ...card,
      id: 'card-' + Date.now(),
      currentInvoice: 0
    };
    setCreditCards(prev => [...prev, newCard]);
  };

  const updateCreditCard = (id: string, updatedFields: Partial<CreditCard>) => {
    setCreditCards(prev => prev.map(card => card.id === id ? { ...card, ...updatedFields } : card));
  };

  const deleteCreditCard = (id: string) => {
    setCreditCards(prev => prev.filter(card => card.id !== id));
  };

  // Category CRUD
  const addCategory = (cat: Omit<Category, 'id'>) => {
    const newCat: Category = {
      ...cat,
      id: 'cat-' + Date.now()
    };
    setCategories(prev => [...prev, newCat]);
  };

  const updateCategory = (id: string, updatedFields: Partial<Category>) => {
    setCategories(prev => prev.map(cat => cat.id === id ? { ...cat, ...updatedFields } : cat));
  };

  const deleteCategory = (id: string) => {
    setCategories(prev => prev.filter(cat => cat.id !== id));
  };

  // Budget Actions
  const setBudget = (categoryId: string, limitAmount: number) => {
    setBudgets(prev => {
      const existingIndex = prev.findIndex(b => b.categoryId === categoryId && b.month === selectedMonth);
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = { ...copy[existingIndex], limitAmount };
        return copy;
      }
      return [
        ...prev,
        {
          id: 'b-' + Date.now(),
          categoryId,
          month: selectedMonth,
          limitAmount
        }
      ];
    });
  };

  const deleteBudget = (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id));
  };

  // Goal Actions
  const addGoal = (goal: Omit<FinancialGoal, 'id' | 'currentAmount'>) => {
    const newGoal: FinancialGoal = {
      ...goal,
      id: 'goal-' + Date.now(),
      currentAmount: 0
    };
    setGoals(prev => [...prev, newGoal]);
  };

  const updateGoal = (id: string, updatedFields: Partial<FinancialGoal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updatedFields } : g));
  };

  const deleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const addGoalDeposit = (id: string, amount: number) => {
    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        return {
          ...g,
          currentAmount: Math.max(0, g.currentAmount + amount)
        };
      }
      return g;
    }));
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
      transactions
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);

    if (passphrase && passphrase.trim().length > 0) {
      // Encrypt with AES-GCM
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

      if (payload.categories) setCategories(payload.categories);
      if (payload.accounts) setAccounts(payload.accounts);
      if (payload.creditCards) setCreditCards(payload.creditCards);
      if (payload.budgets) setBudgets(payload.budgets);
      if (payload.goals) setGoals(payload.goals);
      if (payload.transactions) setTransactions(payload.transactions);
      if (payload.currency) setCurrency(payload.currency);

      return { success: true, message: 'Backup restaurado com sucesso! Seus dados foram atualizados.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao importar dados.';
      return { success: false, message: msg };
    }
  };

  const resetToDefaults = () => {
    setCategories(DEFAULT_CATEGORIES);
    setAccounts(INITIAL_ACCOUNTS);
    setCreditCards(INITIAL_CREDIT_CARDS);
    setBudgets(INITIAL_BUDGETS);
    setGoals(INITIAL_GOALS);
    setTransactions(INITIAL_TRANSACTIONS);
    setCurrency('BRL');
    setSelectedMonth(getCurrentMonth());
  };

  const clearAllData = () => {
    setCategories(DEFAULT_CATEGORIES);
    setAccounts([]);
    setCreditCards([]);
    setBudgets([]);
    setGoals([]);
    setTransactions([]);
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
        currency,
        selectedMonth,
        setCurrency,
        setSelectedMonth,
        goToPreviousMonth,
        goToNextMonth,
        goToCurrentMonth,
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
