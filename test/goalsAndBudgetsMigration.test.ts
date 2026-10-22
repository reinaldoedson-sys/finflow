import 'fake-indexeddb/auto';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import {
  IndexedDBTransactionRepository,
  IndexedDBAccountRepository,
  IndexedDBCreditCardRepository,
  IndexedDBGoalRepository,
  IndexedDBBudgetRepository,
  IndexedDBInvestmentRepository,
} from '../src/repositories/implementations';
import { IndexedDBSyncQueueRepository } from '../src/repositories/implementations/IndexedDBSyncQueueRepository';
import { SyncQueue } from '../src/services/syncQueue';
import { ConflictResolver } from '../src/services/conflictResolver';
import { FinancialSyncService } from '../src/services/financialSyncService';
import type { CloudSyncProvider, CloudSyncResult } from '../src/services/providers/CloudSyncProvider';
import type { SyncQueueItem } from '../src/services/syncTypes';
import type { FinancialGoal, GoalMovement, Budget } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runGoalsAndBudgetsMigrationTests() {
  console.log('🧪 Iniciando testes de migração Local-First de Goals e Budgets (Fase 2.2)...');

  const testDbName = `TestGoalsBudgetsMigrationDB_${Date.now()}`;
  const testDb = new FinFlowDatabase(testDbName);

  const txRepo = new IndexedDBTransactionRepository(testDb);
  const accountRepo = new IndexedDBAccountRepository(testDb);
  const cardRepo = new IndexedDBCreditCardRepository(testDb);
  const goalRepo = new IndexedDBGoalRepository(testDb);
  const budgetRepo = new IndexedDBBudgetRepository(testDb);
  const invRepo = new IndexedDBInvestmentRepository(testDb);

  const queueRepo = new IndexedDBSyncQueueRepository(testDb);
  const queue = new SyncQueue(queueRepo, 50, 500);
  const resolver = new ConflictResolver();

  const pushedItems: SyncQueueItem[] = [];
  const deletedCloudItems: { entityName: string; entityId: string; tombstone: any }[] = [];

  const mockCloud: CloudSyncProvider = {
    name: 'MockCloudProvider',
    push: async <T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>> => {
      pushedItems.push(item);
      return { success: true, data: item.payload, serverRevision: item.revision };
    },
    pull: async <T>() => [] as T[],
    delete: async (entityName, entityId, tombstone) => {
      deletedCloudItems.push({ entityName, entityId, tombstone });
      return { success: true, serverRevision: tombstone.tombstoneRevision };
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
    autoProcessQueue: false, // Fila pausada para validar itens enfileirados offline
  });

  // =========================================================================
  // 1. Criar Goal Offline -> Repository + SyncQueue
  // =========================================================================
  console.log('\n--- 1. Testando Criar Goal Offline ---');
  {
    const goal: FinancialGoal = {
      id: 'goal_carro_novo',
      name: 'Comprar Carro Novo',
      targetAmount: 50000,
      initialAmount: 5000,
      currentAmount: 5000,
      targetDate: '2027-12-31',
      color: '#3B82F6',
      icon: 'Car',
      notes: 'Carro híbrido ou elétrico',
    };

    await syncService.saveGoal(goal);

    // 1.1 Persistido no IndexedDBGoalRepository
    const localGoal = await goalRepo.getGoalById('goal_carro_novo');
    assert(localGoal !== null, 'Goal deve ser persistido no repositório local');
    assert(localGoal?.targetAmount === 50000, 'targetAmount deve ser 50000');

    // 1.2 Enfileirado na SyncQueue
    const queueItem = await queueRepo.getById('goals_goal_carro_novo');
    assert(queueItem !== null, 'Item de criação de goal deve existir na SyncQueue');
    assert(queueItem?.action === 'create', 'Ação na fila deve ser create');
    assert(queueItem?.entityName === 'goals', 'Entidade na fila deve ser goals');
    console.log('  ✅ Goal criado offline persistido no IndexedDB e enfileirado na SyncQueue.');

    // 1.3 Sincroniza criação inicial para a nuvem
    await syncService.processQueue();
    assert(pushedItems.some(p => p.entityId === 'goal_carro_novo'), 'Criação inicial deve ter sido sincronizada');
    assert((await queue.count()) === 0, 'Fila deve estar vazia após sync da criação');
  }

  // =========================================================================
  // 2. Atualizar Goal Offline -> IndexedDB + Coalescência / Atualização na Fila
  // =========================================================================
  console.log('\n--- 2. Testando Atualizar Goal Offline ---');
  {
    const updatedGoal: FinancialGoal = {
      id: 'goal_carro_novo',
      name: 'Comprar Carro Híbrido',
      targetAmount: 60000,
      initialAmount: 5000,
      currentAmount: 8000,
      targetDate: '2028-06-30',
      color: '#2563EB',
      icon: 'Car',
    };

    await syncService.saveGoal(updatedGoal);

    // 2.1 Verifica persistência local
    const localGoal = await goalRepo.getGoalById('goal_carro_novo');
    assert(localGoal?.name === 'Comprar Carro Híbrido', 'Nome deve ser atualizado no IndexedDB');
    assert(localGoal?.targetAmount === 60000, 'targetAmount deve ser 60000');

    // 2.2 Fila de sincronização atualizada com o payload de update
    const queueItem = await queueRepo.getById('goals_goal_carro_novo');
    assert((queueItem?.payload as any)?.targetAmount === 60000, 'SyncQueue deve conter payload atualizado');
    console.log('  ✅ Goal atualizado no IndexedDB e SyncQueue consolidada.');

    // 2.3 Sincroniza update para a nuvem
    await syncService.processQueue();
    assert((await queue.count()) === 0, 'Fila limpa após sync do update');
  }

  // =========================================================================
  // 3. Excluir Goal -> Soft-Delete / Tombstone e Item delete na Fila
  // =========================================================================
  console.log('\n--- 3. Testando Excluir Goal ---');
  {
    await syncService.deleteGoal('goal_carro_novo');

    // 3.1 Consulta normal esconde
    assert((await goalRepo.getGoalById('goal_carro_novo')) === null, 'getGoalById normal deve retornar null');

    // 3.2 Consulta com includeDeleted encontra tombstone
    const tombstoneGoal = await goalRepo.getGoalById('goal_carro_novo', true);
    assert(tombstoneGoal !== null, 'getGoalById(true) deve retornar registro com tombstone');
    assert((tombstoneGoal as any).deleted === true, 'Propriedade deleted deve ser true');

    // 3.3 SyncQueue possui operação de delete
    const queueItem = await queueRepo.getById('goals_goal_carro_novo');
    assert(queueItem?.action === 'delete', 'SyncQueue deve conter operação delete');
    assert(queueItem?.tombstone?.deleted === true, 'SyncQueue deve carregar metadados do tombstone');
    console.log('  ✅ Exclusão de Goal: soft-delete gravado e operação delete enfileirada.');
  }

  // =========================================================================
  // 4. Sincronizar Depois (Disparo da Fila de Sincronização)
  // =========================================================================
  console.log('\n--- 4. Testando Sincronização da Fila com o Provedor Cloud ---');
  {
    // Executa processamento da fila
    await syncService.processQueue();

    // 4.1 Fila de sincronização esvaziada
    const remainingCount = await queue.count();
    assert(remainingCount === 0, 'Todos os itens da fila devem ser processados e removidos');

    // 4.2 Provedor Cloud recebeu a deleção com tombstone
    assert(deletedCloudItems.length >= 1, 'CloudSyncProvider deve ter recebido delete');
    const cloudDel = deletedCloudItems.find(d => d.entityId === 'goal_carro_novo');
    assert(cloudDel !== undefined, 'Delete de goal_carro_novo enviado à nuvem');
    assert(cloudDel?.tombstone?.deleted === true, 'Tombstone transmitido à nuvem');
    console.log('  ✅ Sincronização em background: itens despachados e fila limpa.');
  }

  // =========================================================================
  // 5. Criar e Excluir Budget (Orçamento) -> Validação de Tombstone
  // =========================================================================
  console.log('\n--- 5. Testando Ciclo Completo de Budget (Orçamento) ---');
  {
    const budget: Budget = {
      id: 'bdg_restaurantes_2026_10',
      categoryId: 'cat_restaurantes',
      month: '2026-10',
      limitAmount: 800,
    };

    // 5.1 Criação
    await syncService.saveBudget(budget);
    const saved = await budgetRepo.getById('bdg_restaurantes_2026_10');
    assert(saved !== null, 'Budget deve ser salvo no repositório');
    assert(saved?.limitAmount === 800, 'limitAmount deve ser 800');

    const queueBudget = await queueRepo.getById('budgets_bdg_restaurantes_2026_10');
    assert(queueBudget?.action === 'create', 'Ação na SyncQueue deve ser create');

    // Sincroniza criação para a nuvem
    await syncService.processQueue();
    assert(pushedItems.some(p => p.entityId === 'bdg_restaurantes_2026_10'), 'Criação do budget enviada à nuvem');

    // 5.2 Exclusão
    await syncService.deleteBudget('bdg_restaurantes_2026_10');
    assert((await budgetRepo.getById('bdg_restaurantes_2026_10')) === null, 'Consulta normal oculta budget deletado');

    const tombBudget = await budgetRepo.getById('bdg_restaurantes_2026_10', true);
    assert(tombBudget !== null && (tombBudget as any).deleted === true, 'getById(true) retorna tombstone');
    assert(typeof (tombBudget as any).deletedAt === 'string', 'deletedAt gravado');

    // 5.3 Processa fila para a nuvem
    await syncService.processQueue();
    const cloudBudgetDel = deletedCloudItems.find(d => d.entityId === 'bdg_restaurantes_2026_10');
    assert(cloudBudgetDel !== undefined, 'Delete de budget enviado à nuvem via soft-delete/tombstone');
    console.log('  ✅ Budget: criação, exclusão com tombstone e envio cloud validados.');
  }

  // =========================================================================
  // 6. Testando Movimentação de Metas com Dependência Causal (dependsOn)
  // =========================================================================
  console.log('\n--- 6. Testando Movimentação de Metas com Dependência Causal ---');
  {
    const goal: FinancialGoal = {
      id: 'goal_viagem',
      name: 'Viagem de Férias',
      targetAmount: 15000,
      initialAmount: 0,
      currentAmount: 1000,
      targetDate: '2027-01-15',
      color: '#10B981',
      icon: 'Plane',
    };
    await syncService.saveGoal(goal);

    const movement: GoalMovement = {
      id: 'gmov_1',
      goalId: 'goal_viagem',
      type: 'deposit',
      amount: 1000,
      date: '2026-10-09',
      createdAt: new Date().toISOString(),
      notes: 'Primeiro aporte',
    };
    await syncService.saveGoalMovement(movement);

    const qMov = await queueRepo.getById('goalMovements_gmov_1');
    assert(qMov !== null, 'Movimentação enfileirada');
    assert(
      qMov?.dependsOn?.[0]?.entityName === 'goals' && qMov?.dependsOn?.[0]?.entityId === 'goal_viagem',
      'Movimentação deve conter dependsOn causal da meta pai'
    );
    console.log('  ✅ GoalMovement: causalidade dependsOn: [{ entityName: goals, entityId }] validada.');
  }

  console.log('\n🎉 TODOS OS TESTES DA FASE 2.2 (GOALS & BUDGETS MIGRATION) PASSARAM COM SUCESSO!\n');
  process.exit(0);
}

runGoalsAndBudgetsMigrationTests().catch(err => {
  console.error('❌ Falha nos testes de migração de Goals e Budgets:', err);
  process.exit(1);
});
