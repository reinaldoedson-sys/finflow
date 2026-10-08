import 'fake-indexeddb/auto';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import {
  migrateFromLocalStorageIfAvailable,
  MIGRATION_FLAG_KEY,
} from '../src/storage/indexedDB/migrations';
import {
  loadAllFinancialEntities,
  replaceCollection,
  putItems,
  deleteItems,
  clearAllFinancialEntities,
  hasAnyDataInIndexedDB,
} from '../src/storage/indexedDB/repositories';
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
} from '../src/types/finance';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${msg}`);
  }
}

// Mock simples de localStorage em ambiente Node
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

// Configura global.localStorage para os testes
(globalThis as any).localStorage = new MockLocalStorage();

async function runTests() {
  console.log('🧪 Iniciando testes de IndexedDB e Migração do FinFlow...');

  const testDbName = `TestFinFlowDB_${Date.now()}`;
  const testDb = new FinFlowDatabase(testDbName);

  // 1. Testa banco vazio
  const initialData = await loadAllFinancialEntities(testDb);
  assert(initialData !== null, 'Deveria carregar estrutura de dados não-nula');
  assert(initialData!.transactions.length === 0, 'Transactions deve iniciar vazio');
  assert(initialData!.accounts.length === 0, 'Accounts deve iniciar vazio');

  const hasDataInitial = await hasAnyDataInIndexedDB(testDb);
  assert(!hasDataInitial, 'hasAnyDataInIndexedDB deve retornar false inicialmente');

  // 2. Prepara dados no localStorage para testar a migração
  const mockTx: Transaction = {
    id: 'tx_mig_1',
    description: 'Compra Mercado',
    amount: 15000,
    type: 'expense',
    categoryId: 'cat_food',
    accountId: 'acc_1',
    paymentMethod: 'pix',
    date: '2026-10-01',
    status: 'completed',
    createdAt: '2026-10-01T10:00:00Z',
  };

  const mockAcc: Account = {
    id: 'acc_1',
    name: 'Conta Corrente',
    type: 'checking',
    bankName: 'Nubank',
    color: '#820ad1',
    initialBalance: 50000,
    currentBalance: 35000,
    icon: 'wallet',
  };

  const mockCard: CreditCard = {
    id: 'card_1',
    name: 'Cartão Ultravioleta',
    bankName: 'Nubank',
    color: '#000',
    limit: 500000,
    closingDay: 5,
    dueDay: 12,
    currentInvoice: 0,
  };

  const mockAsset: InvestmentAsset = {
    id: 'ast_1',
    ticker: 'PETR4',
    name: 'Petrobras',
    type: 'stock',
    quantity: 100,
    averagePrice: 3000,
    currentPrice: 3500,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-09-01T00:00:00Z',
  };

  const mockInvTx: InvestmentTransaction = {
    id: 'invtx_1',
    assetId: 'ast_1',
    type: 'buy',
    date: '2026-09-01',
    quantity: 100,
    price: 3000,
    totalAmount: 300000,
    createdAt: '2026-09-01T00:00:00Z',
  };

  const mockGoal: FinancialGoal = {
    id: 'goal_1',
    name: 'Reserva de Emergência',
    targetAmount: 1000000,
    currentAmount: 250000,
    targetDate: '2027-12-31',
    color: '#10b981',
    icon: 'shield',
  };

  const mockGoalMov: GoalMovement = {
    id: 'gmov_1',
    goalId: 'goal_1',
    type: 'deposit',
    amount: 250000,
    date: '2026-10-01',
    createdAt: '2026-10-01T12:00:00Z',
  };

  const mockPlan: InstallmentPlan = {
    id: 'plan_1',
    description: 'Notebook',
    totalAmount: 480000,
    installmentAmount: 40000,
    totalInstallments: 12,
    type: 'expense',
    categoryId: 'cat_eletronics',
    accountId: 'acc_1',
    paymentMethod: 'credit_card',
    startDate: '2026-10-01',
    createdAt: '2026-10-01T10:00:00Z',
  };

  const mockBudget: Budget = {
    id: 'bdg_1',
    categoryId: 'cat_food',
    month: '2026-10',
    limitAmount: 150000,
  };

  localStorage.setItem('finflow_app_transactions', JSON.stringify([mockTx]));
  localStorage.setItem('finflow_app_accounts', JSON.stringify([mockAcc]));
  localStorage.setItem('finflow_app_credit_cards', JSON.stringify([mockCard]));
  localStorage.setItem('finflow_app_investments', JSON.stringify([mockAsset]));
  localStorage.setItem('finflow_app_investment_transactions', JSON.stringify([mockInvTx]));
  localStorage.setItem('finflow_app_goals', JSON.stringify([mockGoal]));
  localStorage.setItem('finflow_app_goal_movements', JSON.stringify([mockGoalMov]));
  localStorage.setItem('finflow_app_installment_plans', JSON.stringify([mockPlan]));
  localStorage.setItem('finflow_app_budgets', JSON.stringify([mockBudget]));

  // 3. Executa a migração
  console.log('  -> Testando migrateFromLocalStorageIfAvailable...');
  const migResult = await migrateFromLocalStorageIfAvailable(testDb);
  assert(migResult.migrated === true, 'Migração deveria ter sido realizada');
  assert(migResult.details.transactions === 1, 'Deveria migrar 1 transação');
  assert(migResult.details.accounts === 1, 'Deveria migrar 1 conta');
  assert(migResult.details.creditCards === 1, 'Deveria migrar 1 cartão');
  assert(migResult.details.investments === 1, 'Deveria migrar 1 investimento');
  assert(migResult.details.investmentTransactions === 1, 'Deveria migrar 1 inv_transaction');
  assert(migResult.details.goals === 1, 'Deveria migrar 1 meta');
  assert(migResult.details.goalMovements === 1, 'Deveria migrar 1 goal_movement');
  assert(migResult.details.installmentPlans === 1, 'Deveria migrar 1 plano parcelado');
  assert(migResult.details.budgets === 1, 'Deveria migrar 1 orçamento');

  // Verifica se a flag foi gravada
  assert(localStorage.getItem(MIGRATION_FLAG_KEY) === 'true', 'Flag de migração deve estar marcada');

  // 4. Testa idempotência (chamada subsequente não re-migra)
  const secondMigResult = await migrateFromLocalStorageIfAvailable(testDb);
  assert(secondMigResult.migrated === false, 'Segunda migração não deve rodar novamente');
  assert(secondMigResult.alreadyDone === true, 'alreadyDone deve ser true');

  // 5. Verifica os dados gravados no IndexedDB
  const loadedData = await loadAllFinancialEntities(testDb);
  assert(loadedData !== null, 'Dados carregados não devem ser nulos');
  assert(loadedData!.transactions.length === 1, 'Deve conter 1 transação no IDB');
  assert(loadedData!.transactions[0].id === 'tx_mig_1', 'ID da transação deve bater');
  assert(loadedData!.accounts.length === 1, 'Deve conter 1 conta');
  assert(loadedData!.creditCards.length === 1, 'Deve conter 1 cartão');
  assert(loadedData!.investments.length === 1, 'Deve conter 1 investimento');
  assert(loadedData!.investmentTransactions.length === 1, 'Deve conter 1 inv_transaction');
  assert(loadedData!.goals.length === 1, 'Deve conter 1 meta');
  assert(loadedData!.goalMovements.length === 1, 'Deve conter 1 movimento de meta');
  assert(loadedData!.installmentPlans.length === 1, 'Deve conter 1 parcelamento');
  assert(loadedData!.budgets.length === 1, 'Deve conter 1 orçamento');

  // 6. Testa operações de repositório (putItems, deleteItems, replaceCollection)
  const newTx: Transaction = {
    ...mockTx,
    id: 'tx_mig_2',
    description: 'Farmácia',
    amount: 4500,
  };
  await putItems('transactions', [newTx], testDb);
  let txs = await testDb.transactions.toArray();
  assert(txs.length === 2, 'Deveria ter 2 transações após putItems');

  await deleteItems('transactions', ['tx_mig_1'], testDb);
  txs = await testDb.transactions.toArray();
  assert(txs.length === 1, 'Deveria ter 1 transação após deleteItems');
  assert(txs[0].id === 'tx_mig_2', 'Apenas tx_mig_2 deve restar');

  // Testa replaceCollection
  await replaceCollection('transactions', [mockTx], testDb);
  txs = await testDb.transactions.toArray();
  assert(txs.length === 1, 'replaceCollection deve substituir lista');
  assert(txs[0].id === 'tx_mig_1', 'mockTx deve estar presente');

  // 7. Testa clearAllFinancialEntities
  await clearAllFinancialEntities(testDb);
  const clearedData = await loadAllFinancialEntities(testDb);
  assert(clearedData!.transactions.length === 0, 'Transactions deve estar limpo');
  assert(clearedData!.accounts.length === 0, 'Accounts deve estar limpo');
  assert(clearedData!.investments.length === 0, 'Investments deve estar limpo');

  console.log('✅ Todos os testes de IndexedDB e Migração passaram com sucesso!');
}

runTests().catch(err => {
  console.error('❌ Falha nos testes de IndexedDB:', err);
  process.exit(1);
});
