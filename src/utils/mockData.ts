import { Category, Account, CreditCard, Transaction, FinancialGoal, Budget, InstallmentPlan } from '../types/finance';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-salario', name: 'Salário & Renda', icon: 'Briefcase', color: '#10b981', type: 'income' },
  { id: 'cat-invest', name: 'Rendimentos & Investimentos', icon: 'TrendingUp', color: '#06b6d4', type: 'income' },
  { id: 'cat-extra', name: 'Renda Extra & Freelance', icon: 'Sparkles', color: '#3b82f6', type: 'income' },
  { id: 'cat-moradia', name: 'Moradia & Contas', icon: 'Home', color: '#6366f1', type: 'expense' },
  { id: 'cat-alimentacao', name: 'Alimentação & Mercado', icon: 'Utensils', color: '#f59e0b', type: 'expense' },
  { id: 'cat-transporte', name: 'Transporte & Carro', icon: 'Car', color: '#ef4444', type: 'expense' },
  { id: 'cat-saude', name: 'Saúde & Cuidados', icon: 'HeartPulse', color: '#ec4899', type: 'expense' },
  { id: 'cat-lazer', name: 'Lazer & Entretenimento', icon: 'Film', color: '#8b5cf6', type: 'expense' },
  { id: 'cat-educacao', name: 'Educação & Livros', icon: 'GraduationCap', color: '#14b8a6', type: 'expense' },
  { id: 'cat-assinaturas', name: 'Assinaturas & Serviços', icon: 'CreditCard', color: '#a855f7', type: 'expense' },
  { id: 'cat-compras', name: 'Compras & Vestuário', icon: 'ShoppingBag', color: '#f97316', type: 'expense' },
  { id: 'cat-outros', name: 'Outros & Diversos', icon: 'MoreHorizontal', color: '#64748b', type: 'both' }
];

export const INITIAL_ACCOUNTS: Account[] = [
  {
    id: 'acc-itau',
    name: 'Itaú Unibanco',
    type: 'checking',
    bankName: 'Itaú',
    color: '#ea580c',
    initialBalance: 6450.00,
    currentBalance: 6450.00,
    icon: 'Building2'
  },
  {
    id: 'acc-nubank',
    name: 'Nubank NuConta',
    type: 'checking',
    bankName: 'Nubank',
    color: '#820ad1',
    initialBalance: 8320.50,
    currentBalance: 8320.50,
    icon: 'Wallet'
  },
  {
    id: 'acc-xp',
    name: 'XP Investimentos',
    type: 'investment',
    bankName: 'XP Inc.',
    color: '#0f172a',
    initialBalance: 24700.00,
    currentBalance: 24700.00,
    icon: 'LineChart'
  },
  {
    id: 'acc-dinheiro',
    name: 'Carteira Física',
    type: 'cash',
    bankName: 'Dinheiro Espécie',
    color: '#15803d',
    initialBalance: 420.00,
    currentBalance: 420.00,
    icon: 'Coins'
  }
];

export const INITIAL_CREDIT_CARDS: CreditCard[] = [
  {
    id: 'card-nubank',
    name: 'Nubank Mastercard Black',
    bankName: 'Nubank',
    color: '#820ad1',
    limit: 12000.00,
    closingDay: 25,
    dueDay: 2,
    currentInvoice: 2180.40
  },
  {
    id: 'card-itau',
    name: 'Itaú Visa Infinite',
    bankName: 'Itaú',
    color: '#ea580c',
    limit: 20000.00,
    closingDay: 12,
    dueDay: 19,
    currentInvoice: 1450.00
  }
];

export const INITIAL_GOALS: FinancialGoal[] = [
  {
    id: 'goal-1',
    name: 'Reserva de Emergência (6 meses)',
    targetAmount: 30000.00,
    currentAmount: 21500.00,
    targetDate: '2026-12-31',
    color: '#10b981',
    icon: 'ShieldCheck',
    notes: 'Manter em CDI 100% liquidez diária'
  },
  {
    id: 'goal-2',
    name: 'Viagem de Férias para Europa',
    targetAmount: 14000.00,
    currentAmount: 9200.00,
    targetDate: '2027-04-15',
    color: '#3b82f6',
    icon: 'Plane',
    notes: 'Passagens e hospedagem em Portugal e Espanha'
  },
  {
    id: 'goal-3',
    name: 'Upgrade Workstation / Laptop',
    targetAmount: 8500.00,
    currentAmount: 8500.00,
    targetDate: '2026-10-30',
    color: '#a855f7',
    icon: 'Laptop',
    notes: 'Meta 100% atingida!'
  }
];

export const INITIAL_BUDGETS: Budget[] = [
  { id: 'b-1', categoryId: 'cat-alimentacao', month: '2026-10', limitAmount: 2200.00 },
  { id: 'b-2', categoryId: 'cat-moradia', month: '2026-10', limitAmount: 3500.00 },
  { id: 'b-3', categoryId: 'cat-transporte', month: '2026-10', limitAmount: 850.00 },
  { id: 'b-4', categoryId: 'cat-lazer', month: '2026-10', limitAmount: 900.00 },
  { id: 'b-5', categoryId: 'cat-assinaturas', month: '2026-10', limitAmount: 250.00 },
  { id: 'b-6', categoryId: 'cat-saude', month: '2026-10', limitAmount: 600.00 },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    description: 'Salário Mensal Corporativo',
    amount: 11500.00,
    type: 'income',
    categoryId: 'cat-salario',
    accountId: 'acc-itau',
    paymentMethod: 'transfer',
    date: '2026-10-01',
    status: 'completed',
    notes: 'Depósito em conta corrente Itaú',
    tags: ['salário', 'empresa'],
    createdAt: '2026-10-01T08:30:00Z'
  },
  {
    id: 'tx-2',
    description: 'Aluguel do Apartamento',
    amount: 2400.00,
    type: 'expense',
    categoryId: 'cat-moradia',
    accountId: 'acc-itau',
    paymentMethod: 'pix',
    date: '2026-10-02',
    status: 'completed',
    notes: 'Comprovante enviado para a imobiliária',
    tags: ['moradia', 'essencial'],
    createdAt: '2026-10-02T10:15:00Z'
  },
  {
    id: 'tx-3',
    description: 'Supermercado Pão de Açúcar',
    amount: 542.80,
    type: 'expense',
    categoryId: 'cat-alimentacao',
    accountId: 'acc-nubank',
    creditCardId: 'card-nubank',
    paymentMethod: 'credit_card',
    date: '2026-10-02',
    status: 'completed',
    notes: 'Compras da quinzena',
    tags: ['mercado', 'casa'],
    createdAt: '2026-10-02T14:40:00Z'
  },
  {
    id: 'tx-4',
    description: 'Rendimento de Dividendos & FIIs',
    amount: 384.50,
    type: 'income',
    categoryId: 'cat-invest',
    accountId: 'acc-xp',
    paymentMethod: 'transfer',
    date: '2026-10-03',
    status: 'completed',
    notes: 'Proventos creditados na conta XP',
    tags: ['dividendos', 'fiis'],
    createdAt: '2026-10-03T11:00:00Z'
  },
  {
    id: 'tx-5',
    description: 'Condomínio Residencial',
    amount: 680.00,
    type: 'expense',
    categoryId: 'cat-moradia',
    accountId: 'acc-itau',
    paymentMethod: 'bank_slip',
    date: '2026-10-05',
    status: 'pending',
    notes: 'Boleto vence no dia 05',
    tags: ['moradia', 'condomínio'],
    createdAt: '2026-10-01T09:00:00Z'
  },
  {
    id: 'tx-6',
    description: 'Abastecimento Posto Shell (Gasolina)',
    amount: 220.00,
    type: 'expense',
    categoryId: 'cat-transporte',
    accountId: 'acc-nubank',
    paymentMethod: 'debit_card',
    date: '2026-10-04',
    status: 'completed',
    tags: ['combustível'],
    createdAt: '2026-10-04T17:20:00Z'
  },
  {
    id: 'tx-7',
    description: 'Assinatura Netflix & Spotify Premium',
    amount: 89.80,
    type: 'expense',
    categoryId: 'cat-assinaturas',
    accountId: 'acc-nubank',
    creditCardId: 'card-nubank',
    paymentMethod: 'credit_card',
    date: '2026-10-06',
    status: 'pending',
    isRecurring: true,
    tags: ['streaming', 'recorrente'],
    createdAt: '2026-10-01T00:00:00Z'
  },
  {
    id: 'tx-8',
    description: 'Projeto Consultoria Freelance UI/UX',
    amount: 1800.00,
    type: 'income',
    categoryId: 'cat-extra',
    accountId: 'acc-nubank',
    paymentMethod: 'pix',
    date: '2026-10-08',
    status: 'pending',
    notes: 'Entrega final da etapa de prototipagem',
    tags: ['freelance', 'design'],
    createdAt: '2026-10-02T13:00:00Z'
  },
  {
    id: 'tx-9',
    description: 'Farmácia Raia (Medicamentos e Vitaminas)',
    amount: 145.30,
    type: 'expense',
    categoryId: 'cat-saude',
    accountId: 'acc-itau',
    paymentMethod: 'pix',
    date: '2026-10-02',
    status: 'completed',
    tags: ['saúde'],
    createdAt: '2026-10-02T18:10:00Z'
  },
  {
    id: 'tx-10',
    description: 'Jantar Restaurante Fogo de Chão',
    amount: 320.00,
    type: 'expense',
    categoryId: 'cat-lazer',
    accountId: 'acc-itau',
    creditCardId: 'card-itau',
    paymentMethod: 'credit_card',
    date: '2026-10-03',
    status: 'completed',
    notes: 'Comemoração em família',
    tags: ['restaurante', 'lazer'],
    createdAt: '2026-10-03T21:45:00Z'
  }
];

export const INITIAL_INSTALLMENT_PLANS: InstallmentPlan[] = [
  {
    id: 'plan-1',
    description: 'Smartphone Galaxy S24 Ultra',
    totalAmount: 6499.00,
    installmentAmount: 649.90,
    totalInstallments: 10,
    type: 'expense',
    categoryId: 'cat-compras',
    accountId: 'acc-nubank',
    creditCardId: 'card-nubank',
    paymentMethod: 'credit_card',
    startDate: '2026-08-10',
    createdAt: '2026-08-10T12:00:00Z'
  },
  {
    id: 'plan-2',
    description: 'Seguro Auto Anual Porto Seguro',
    totalAmount: 2850.00,
    installmentAmount: 475.00,
    totalInstallments: 6,
    type: 'expense',
    categoryId: 'cat-transporte',
    accountId: 'acc-itau',
    creditCardId: 'card-itau',
    paymentMethod: 'credit_card',
    startDate: '2026-09-15',
    createdAt: '2026-09-15T10:00:00Z'
  }
];

