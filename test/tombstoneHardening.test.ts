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
import type { Transaction, FinancialGoal, Budget } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runTombstoneHardeningTests() {
  console.log('🧪 Iniciando testes de validação de Tombstones e Repositórios (Fase 2.1)...');

  const testDbName = `TestTombstoneDB_${Date.now()}`;
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

  const mockCloud: CloudSyncProvider = {
    name: 'MockCloudProvider',
    push: async <T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>> => ({
      success: true,
      data: item.payload,
    }),
    pull: async <T>() => [] as T[],
    delete: async () => ({ success: true }),
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
    autoProcessQueue: false,
  });

  // =========================================================================
  // 1. Teste: Transação - Registro Criado, Deletado Offline e Tombstone Visível
  // =========================================================================
  console.log('\n--- 1. Testando Ciclo de Tombstone em Transações ---');
  {
    const tx: Transaction = {
      id: 'tx_tombstone_1',
      description: 'Supermercado',
      amount: 150.0,
      type: 'expense',
      categoryId: 'cat_alimentacao',
      accountId: 'acc_1',
      paymentMethod: 'pix',
      date: '2026-10-09',
      status: 'completed',
      createdAt: '2026-10-09T10:00:00Z',
    };

    // 1.1 Criação local
    await syncService.saveTransaction(tx);
    const createdActive = await txRepo.getById('tx_tombstone_1');
    assert(createdActive !== null, 'Transação criada deve ser encontrada');
    assert(createdActive?.description === 'Supermercado', 'Descrição preservada');

    // 1.2 Deleção local (gera soft-delete tombstone)
    await syncService.deleteTransaction('tx_tombstone_1');

    // 1.3 Consulta normal da UI: deve esconder o registro deletado
    const afterDeleteNormal = await txRepo.getById('tx_tombstone_1');
    assert(afterDeleteNormal === null, 'Consulta normal (includeDeleted=false) deve retornar null');

    const allNormal = await txRepo.getAll();
    assert(!allNormal.some(t => t.id === 'tx_tombstone_1'), 'getAll normal deve esconder registro com tombstone');

    const countNormal = await txRepo.count();
    assert(countNormal === 0, 'count normal deve retornar 0');

    // 1.4 Consulta interna de sincronização: DEVE ver o tombstone com dados completos
    const tombstoned = await txRepo.getById('tx_tombstone_1', true);
    assert(tombstoned !== null, 'getById(id, true) DEVE retornar o registro tombstoned');
    assert((tombstoned as any).deleted === true, 'Propriedade deleted deve ser true');
    assert(typeof (tombstoned as any).deletedAt === 'string', 'deletedAt deve ser preenchido');
    assert(typeof (tombstoned as any).tombstoneRevision === 'number', 'tombstoneRevision deve ser numérico');

    const allWithDeleted = await txRepo.getAll(true);
    assert(allWithDeleted.some(t => t.id === 'tx_tombstone_1'), 'getAll(true) deve conter o tombstone');

    console.log('  ✅ Transação: consultas normais escondem e consulta interna de sincronização acessa tombstone.');
  }

  // =========================================================================
  // 2. Teste: Prevenção de Ressuscitação durante hydrateFromCloud()
  // =========================================================================
  console.log('\n--- 2. Testando Proteção contra Ressuscitação na Hidratação Cloud ---');
  {
    // Cenário: A nuvem envia a versão remota antiga da transação (ex: snapshot recebido de websocket ou pull)
    const remoteOldItem = {
      id: 'tx_tombstone_1',
      description: 'Supermercado',
      amount: 150.0,
      type: 'expense',
      accountId: 'acc_1',
      paymentMethod: 'pix',
      date: '2026-10-09',
      status: 'completed',
      revision: 1, // Revisão antiga na nuvem
      createdAt: '2026-10-09T10:00:00Z',
    };

    // Executa hidratação vinda da nuvem
    const hydrateResult = await syncService.hydrateFromCloud('transactions', [remoteOldItem as any]);

    assert(hydrateResult.tombstonesRespected >= 1, 'Tombstone local deve ser respeitado e impedir ressuscitação');

    // Verifica que a aplicação ainda NÃO enxerga a transação como ativa
    const activeCheck = await txRepo.getById('tx_tombstone_1', false);
    assert(activeCheck === null, 'Transação deletada offline NÃO DEVE ser ressuscitada por dados remotos antigos!');

    // Verifica que no banco o tombstone permanece ativo
    const tombstoneCheck = await txRepo.getById('tx_tombstone_1', true);
    assert((tombstoneCheck as any).deleted === true, 'Tombstone mantido com integridade no IndexedDB');

    console.log('  ✅ Hidratação Cloud: registro deletado localmente NÃO foi ressuscitado.');
  }

  // =========================================================================
  // 3. Teste: Metas (Goals) e Movimentações - Suporte a Tombstone
  // =========================================================================
  console.log('\n--- 3. Testando Ciclo de Tombstone em Metas (Goals & Movements) ---');
  {
    const goal: FinancialGoal = {
      id: 'goal_tomb_1',
      name: 'Reserva de Emergência',
      targetAmount: 10000,
      currentAmount: 2000,
      targetDate: '2026-12-31',
      color: '#10B981',
      icon: 'Target',
    };

    await goalRepo.saveGoal(goal);
    assert((await goalRepo.getGoalById('goal_tomb_1')) !== null, 'Meta criada');

    // Exclusão via repository
    await goalRepo.deleteGoal('goal_tomb_1');

    assert((await goalRepo.getGoalById('goal_tomb_1')) === null, 'Consulta normal oculta meta deletada');
    const tombstonedGoal = await goalRepo.getGoalById('goal_tomb_1', true);
    assert(tombstonedGoal !== null && (tombstonedGoal as any).deleted === true, 'getGoalById(true) retorna tombstone');

    // Hidratação com dado remoto antigo da meta
    const remoteGoal = { ...goal, revision: 1 };
    await syncService.hydrateFromCloud('goals', [remoteGoal as any]);

    assert((await goalRepo.getGoalById('goal_tomb_1', false)) === null, 'Meta NÃO deve ser ressuscitada');
    console.log('  ✅ Metas: soft-delete atômico e prevenção de ressuscitação validados.');
  }

  // =========================================================================
  // 4. Teste: Orçamentos (Budgets) - Suporte a Tombstone
  // =========================================================================
  console.log('\n--- 4. Testando Ciclo de Tombstone em Orçamentos (Budgets) ---');
  {
    const budget: Budget = {
      id: 'bdg_tomb_1',
      categoryId: 'cat_alimentacao',
      month: '2026-10',
      limitAmount: 1200,
    };

    await budgetRepo.save(budget);
    assert((await budgetRepo.getById('bdg_tomb_1')) !== null, 'Orçamento salvo');

    await budgetRepo.delete('bdg_tomb_1');

    assert((await budgetRepo.getById('bdg_tomb_1')) === null, 'Consulta normal oculta orçamento deletado');
    assert((await budgetRepo.getByMonth('2026-10')).length === 0, 'getByMonth normal oculta orçamento deletado');

    const tombstonedBudget = await budgetRepo.getById('bdg_tomb_1', true);
    assert(tombstonedBudget !== null && (tombstonedBudget as any).deleted === true, 'getById(true) retorna tombstone');
    assert((await budgetRepo.getByMonth('2026-10', true)).length === 1, 'getByMonth(true) retorna tombstone');

    // Hidratação remota
    const remoteBudget = { ...budget, revision: 1 };
    await syncService.hydrateFromCloud('budgets', [remoteBudget as any]);

    assert((await budgetRepo.getById('bdg_tomb_1', false)) === null, 'Orçamento NÃO deve ser ressuscitado');
    console.log('  ✅ Orçamentos: soft-delete e prevenção de ressuscitação validados.');
  }

  // =========================================================================
  // 5. Teste: Contas (Accounts) - Soft Delete Padrão
  // =========================================================================
  console.log('\n--- 5. Testando Soft Delete Padrão em Contas (Accounts) ---');
  {
    await accountRepo.save({
      id: 'acc_tomb_1',
      name: 'Banco Inter',
      bankName: 'Inter',
      type: 'checking',
      color: '#FF7A00',
      initialBalance: 500,
      currentBalance: 500,
      icon: 'Landmark',
    });

    await accountRepo.delete('acc_tomb_1');
    assert((await accountRepo.getById('acc_tomb_1')) === null, 'Consulta normal oculta conta');
    const tombAccount = await accountRepo.getById('acc_tomb_1', true);
    assert(tombAccount !== null && (tombAccount as any).deleted === true, 'delete padrão gera tombstone');
    console.log('  ✅ Contas: delete padrão gera tombstone e protege integridade referencial.');
  }

  console.log('\n🎉 TODOS OS TESTES DE TOMBSTONE E REPOSITÓRIOS (FASE 2.1) PASSARAM COM SUCESSO!\n');
  process.exit(0);
}

runTombstoneHardeningTests().catch(err => {
  console.error('❌ Falha nos testes de Tombstone Hardening:', err);
  process.exit(1);
});
