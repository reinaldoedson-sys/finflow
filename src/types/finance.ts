export type TransactionType = 'expense' | 'income' | 'transfer';

export type PaymentMethod = 'pix' | 'credit_card' | 'debit_card' | 'bank_slip' | 'cash' | 'transfer';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income' | 'both';
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'investment' | 'cash';
  bankName: string;
  color: string;
  initialBalance: number;
  currentBalance: number;
  icon: string;
}

export interface CreditCard {
  id: string;
  name: string;
  bankName: string;
  color: string;
  limit: number;
  closingDay: number; // dia de fechamento
  dueDay: number;     // dia de vencimento
  currentInvoice: number;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  accountId: string;          // conta de débito ou crédito
  targetAccountId?: string;    // se for transferência
  creditCardId?: string;       // se for compra no cartão
  paymentMethod: PaymentMethod;
  date: string;                // YYYY-MM-DD
  status: 'completed' | 'pending';
  notes?: string;
  tags?: string[];
  isRecurring?: boolean;
  installments?: {
    current: number;
    total: number;
    parentTransactionId?: string;
  };
  installmentPlanId?: string;
  createdAt: string;
}

export interface InstallmentPlan {
  id: string;
  description: string;
  totalAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  type: 'expense' | 'income';
  categoryId: string;
  accountId: string;
  creditCardId?: string;
  paymentMethod: PaymentMethod;
  startDate: string; // YYYY-MM-DD
  userId?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  month: string; // YYYY-MM
  limitAmount: number;
}

export type GoalMovementType = 'deposit' | 'withdrawal';

export interface GoalMovement {
  id: string;
  goalId: string;
  type: GoalMovementType;
  amount: number; // Sempre positivo
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601
  notes?: string;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  initialAmount?: number; // Saldo de abertura / inicial
  currentAmount: number; // Saldo calculado derivado
  targetDate: string; // YYYY-MM-DD
  color: string;
  icon: string;
  notes?: string;
}

export interface SecuritySettings {
  isPinEnabled: boolean;
  pinHash?: string; // SHA-256 hash do PIN de 4 dígitos
  autoLockMinutes: number; // 0 = imediato, 1, 5, 15, 0 = desativado
  hideValuesByDefault: boolean;
  lastUnlockedAt?: number;
}

export type CurrencyCode = 'BRL' | 'USD' | 'EUR';
