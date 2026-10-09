import 'fake-indexeddb/auto';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import { IndexedDBSyncQueueRepository } from '../src/repositories/implementations/IndexedDBSyncQueueRepository';
import { SyncQueue } from '../src/services/syncQueue';
import { ConflictResolver } from '../src/services/conflictResolver';
import { FinancialSyncService } from '../src/services/financialSyncService';
import {
  IndexedDBTransactionRepository,
  IndexedDBAccountRepository,
  IndexedDBCreditCardRepository,
  IndexedDBInvestmentRepository,
  IndexedDBGoalRepository,
  IndexedDBBudgetRepository,
} from '../src/repositories/implementations';
import type { CloudSyncProvider, CloudSyncResult } from '../src/services/providers/CloudSyncProvider';
import type { SyncQueueItem } from '../src/services/syncTypes';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runHardeningTests() {
  console.log('🧪 Iniciando testes de Hardening Multi-Entidade (Etapa 2.7)...');

  const testDbName = `TestHardeningDB_${Date.now()}`;
  const testDb = new FinFlowDatabase(testDbName);

  const queueRepo = new IndexedDBSyncQueueRepository(testDb);
  const queue = new SyncQueue(queueRepo, 50, 500);
  const resolver = new ConflictResolver();

  const txRepo = new IndexedDBTransactionRepository(testDb);
  const accountRepo = new IndexedDBAccountRepository(testDb);
  const cardRepo = new IndexedDBCreditCardRepository(testDb);
  const invRepo = new IndexedDBInvestmentRepository(testDb);
  const goalRepo = new IndexedDBGoalRepository(testDb);
  const budgetRepo = new IndexedDBBudgetRepository(testDb);

  const pushedItems: SyncQueueItem[] = [];
  const mockCloud: CloudSyncProvider = {
    name: 'MockCloudSyncProvider',
    async push(item: SyncQueueItem): Promise<CloudSyncResult> {
      pushedItems.push(item);
      return { success: true };
    },
    async pull() {
      return [];
    },
    async delete() {
      return { success: true };
    },
  };

  const syncService = new FinancialSyncService({
    repositories: {
      transactions: txRepo,
      accounts: accountRepo,
      creditCards: cardRepo,
      investments: invRepo,
      goals: goalRepo,
      budgets: budgetRepo,
    },
    syncQueue: queue,
    conflictResolver: resolver,
    cloudProvider: mockCloud,
    database: testDb,
  });

  // =========================================================================
  // 1. Teste: Detecção de Dependência Circular
  // =========================================================================
  console.log('\n--- 1. Testando Detecção de Dependência Circular ---');

  // Caso 1.1: Auto-dependência (A depende de si mesma)
  let threwSelfDep = false;
  try {
    await queue.enqueue({
      operationId: 'op_self_1',
      entityName: 'transactions',
      entityId: 'tx_loop_1',
      action: 'create',
      dependsOn: [{ entityName: 'transactions', entityId: 'tx_loop_1' }],
    });
  } catch (err: any) {
    threwSelfDep = true;
    assert(err.message.includes('cannot depend on itself'), 'Mensagem de auto-dependência esperada');
  }
  assert(threwSelfDep, 'Deve lançar erro quando entidade depende de si mesma');

  // Caso 1.2: Dependência circular indireta (A depende de B, B depende de A)
  await queue.enqueue({
    operationId: 'op_cycle_a',
    entityName: 'accounts',
    entityId: 'acc_cycle_a',
    action: 'create',
    dependsOn: [{ entityName: 'accounts', entityId: 'acc_cycle_b' }],
  });

  let threwGraphCycle = false;
  try {
    await queue.enqueue({
      operationId: 'op_cycle_b',
      entityName: 'accounts',
      entityId: 'acc_cycle_b',
      action: 'create',
      dependsOn: [{ entityName: 'accounts', entityId: 'acc_cycle_a' }],
    });
  } catch (err: any) {
    threwGraphCycle = true;
    assert(err.message.includes('Circular dependency detected'), 'Mensagem de ciclo esperada');
  }
  assert(threwGraphCycle, 'Deve lançar erro ao detectar dependência circular indireta');

  // Limpa fila após testes de ciclo
  await queue.clear();

  // =========================================================================
  // 2. Teste: Account → Transaction Dependency (Bloqueio Causal)
  // =========================================================================
  console.log('\n--- 2. Testando Account → Transaction Dependency ---');

  // Cria conta
  await syncService.saveAccount({
    id: 'acc_parent_1',
    name: 'Conta Corrente Principal',
    type: 'checking',
    bankName: 'Itaú',
    color: '#ec7000',
    initialBalance: 100000,
    currentBalance: 100000,
    icon: 'wallet',
  });

  // Cria transação vinculada à conta
  await syncService.saveTransaction({
    id: 'tx_child_1',
    description: 'Compra Mercado',
    amount: 15000,
    type: 'expense',
    categoryId: 'cat_mercado',
    accountId: 'acc_parent_1',
    paymentMethod: 'pix',
    date: '2026-10-08',
    status: 'completed',
    createdAt: '2026-10-08T10:00:00Z',
  });

  // Simula que a conta falhou e entrou em backoff
  const accountQueueId = 'accounts_acc_parent_1';
  await queue.recordFailure(accountQueueId, 'Falha transitória de rede');

  // Consulta o próximo batch elegível: a conta está em backoff e a transação depende da conta
  const eligibleBatchWhileBlocked = await queue.getNextEligibleBatch();
  assert(
    eligibleBatchWhileBlocked.length === 0,
    'Transação filha NÃO pode ser elegível enquanto a conta pai estiver pendente/bloqueada'
  );

  // Simula restabelecimento da conta com sucesso
  await queue.dequeue(accountQueueId);

  // Agora que a conta pai foi confirmada (removida da fila), a transação filha deve ser liberada
  const eligibleBatchAfterParentSuccess = await queue.getNextEligibleBatch();
  assert(
    eligibleBatchAfterParentSuccess.length === 1,
    'Transação filha deve ser liberada após conclusão da conta pai'
  );
  assert(
    eligibleBatchAfterParentSuccess[0].entityId === 'tx_child_1',
    'Item liberado deve ser tx_child_1'
  );

  await queue.clear();

  // =========================================================================
  // 3. Teste: CreditCard → Transaction Dependency (Bloqueio Causal)
  // =========================================================================
  console.log('\n--- 3. Testando CreditCard → Transaction Dependency ---');

  await syncService.saveCreditCard({
    id: 'card_parent_1',
    name: 'Cartão Platinum',
    bankName: 'Bradesco',
    color: '#cc092f',
    limit: 500000,
    closingDay: 5,
    dueDay: 12,
    currentInvoice: 0,
  });

  await syncService.saveTransaction({
    id: 'tx_card_child_1',
    description: 'Restaurante',
    amount: 8500,
    type: 'expense',
    categoryId: 'cat_alimentacao',
    accountId: 'acc_parent_1',
    creditCardId: 'card_parent_1',
    paymentMethod: 'credit_card',
    date: '2026-10-08',
    status: 'completed',
    createdAt: '2026-10-08T12:00:00Z',
  });

  // Coloca o cartão pai em falha com backoff
  const cardQueueId = 'creditCards_card_parent_1';
  await queue.recordFailure(cardQueueId, 'Timeout no gateway');

  const cardBatchBlocked = await queue.getNextEligibleBatch();
  assert(
    cardBatchBlocked.length === 0,
    'Transação de cartão NÃO pode ser processada enquanto cartão pai estiver em backoff'
  );

  // Conclui o cartão com sucesso
  await queue.dequeue(cardQueueId);

  const cardBatchReleased = await queue.getNextEligibleBatch();
  assert(
    cardBatchReleased.length === 1,
    'Transação de cartão deve ser liberada após conclusão do cartão'
  );
  assert(
    cardBatchReleased[0].entityId === 'tx_card_child_1',
    'Item liberado deve ser a compra no cartão'
  );

  await queue.clear();

  // =========================================================================
  // 4. Teste: correlationId Preservado e Propagado
  // =========================================================================
  console.log('\n--- 4. Testando Preservação de correlationId ---');

  const testCorrelationId = 'corr_multistep_aporte_999';

  await syncService.saveAccount(
    {
      id: 'acc_corr_1',
      name: 'Conta Investimento',
      type: 'investment',
      bankName: 'BTG',
      color: '#002060',
      initialBalance: 500000,
      currentBalance: 500000,
      icon: 'briefcase',
    },
    { correlationId: testCorrelationId }
  );

  await syncService.saveTransaction(
    {
      id: 'tx_corr_1',
      description: 'Débito para Aporte',
      amount: 200000,
      type: 'expense',
      categoryId: 'cat_investimentos',
      accountId: 'acc_corr_1',
      paymentMethod: 'transfer',
      date: '2026-10-08',
      status: 'completed',
      createdAt: '2026-10-08T14:00:00Z',
    },
    { correlationId: testCorrelationId }
  );

  const queuedItems = await queue.getAll();
  const accItem = queuedItems.find(i => i.entityId === 'acc_corr_1');
  const txItem = queuedItems.find(i => i.entityId === 'tx_corr_1');

  assert(accItem !== undefined, 'Item da conta deve estar na fila');
  assert(accItem!.correlationId === testCorrelationId, 'correlationId da conta deve ser preservado');
  assert(txItem !== undefined, 'Item da transação deve estar na fila');
  assert(txItem!.correlationId === testCorrelationId, 'correlationId da transação deve ser preservado');

  await queue.clear();

  // =========================================================================
  // 5. Teste: Bootstrap Cloud → IndexedDB & Hydrate sem SyncQueue (Anti-Echo)
  // =========================================================================
  console.log('\n--- 5. Testando Bootstrap Cloud → IndexedDB e Prevenção de Eco ---');

  // Repositório limpo
  await accountRepo.clear();
  await cardRepo.clear();
  await txRepo.clear();
  assert((await accountRepo.count()) === 0, 'Repositório de contas deve estar vazio antes da hidratação');
  assert((await queue.count()) === 0, 'Fila deve estar vazia antes da hidratação');

  // Lote de documentos simulando chegada do Firestore
  const cloudAccounts = [
    {
      id: 'acc_cloud_1',
      name: 'Conta NuBank Cloud',
      type: 'checking' as const,
      bankName: 'Nubank',
      color: '#820ad1',
      initialBalance: 75000,
      currentBalance: 75000,
      icon: 'wallet',
      revision: 1,
    },
    {
      id: 'acc_cloud_2',
      name: 'Reserva Emergência Cloud',
      type: 'savings' as const,
      bankName: 'Inter',
      color: '#ff7a00',
      initialBalance: 300000,
      currentBalance: 300000,
      icon: 'shield',
      revision: 1,
    },
  ];

  const cloudCards = [
    {
      id: 'card_cloud_1',
      name: 'Mastercard Black Cloud',
      bankName: 'XP',
      color: '#1a1a1a',
      limit: 2000000,
      closingDay: 25,
      dueDay: 3,
      currentInvoice: 0,
      revision: 1,
    },
  ];

  // Executa hidratação
  const accHydrateRes = await syncService.hydrateFromCloud('accounts', cloudAccounts);
  assert(accHydrateRes.persisted === 2, '2 contas devem ser persistidas');

  const cardHydrateRes = await syncService.hydrateFromCloud('creditCards', cloudCards);
  assert(cardHydrateRes.persisted === 1, '1 cartão deve ser persistido');

  // Verifica persistência real no IndexedDB
  const localAcc1 = await accountRepo.getById('acc_cloud_1');
  assert(localAcc1 !== null, 'Conta 1 deve existir no IndexedDB após hidratação');
  assert(localAcc1!.name === 'Conta NuBank Cloud', 'Nome da conta hidratada deve bater');

  const localCard1 = await cardRepo.getById('card_cloud_1');
  assert(localCard1 !== null, 'Cartão deve existir no IndexedDB após hidratação');
  assert(localCard1!.limit === 2000000, 'Limite do cartão hidratado deve bater');

  // Validação crítica de ANTI-ECHO: a SyncQueue NÃO pode receber nenhum item
  const queueCountAfterHydrate = await queue.count();
  assert(
    queueCountAfterHydrate === 0,
    `Anti-Echo Falhou! SyncQueue deveria ter 0 itens após hidratação, encontrou: ${queueCountAfterHydrate}`
  );

  // =========================================================================
  // 6. Teste: Tombstone Local contra Remoto Antigo
  // =========================================================================
  console.log('\n--- 6. Testando Tombstone Local contra Dado Remoto Antigo ---');

  // Cria tombstone local com revisão 3
  await accountRepo.save({
    id: 'acc_tombstone_test',
    name: 'Conta Excluída Localmente',
    type: 'checking',
    bankName: 'Banco Antigo',
    color: '#999999',
    initialBalance: 0,
    currentBalance: 0,
    icon: 'archive',
    deleted: true,
    deletedAt: '2026-10-08T15:00:00Z',
    tombstoneRevision: 3,
    revision: 3,
  } as any);

  // Nuvem envia um documento antigo ativo com revisão 1
  const staleCloudAccount = {
    id: 'acc_tombstone_test',
    name: 'Conta Ativa Antiga da Nuvem',
    type: 'checking' as const,
    bankName: 'Banco Antigo',
    color: '#999999',
    initialBalance: 10000,
    currentBalance: 10000,
    icon: 'archive',
    revision: 1,
  };

  const tombstoneHydrateRes = await syncService.hydrateFromCloud('accounts', [staleCloudAccount]);
  assert(
    tombstoneHydrateRes.tombstonesRespected === 1,
    'Deve respeitar o tombstone local e rejeitar ressuscitação da nuvem'
  );

  // Confirma que a conta continua deletada no IndexedDB
  const activeLookup = await accountRepo.getById('acc_tombstone_test');
  assert(activeLookup === null, 'Conta tombstoned NÃO deve aparecer em busca ativa');

  const rawLookup = await accountRepo.getById('acc_tombstone_test', true);
  assert(rawLookup !== null, 'Registro de tombstone deve ser mantido');
  assert((rawLookup as any).deleted === true, 'Flag deleted deve continuar true');

  // Garante que o tombstone também não gerou eco na fila
  assert((await queue.count()) === 0, 'Fila deve continuar vazia');

  console.log('\n======================================================');
  console.log('✅ TODOS OS TESTES DE HARDENING MULTI-ENTIDADE FORAM APROVADOS!');
  console.log('======================================================');
}

runHardeningTests().catch(err => {
  console.error('❌ Erro durante execução dos testes de hardening:', err);
  process.exit(1);
});
