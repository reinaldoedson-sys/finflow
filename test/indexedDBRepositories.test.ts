import 'fake-indexeddb/auto';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import {
  IndexedDBTransactionRepository,
  IndexedDBAccountRepository,
  IndexedDBCreditCardRepository,
  IndexedDBInvestmentRepository,
  IndexedDBGoalRepository,
  IndexedDBBudgetRepository,
} from '../src/repositories/implementations';
import type {
  Transaction,
  Account,
  CreditCard,
  InvestmentAsset,
  InvestmentTransaction,
  FinancialGoal,
  GoalMovement,
  Budget,
} from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes unitários completos dos Repositórios IndexedDB...');

  const testDbName = `TestRepoDB_${Date.now()}`;
  const testDb = new FinFlowDatabase(testDbName);

  const txRepo = new IndexedDBTransactionRepository(testDb);
  const accountRepo = new IndexedDBAccountRepository(testDb);
  const cardRepo = new IndexedDBCreditCardRepository(testDb);
  const invRepo = new IndexedDBInvestmentRepository(testDb);
  const goalRepo = new IndexedDBGoalRepository(testDb);
  const budgetRepo = new IndexedDBBudgetRepository(testDb);

  // =========================================================================
  // 1. Testes de IndexedDBTransactionRepository
  // =========================================================================
  console.log('\n--- 1. Testando IndexedDBTransactionRepository ---');

  // Teste 1.1: save e getById
  const tx1: Transaction = {
    id: 'tx_1',
    description: 'Supermercado Mensal',
    amount: 35000,
    type: 'expense',
    categoryId: 'cat_alimentacao',
    accountId: 'acc_1',
    paymentMethod: 'pix',
    date: '2026-10-05',
    status: 'completed',
    createdAt: '2026-10-05T10:00:00Z',
  };

  await txRepo.save(tx1);
  const fetchedTx1 = await txRepo.getById('tx_1');
  assert(fetchedTx1 !== null, 'tx1 deve ser encontrado');
  assert(fetchedTx1!.id === 'tx_1', 'ID de tx1 deve corresponder');
  assert(fetchedTx1!.description === 'Supermercado Mensal', 'Descrição de tx1 deve corresponder');

  const notFoundTx = await txRepo.getById('inexistente');
  assert(notFoundTx === null, 'Transação inexistente deve retornar null');

  // Teste 1.2: saveBatch
  const batchTransactions: Transaction[] = [
    {
      id: 'tx_2',
      description: 'Salário',
      amount: 600000,
      type: 'income',
      categoryId: 'cat_salario',
      accountId: 'acc_1',
      paymentMethod: 'pix',
      date: '2026-10-01',
      status: 'completed',
      createdAt: '2026-10-01T08:00:00Z',
    },
    {
      id: 'tx_3',
      description: 'Combustível',
      amount: 15000,
      type: 'expense',
      categoryId: 'cat_transporte',
      accountId: 'acc_1',
      paymentMethod: 'credit_card',
      creditCardId: 'card_1',
      date: '2026-10-15',
      status: 'completed',
      createdAt: '2026-10-15T14:00:00Z',
    },
    {
      id: 'tx_4',
      description: 'Cinema e Lanche',
      amount: 8000,
      type: 'expense',
      categoryId: 'cat_lazer',
      accountId: 'acc_2',
      paymentMethod: 'pix',
      date: '2026-10-20',
      status: 'completed',
      createdAt: '2026-10-20T20:00:00Z',
    },
    {
      id: 'tx_5',
      description: 'Assinatura Streaming (Setembro)',
      amount: 4500,
      type: 'expense',
      categoryId: 'cat_lazer',
      accountId: 'acc_1',
      paymentMethod: 'credit_card',
      creditCardId: 'card_1',
      date: '2026-09-25',
      status: 'completed',
      createdAt: '2026-09-25T12:00:00Z',
    },
  ];

  await txRepo.saveBatch(batchTransactions);
  const totalCount = await txRepo.count();
  assert(totalCount === 5, `Deveria ter 5 transações após batch, encontrado: ${totalCount}`);

  // Teste 1.3: getByMonth
  const octTransactions = await txRepo.getByMonth('2026-10');
  assert(octTransactions.length === 4, `Deveria encontrar 4 transações em 2026-10, encontrou ${octTransactions.length}`);
  const sepTransactions = await txRepo.getByMonth('2026-09');
  assert(sepTransactions.length === 1, `Deveria encontrar 1 transação em 2026-09, encontrou ${sepTransactions.length}`);
  assert(sepTransactions[0].id === 'tx_5', 'Transação de setembro deve ser tx_5');

  // Teste 1.4: getByDateRange
  const rangeTransactions = await txRepo.getByDateRange('2026-10-02', '2026-10-18');
  assert(rangeTransactions.length === 2, `Deveria encontrar 2 transações entre 02/10 e 18/10, encontrou ${rangeTransactions.length}`);
  assert(rangeTransactions[0].id === 'tx_3', 'Mais recente do range deve ser tx_3 (2026-10-15)');
  assert(rangeTransactions[1].id === 'tx_1', 'Segunda do range deve ser tx_1 (2026-10-05)');

  // Teste 1.5: getPaged com Cursor Pagination
  const page1 = await txRepo.getPaged({ limit: 2 });
  assert(page1.items.length === 2, `Página 1 deve conter 2 itens, encontrou ${page1.items.length}`);
  assert(page1.hasMore === true, 'Página 1 deve ter hasMore = true');
  assert(page1.nextCursor !== undefined, 'Página 1 deve fornecer nextCursor');
  assert(page1.items[0].id === 'tx_4', 'Primeiro item deve ser o mais recente (tx_4 - 2026-10-20)');
  assert(page1.items[1].id === 'tx_3', 'Segundo item deve ser tx_3 (2026-10-15)');
  assert(page1.nextCursor === 'tx_3', 'nextCursor deve ser tx_3');

  const page2 = await txRepo.getPaged({ cursor: page1.nextCursor, limit: 2 });
  assert(page2.items.length === 2, `Página 2 deve conter 2 itens, encontrou ${page2.items.length}`);
  assert(page2.hasMore === true, 'Página 2 deve ter hasMore = true');
  assert(page2.items[0].id === 'tx_1', 'Item 1 da página 2 deve ser tx_1 (2026-10-05)');
  assert(page2.items[1].id === 'tx_2', 'Item 2 da página 2 deve ser tx_2 (2026-10-01)');
  assert(page2.nextCursor === 'tx_2', 'nextCursor da página 2 deve ser tx_2');

  const page3 = await txRepo.getPaged({ cursor: page2.nextCursor, limit: 2 });
  assert(page3.items.length === 1, `Página 3 deve conter 1 item, encontrou ${page3.items.length}`);
  assert(page3.hasMore === false, 'Página 3 não deve ter mais itens');
  assert(page3.nextCursor === undefined, 'Página 3 não deve retornar nextCursor');
  assert(page3.items[0].id === 'tx_5', 'Último item deve ser tx_5 (2026-09-25)');

  // Teste com filtros combinados em getPaged
  const filteredPage = await txRepo.getPaged({
    limit: 10,
    creditCardId: 'card_1',
  });
  assert(filteredPage.items.length === 2, `Deveria filtrar 2 transações do card_1, encontrou ${filteredPage.items.length}`);

  // Teste 1.6: delete
  await txRepo.delete('tx_1');
  const deletedTx = await txRepo.getById('tx_1');
  assert(deletedTx === null, 'tx_1 deve ter sido deletado');
  const countAfterDelete = await txRepo.count();
  assert(countAfterDelete === 4, `Deveria restar 4 transações, encontrou ${countAfterDelete}`);

  // =========================================================================
  // 2. Testes de IndexedDBAccountRepository
  // =========================================================================
  console.log('\n--- 2. Testando IndexedDBAccountRepository ---');

  const acc1: Account = {
    id: 'acc_1',
    name: 'Nubank Principal',
    type: 'checking',
    bankName: 'Nubank',
    color: '#820ad1',
    initialBalance: 100000,
    currentBalance: 100000,
    icon: 'wallet',
  };

  const acc2: Account = {
    id: 'acc_2',
    name: 'Poupança Caixa',
    type: 'savings',
    bankName: 'Caixa',
    color: '#005ca9',
    initialBalance: 250000,
    currentBalance: 250000,
    icon: 'piggy-bank',
  };

  await accountRepo.save(acc1);
  const fetchedAcc1 = await accountRepo.getById('acc_1');
  assert(fetchedAcc1 !== null, 'acc1 deve existir');
  assert(fetchedAcc1!.name === 'Nubank Principal', 'Nome da conta deve bater');

  await accountRepo.saveBatch([acc2]);
  const savingsAccounts = await accountRepo.getByType('savings');
  assert(savingsAccounts.length === 1, 'Deve encontrar 1 conta poupança');
  assert(savingsAccounts[0].id === 'acc_2', 'ID da conta poupança deve ser acc_2');

  const checkingAccounts = await accountRepo.getByType('checking');
  assert(checkingAccounts.length === 1, 'Deve encontrar 1 conta corrente');

  // Validação Semântica do saveBalanceSnapshot
  await accountRepo.saveBalanceSnapshot('acc_1', 145000);
  const updatedAcc1 = await accountRepo.getById('acc_1');
  assert(updatedAcc1 !== null, 'acc1 deve existir após snapshot');
  assert(updatedAcc1!.currentBalance === 145000, `currentBalance deve ser 145000, encontrou ${updatedAcc1!.currentBalance}`);
  assert(updatedAcc1!.name === 'Nubank Principal', 'Nome não pode ter sido alterado');
  assert(updatedAcc1!.initialBalance === 100000, 'Saldo inicial imutável não pode ter mudado');
  assert(updatedAcc1!.bankName === 'Nubank', 'bankName deve permanecer intacto');
  assert(updatedAcc1!.color === '#820ad1', 'color deve permanecer intacto');

  await accountRepo.delete('acc_2');
  const deletedAcc2 = await accountRepo.getById('acc_2');
  assert(deletedAcc2 === null, 'acc_2 deve ter sido deletado');
  const accountsTotal = await accountRepo.count();
  assert(accountsTotal === 1, 'Deveria restar apenas 1 conta ativa');

  // Teste de exclusão lógica (tombstone) e integridade referencial (Etapa 2.5)
  await accountRepo.save({
    ...acc1,
    deleted: true,
    deletedAt: new Date().toISOString(),
    tombstoneRevision: 2,
  } as any);

  const activeAcc1 = await accountRepo.getById('acc_1');
  assert(activeAcc1 === null, 'acc_1 tombstoned não deve ser retornado por getById ativo');

  const rawAcc1 = await accountRepo.getById('acc_1', true);
  assert(rawAcc1 !== null, 'acc_1 tombstoned deve permanecer acessível internamente com includeDeleted=true');
  assert((rawAcc1 as any).deleted === true, 'Flag deleted deve ser true');

  const allActive = await accountRepo.getAll();
  assert(allActive.length === 0, 'Nenhuma conta ativa deve ser retornada após tombstone');

  const allWithDeleted = await accountRepo.getAll(true);
  assert(allWithDeleted.length >= 1, 'getAll(true) deve retornar conta tombstoned');

  const activeCount = await accountRepo.count();
  assert(activeCount === 0, 'count ativo deve ser 0');

  const totalRawCount = await accountRepo.count(true);
  assert(totalRawCount >= 1, 'count(true) deve incluir tombstoned');

  // =========================================================================
  // 3. Testes de IndexedDBCreditCardRepository
  // =========================================================================
  console.log('\n--- 3. Testando IndexedDBCreditCardRepository ---');

  const card1: CreditCard = {
    id: 'card_1',
    name: 'Cartão Black',
    bankName: 'XP Investimentos',
    color: '#1a1a1a',
    limit: 1500000,
    closingDay: 28,
    dueDay: 5,
    currentInvoice: 0,
  };

  const card2: CreditCard = {
    id: 'card_2',
    name: 'Nubank Platinum',
    bankName: 'Nubank',
    color: '#820ad1',
    limit: 500000,
    closingDay: 10,
    dueDay: 17,
    currentInvoice: 0,
  };

  // CRUD
  await cardRepo.save(card1);
  const fetchedCard1 = await cardRepo.getById('card_1');
  assert(fetchedCard1 !== null, 'card_1 deve ser encontrado');
  assert(fetchedCard1!.name === 'Cartão Black', 'Nome do cartão deve bater');
  assert(fetchedCard1!.limit === 1500000, 'Limite do cartão deve bater');

  await cardRepo.saveBatch([card2]);
  const cardCount = await cardRepo.count();
  assert(cardCount === 2, `Deveria ter 2 cartões, encontrou ${cardCount}`);

  // Validação Semântica do saveInvoiceSnapshot sem corromper atributos
  await cardRepo.saveInvoiceSnapshot('card_1', 82340);
  const updatedCard1 = await cardRepo.getById('card_1');
  assert(updatedCard1 !== null, 'card_1 deve existir');
  assert(updatedCard1!.currentInvoice === 82340, `currentInvoice snapshot deve ser 82340, encontrou ${updatedCard1!.currentInvoice}`);
  assert(updatedCard1!.limit === 1500000, 'Limite não pode ter sido alterado');
  assert(updatedCard1!.closingDay === 28, 'closingDay não pode ter sido alterado');
  assert(updatedCard1!.dueDay === 5, 'dueDay não pode ter sido alterado');
  assert(updatedCard1!.name === 'Cartão Black', 'Nome do cartão deve estar intacto');
  assert(updatedCard1!.bankName === 'XP Investimentos', 'bankName deve estar intacto');

  await cardRepo.delete('card_2');
  assert((await cardRepo.getById('card_2')) === null, 'card_2 deve ter sido deletado');
  assert((await cardRepo.count()) === 1, 'Deveria restar 1 cartão');

  // =========================================================================
  // 4. Testes de IndexedDBInvestmentRepository
  // =========================================================================
  console.log('\n--- 4. Testando IndexedDBInvestmentRepository ---');

  const asset1: InvestmentAsset = {
    id: 'ast_1',
    ticker: 'PETR4',
    name: 'Petrobras PN',
    type: 'stock',
    quantity: 100,
    averagePrice: 3200,
    currentPrice: 3800,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-09-01T10:00:00Z',
  };

  const asset2: InvestmentAsset = {
    id: 'ast_2',
    ticker: 'VALE3',
    name: 'Vale S.A.',
    type: 'stock',
    quantity: 50,
    averagePrice: 6000,
    currentPrice: 5800,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-09-02T10:00:00Z',
  };

  // Salvar ativo com campos derivados simulados para garantir que não são persistidos
  const assetWithDerived: any = {
    ...asset1,
    currentValue: 380000, // derivado
    profit: 60000,        // derivado
    profitability: 18.75, // derivado
    performance: '+18.7%', // derivado
  };
  await invRepo.saveAsset(assetWithDerived);

  const fetchedAsset1 = await invRepo.getAssetById('ast_1');
  assert(fetchedAsset1 !== null, 'ast_1 deve existir');
  assert(fetchedAsset1!.ticker === 'PETR4', 'Ticker deve ser PETR4');
  assert((fetchedAsset1 as any).currentValue === undefined, 'currentValue derivado NÃO deve ter sido gravado');
  assert((fetchedAsset1 as any).profit === undefined, 'profit derivado NÃO deve ter sido gravado');

  // Batch de ativos
  await invRepo.saveAssetsBatch([asset2]);
  const allAssets = await invRepo.getAllAssets();
  assert(allAssets.length === 2, `Deveria ter 2 ativos, encontrou ${allAssets.length}`);

  // Transações de Investimento (Ledger)
  const invTx1: InvestmentTransaction = {
    id: 'invtx_1',
    assetId: 'ast_1',
    type: 'buy',
    date: '2026-09-01',
    quantity: 100,
    price: 3200,
    totalAmount: 320000,
    createdAt: '2026-09-01T10:00:00Z',
  };

  const invTx2: InvestmentTransaction = {
    id: 'invtx_2',
    assetId: 'ast_1',
    type: 'dividend',
    date: '2026-09-15',
    quantity: 0,
    price: 0,
    totalAmount: 1500,
    createdAt: '2026-09-15T10:00:00Z',
  };

  const invTx3: InvestmentTransaction = {
    id: 'invtx_3',
    assetId: 'ast_2',
    type: 'buy',
    date: '2026-09-02',
    quantity: 50,
    price: 6000,
    totalAmount: 300000,
    createdAt: '2026-09-02T10:00:00Z',
  };

  await invRepo.saveTransaction(invTx1);
  await invRepo.saveTransactionsBatch([invTx2, invTx3]);

  const petr4Txs = await invRepo.getTransactionsByAssetId('ast_1');
  assert(petr4Txs.length === 2, `ast_1 deve possuir 2 movimentações, encontrou ${petr4Txs.length}`);

  const vale3Txs = await invRepo.getTransactionsByAssetId('ast_2');
  assert(vale3Txs.length === 1, `ast_2 deve possuir 1 movimentação, encontrou ${vale3Txs.length}`);

  // Transação Atômica: deleteAsset remove o ativo E seu histórico no ledger
  await invRepo.deleteAsset('ast_1');
  assert((await invRepo.getAssetById('ast_1')) === null, 'ast_1 deve ter sido deletado');
  const petr4TxsAfterDelete = await invRepo.getTransactionsByAssetId('ast_1');
  assert(petr4TxsAfterDelete.length === 0, 'Movimentações de ast_1 devem ter sido removidas atomicamente');
  // Ativo ast_2 e suas movimentações continuam intactos
  assert((await invRepo.getAssetById('ast_2')) !== null, 'ast_2 deve continuar existindo');
  assert((await invRepo.getTransactionsByAssetId('ast_2')).length === 1, 'Movimentações de ast_2 devem permanecer intactas');

  // =========================================================================
  // 5. Testes de IndexedDBGoalRepository
  // =========================================================================
  console.log('\n--- 5. Testando IndexedDBGoalRepository ---');

  const goal1: FinancialGoal = {
    id: 'goal_1',
    name: 'Reserva de Emergência',
    targetAmount: 3000000,
    initialAmount: 500000,
    currentAmount: 500000,
    targetDate: '2027-12-31',
    color: '#10b981',
    icon: 'shield',
  };

  const goal2: FinancialGoal = {
    id: 'goal_2',
    name: 'Viagem Japão',
    targetAmount: 2000000,
    initialAmount: 0,
    currentAmount: 0,
    targetDate: '2028-05-15',
    color: '#3b82f6',
    icon: 'plane',
  };

  await goalRepo.saveGoal(goal1);
  await goalRepo.saveGoalsBatch([goal2]);

  const allGoals = await goalRepo.getAllGoals();
  assert(allGoals.length === 2, `Deveria ter 2 metas, encontrou ${allGoals.length}`);

  const gmov1: GoalMovement = {
    id: 'gmov_1',
    goalId: 'goal_1',
    type: 'deposit',
    amount: 100000,
    date: '2026-10-01',
    createdAt: '2026-10-01T10:00:00Z',
  };

  const gmov2: GoalMovement = {
    id: 'gmov_2',
    goalId: 'goal_1',
    type: 'deposit',
    amount: 50000,
    date: '2026-10-05',
    createdAt: '2026-10-05T12:00:00Z',
  };

  const gmov3: GoalMovement = {
    id: 'gmov_3',
    goalId: 'goal_2',
    type: 'deposit',
    amount: 80000,
    date: '2026-10-06',
    createdAt: '2026-10-06T15:00:00Z',
  };

  await goalRepo.saveMovement(gmov1);
  await goalRepo.saveMovementsBatch([gmov2, gmov3]);

  const goal1Movements = await goalRepo.getMovementsByGoalId('goal_1');
  assert(goal1Movements.length === 2, `goal_1 deve conter 2 movimentos, encontrou ${goal1Movements.length}`);

  const goal2Movements = await goalRepo.getMovementsByGoalId('goal_2');
  assert(goal2Movements.length === 1, `goal_2 deve conter 1 movimento, encontrou ${goal2Movements.length}`);

  // Transação Atômica: deleteGoal remove meta e movimentos vinculados
  await goalRepo.deleteGoal('goal_1');
  assert((await goalRepo.getGoalById('goal_1')) === null, 'goal_1 deve ter sido deletado');
  const goal1MovsAfterDelete = await goalRepo.getMovementsByGoalId('goal_1');
  assert(goal1MovsAfterDelete.length === 0, 'Movimentos de goal_1 devem ser excluídos atomicamente');
  // goal_2 permanece intacto
  assert((await goalRepo.getGoalById('goal_2')) !== null, 'goal_2 deve continuar existindo');

  // =========================================================================
  // 6. Testes de IndexedDBBudgetRepository
  // =========================================================================
  console.log('\n--- 6. Testando IndexedDBBudgetRepository ---');

  const budget1: Budget = {
    id: 'bdg_1',
    categoryId: 'cat_alimentacao',
    month: '2026-10',
    limitAmount: 180000,
  };

  const budget2: Budget = {
    id: 'bdg_2',
    categoryId: 'cat_transporte',
    month: '2026-10',
    limitAmount: 50000,
  };

  const budget3: Budget = {
    id: 'bdg_3',
    categoryId: 'cat_alimentacao',
    month: '2026-11',
    limitAmount: 200000,
  };

  await budgetRepo.save(budget1);
  await budgetRepo.saveBatch([budget2, budget3]);

  // Consultas por mês
  const octBudgets = await budgetRepo.getByMonth('2026-10');
  assert(octBudgets.length === 2, `Outubro deve conter 2 orçamentos, encontrou ${octBudgets.length}`);
  const novBudgets = await budgetRepo.getByMonth('2026-11');
  assert(novBudgets.length === 1, `Novembro deve conter 1 orçamento, encontrou ${novBudgets.length}`);

  // Consultas por categoria e mês
  const octFoodBudget = await budgetRepo.getByCategoryAndMonth('cat_alimentacao', '2026-10');
  assert(octFoodBudget !== null, 'Orçamento de alimentação em 2026-10 deve existir');
  assert(octFoodBudget!.limitAmount === 180000, `Valor do orçamento deve ser 180000, encontrou ${octFoodBudget!.limitAmount}`);

  const octMissingBudget = await budgetRepo.getByCategoryAndMonth('cat_inexistente', '2026-10');
  assert(octMissingBudget === null, 'Categoria inexistente no mês deve retornar null');

  console.log('\n======================================================');
  console.log('✅ TODOS OS TESTES DOS REPOSITÓRIOS INDEXEDDB FORAM APROVADOS COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Erro durante execução dos testes:', err);
  process.exit(1);
});
