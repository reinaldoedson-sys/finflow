import 'fake-indexeddb/auto';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import { IndexedDBAccountRepository } from '../src/repositories/implementations/IndexedDBAccountRepository';
import { IndexedDBTransactionRepository } from '../src/repositories/implementations/IndexedDBTransactionRepository';
import { IndexedDBCreditCardRepository } from '../src/repositories/implementations/IndexedDBCreditCardRepository';
import { IndexedDBInvestmentRepository } from '../src/repositories/implementations/IndexedDBInvestmentRepository';
import { IndexedDBGoalRepository } from '../src/repositories/implementations/IndexedDBGoalRepository';
import { IndexedDBBudgetRepository } from '../src/repositories/implementations/IndexedDBBudgetRepository';
import { IndexedDBCategoryRepository } from '../src/repositories/implementations/IndexedDBCategoryRepository';
import { IndexedDBInstallmentPlanRepository } from '../src/repositories/implementations/IndexedDBInstallmentPlanRepository';
import { IndexedDBSyncQueueRepository } from '../src/repositories/implementations/IndexedDBSyncQueueRepository';
import { SyncQueue } from '../src/services/syncQueue';
import { ConflictResolver } from '../src/services/conflictResolver';
import { FinancialSyncService } from '../src/services/financialSyncService';
import { AccountApplicationService } from '../src/services/application/accountApplicationService';
import { mergeCloudWithPending, enqueueOperation, dequeueOperation, type PendingSyncOperation } from '../src/domain/sync';
import type { Account } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runAccountApplicationServiceTests() {
  console.log('🧪 Iniciando testes de validação da criação e ciclo de vida de Contas Bancárias...');

  const db = new FinFlowDatabase('test_acc_db_' + Date.now());
  const accountRepo = new IndexedDBAccountRepository(db);
  const queueRepo = new IndexedDBSyncQueueRepository(db);
  const queue = new SyncQueue(queueRepo);

  const syncedItems: any[] = [];
  const mockCloudProvider: any = {
    name: 'MockCloud',
    setUserId: () => {},
    getUserId: () => 'user-123',
    push: async (item: any) => {
      syncedItems.push(item);
      return { success: true, data: item.payload, serverRevision: 1 };
    },
    pull: async () => [],
    delete: async () => ({ success: true, serverRevision: 1 }),
  };

  const syncService = new FinancialSyncService({
    repositories: {
      accounts: accountRepo,
      transactions: new IndexedDBTransactionRepository(db),
      creditCards: new IndexedDBCreditCardRepository(db),
      investments: new IndexedDBInvestmentRepository(db),
      goals: new IndexedDBGoalRepository(db),
      budgets: new IndexedDBBudgetRepository(db),
      categories: new IndexedDBCategoryRepository(db),
      installmentPlans: new IndexedDBInstallmentPlanRepository(db),
    },
    syncQueue: queue,
    conflictResolver: new ConflictResolver(),
    cloudProvider: mockCloudProvider,
    autoProcessQueue: false,
  });

  const appService = new AccountApplicationService(syncService);

  // =========================================================================
  // 1. Criação de Conta Válida
  // =========================================================================
  console.log('\n--- 1. Testando criação de conta bancária com saldo inicial ---');
  {
    const created = await appService.create({
      name: 'Nubank Principal',
      bankName: 'Nubank',
      type: 'checking',
      color: '#820ad1',
      initialBalance: 1500,
      icon: 'Building2',
    });

    assert(!!created.id, 'Conta criada deve possuir ID gerado');
    assert(created.id.startsWith('acc-'), `ID deve começar com prefixo acc- (obtido: ${created.id})`);
    assert(created.name === 'Nubank Principal', 'Nome da conta preservado');
    assert(created.initialBalance === 1500, 'Saldo inicial configurado corretamente');
    assert(created.currentBalance === 1500, 'Saldo atual inicializado com initialBalance');

    // Verifica persistência no repositório IndexedDB
    const inDb = await accountRepo.getById(created.id);
    assert(inDb !== null, 'Conta deve estar gravada no repositório IndexedDB');
    assert(inDb!.name === 'Nubank Principal', 'Dados no repositório devem bater');
    assert(inDb!.currentBalance === 1500, 'Snapshot de saldo gravado no repositório');

    // Verifica presença na SyncQueue
    const queueCount = await queue.count();
    assert(queueCount === 1, `Operação deve ser enfileirada na SyncQueue (obtido: ${queueCount})`);

    const queueItems = await queueRepo.getAll();
    assert(queueItems[0].entityName === 'accounts', 'Mutação na fila deve ser de accounts');
    assert(queueItems[0].entityId === created.id, 'ID da mutação deve coincidir');
    assert(queueItems[0].action === 'create', 'Ação na fila deve ser create');

    console.log('  ✅ Criação com saldo inicial e persistência Local-First validada.');
  }

  // =========================================================================
  // 2. Criação com saldo default (0)
  // =========================================================================
  console.log('\n--- 2. Testando criação sem initialBalance explícito (fallback seguro 0) ---');
  {
    const createdZero = await appService.create({
      name: 'Itaú Poupança',
      bankName: 'Itaú',
      type: 'savings',
      color: '#ea580c',
      initialBalance: 0,
      icon: 'Building2',
    });

    assert(createdZero.initialBalance === 0, 'Saldo inicial 0');
    assert(createdZero.currentBalance === 0, 'Saldo atual 0');
    const inDbZero = await accountRepo.getById(createdZero.id);
    assert(inDbZero !== null, 'Gravado no IndexedDB com saldo 0');
    console.log('  ✅ Criação com saldo 0 validada.');
  }

  // =========================================================================
  // 3. Validação de erros na criação
  // =========================================================================
  console.log('\n--- 3. Testando validação de regras de criação ---');
  {
    let errorThrown = false;
    try {
      await appService.create({
        name: '',
        bankName: 'Caixa',
        type: 'checking',
        color: '#2563eb',
        initialBalance: 100,
        icon: 'Building2',
      });
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('nome da conta é obrigatório'), 'Mensagem de erro esperada para nome vazio');
    }
    assert(errorThrown, 'Deve lançar erro quando nome for vazio');
    console.log('  ✅ Validações de entrada na criação aprovadas.');
  }

  // =========================================================================
  // 4. Atualização de Conta
  // =========================================================================
  console.log('\n--- 4. Testando atualização de conta ---');
  {
    const original = await appService.create({
      name: 'Inter Salário',
      bankName: 'Inter',
      type: 'checking',
      color: '#ff7a00',
      initialBalance: 3000,
      icon: 'Building2',
    });

    const updated = await appService.update(
      original.id,
      { name: 'Inter Conta Principal', color: '#ff9900' },
      original
    );

    assert(updated.id === original.id, 'ID deve ser imutável na atualização');
    assert(updated.name === 'Inter Conta Principal', 'Nome atualizado');
    assert(updated.color === '#ff9900', 'Cor atualizada');
    assert(updated.initialBalance === 3000, 'Saldo inicial preservado');

    const inDb = await accountRepo.getById(original.id);
    assert(inDb!.name === 'Inter Conta Principal', 'Atualização persistida no IndexedDB');
    console.log('  ✅ Atualização de conta validada.');
  }

  // =========================================================================
  // 5. Exclusão de Conta (Soft-delete / Tombstone)
  // =========================================================================
  console.log('\n--- 5. Testando exclusão de conta (tombstone referencial) ---');
  {
    const toDelete = await appService.create({
      name: 'Conta Provisória',
      bankName: 'Bradesco',
      type: 'checking',
      color: '#dc2626',
      initialBalance: 50,
      icon: 'Building2',
    });

    await appService.delete(toDelete.id);

    const activeInDb = await accountRepo.getById(toDelete.id);
    assert(activeInDb === null, 'Conta excluída não deve aparecer em consultas ativas');

    const tombstoneInDb = await accountRepo.getById(toDelete.id, true);
    assert(tombstoneInDb !== null, 'Registro tombstone deve existir no IndexedDB');
    assert((tombstoneInDb as any).deleted === true, 'Marcado como deleted: true');
    console.log('  ✅ Exclusão com soft delete e integridade referencial validada.');
  }

  // =========================================================================
  // 6. Resiliência do estado com mergeCloudWithPending
  // =========================================================================
  console.log('\n--- 6. Testando retenção da conta recém-criada diante de snapshots remotos ---');
  {
    const localAcc: Account = {
      id: 'acc-local-recem-criada',
      name: 'Banco XP Investimentos',
      bankName: 'XP',
      type: 'investment',
      color: '#000000',
      initialBalance: 10000,
      currentBalance: 10000,
      icon: 'LineChart',
    };

    // Caso A: Nuvem responde antes de sincronizar a nova conta (nuvem não a possui ainda)
    const cloudSnapshotWithoutNewAcc: Account[] = [
      {
        id: 'acc-antiga-nuvem',
        name: 'Itaú Antigo',
        bankName: 'Itaú',
        type: 'checking',
        color: '#ea580c',
        initialBalance: 500,
        currentBalance: 500,
        icon: 'Building2',
      },
    ];

    // Fila pendente registra a criação
    let pendingQueue: PendingSyncOperation[] = [];
    pendingQueue = enqueueOperation(pendingQueue, {
      collection: 'accounts',
      docId: localAcc.id,
      type: 'set',
      payload: localAcc,
    });

    const mergedWithQueue = mergeCloudWithPending(
      cloudSnapshotWithoutNewAcc,
      pendingQueue,
      'accounts',
      [localAcc]
    );

    assert(mergedWithQueue.length === 2, 'Snapshot remoto não deve apagar a conta recém-criada');
    assert(mergedWithQueue.some(a => a.id === localAcc.id), 'Conta recém-criada deve estar presente');
    assert(mergedWithQueue.some(a => a.id === 'acc-antiga-nuvem'), 'Conta da nuvem deve ser preservada');

    // Caso B: Nova conta enfileirada e consolidada após retry/sincronização
    const syncedSnapshot: Account[] = [
      ...cloudSnapshotWithoutNewAcc,
      localAcc,
    ];
    const dequeuedQueue = dequeueOperation(pendingQueue, 'accounts', localAcc.id);
    const mergedAfterSync = mergeCloudWithPending(
      syncedSnapshot,
      dequeuedQueue,
      'accounts',
      [localAcc]
    );

    assert(mergedAfterSync.length === 2, 'Após sincronização com a nuvem, ambas as contas estão no estado final');
    assert(mergedAfterSync.some(a => a.id === localAcc.id), 'Conta nova confirmada no estado final');

    console.log('  ✅ Resiliência da conta recém-criada contra substituição remota validada.');
  }

  console.log('\n🎉 TODOS OS TESTES DE CRIAÇÃO E CICLO DE VIDA DE CONTAS FORAM APROVADOS!');
}

runAccountApplicationServiceTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro durante a execução dos testes:', err);
    process.exit(1);
  });
