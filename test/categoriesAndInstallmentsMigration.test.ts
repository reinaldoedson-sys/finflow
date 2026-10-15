import 'fake-indexeddb/auto';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import {
  IndexedDBTransactionRepository,
  IndexedDBAccountRepository,
  IndexedDBCreditCardRepository,
  IndexedDBGoalRepository,
  IndexedDBBudgetRepository,
  IndexedDBInvestmentRepository,
  IndexedDBCategoryRepository,
  IndexedDBInstallmentPlanRepository,
} from '../src/repositories/implementations';
import { IndexedDBSyncQueueRepository } from '../src/repositories/implementations/IndexedDBSyncQueueRepository';
import { SyncQueue } from '../src/services/syncQueue';
import { ConflictResolver } from '../src/services/conflictResolver';
import { FinancialSyncService } from '../src/services/financialSyncService';
import type { CloudSyncProvider, CloudSyncResult } from '../src/services/providers/CloudSyncProvider';
import type { SyncQueueItem } from '../src/services/syncTypes';
import type { Category, InstallmentPlan } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runCategoriesAndInstallmentsMigrationTests() {
  console.log('🧪 Iniciando testes de migração Local-First de Categories e InstallmentPlans (Fase 2.3)...');

  const testDbName = `TestCatInstMigrationDB_${Date.now()}`;
  const testDb = new FinFlowDatabase(testDbName);

  const txRepo = new IndexedDBTransactionRepository(testDb);
  const accountRepo = new IndexedDBAccountRepository(testDb);
  const cardRepo = new IndexedDBCreditCardRepository(testDb);
  const goalRepo = new IndexedDBGoalRepository(testDb);
  const budgetRepo = new IndexedDBBudgetRepository(testDb);
  const invRepo = new IndexedDBInvestmentRepository(testDb);
  const catRepo = new IndexedDBCategoryRepository(testDb);
  const planRepo = new IndexedDBInstallmentPlanRepository(testDb);

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
      categories: catRepo,
      installmentPlans: planRepo,
    },
    syncQueue: queue,
    conflictResolver: resolver,
    cloudProvider: mockCloud,
    autoProcessQueue: false, // Fila pausada para validar itens enfileirados offline
  });

  // =========================================================================
  // 1. Category CRUD Offline -> Repository + SyncQueue
  // =========================================================================
  console.log('\n--- 1. Testando Criar e Atualizar Categoria Offline ---');
  {
    const category: Category = {
      id: 'cat_educacao',
      name: 'Educação e Cursos',
      icon: 'GraduationCap',
      color: '#8B5CF6',
      type: 'expense',
    };

    await syncService.saveCategory(category);

    // 1.1 Persistido no IndexedDBCategoryRepository
    const localCat = await catRepo.getById('cat_educacao');
    assert(localCat !== null, 'Categoria deve ser persistida no repositório local');
    assert(localCat?.name === 'Educação e Cursos', 'Nome da categoria deve conferir');

    // 1.2 Enfileirado na SyncQueue
    const queueItem = await queueRepo.getById('categories_cat_educacao');
    assert(queueItem !== null, 'Item de criação da categoria deve existir na SyncQueue');
    assert(queueItem?.action === 'create', 'Ação na fila deve ser create');
    assert(queueItem?.entityName === 'categories', 'entityName deve ser categories');

    // 1.3 getByType funciona
    const expenseCats = await catRepo.getByType('expense');
    assert(expenseCats.some(c => c.id === 'cat_educacao'), 'getByType deve retornar a categoria');

    // 1.4 Atualizar Categoria Offline
    const updatedCat: Category = {
      ...category,
      name: 'Educação Continuada',
      color: '#7C3AED',
    };

    await syncService.saveCategory(updatedCat);
    const localUpdated = await catRepo.getById('cat_educacao');
    assert(localUpdated?.name === 'Educação Continuada', 'Categoria deve ser atualizada localmente');

    console.log('✅ 1. Criação e atualização de Categoria offline validadas.');
  }

  // =========================================================================
  // 2. Sincronização de Categoria (Cloud Push & Hydrate)
  // =========================================================================
  console.log('\n--- 2. Testando Sincronização de Categoria ---');
  {
    assert(pushedItems.length === 0, 'Nenhum push deve ter ocorrido antes de processQueue');

    await syncService.processQueue();

    assert(pushedItems.length > 0, 'Item da categoria deve ter sido enviado para a nuvem');
    const pushedCat = pushedItems.find(p => p.entityId === 'cat_educacao');
    assert(pushedCat !== undefined, 'Categoria educacao deve ter sido enviada');
    assert((pushedCat?.payload as any)?.name === 'Educação Continuada', 'Payload enviado deve estar atualizado');

    // Fila deve estar vazia após sucesso
    const remainingInQueue = await queue.count();
    assert(remainingInQueue === 0, 'Fila deve estar vazia após processamento bem-sucedido');

    // Testar hydrateFromCloud
    const remoteCategory: Category = {
      id: 'cat_saude_cloud',
      name: 'Saúde & Farmácia',
      icon: 'Heart',
      color: '#EF4444',
      type: 'expense',
    };

    const hydrateResult = await syncService.hydrateFromCloud('categories', [remoteCategory]);
    assert(hydrateResult.persisted === 1, 'Categoria remota deve ser persistida via hydrateFromCloud');

    const hydratedLocal = await catRepo.getById('cat_saude_cloud');
    assert(hydratedLocal !== null, 'Categoria hidratada da nuvem deve existir no IndexedDB');
    assert(hydratedLocal?.name === 'Saúde & Farmácia', 'Nome da categoria hidratada deve ser idêntico');

    console.log('✅ 2. Sincronização e hidratação de Categoria validadas.');
  }

  // =========================================================================
  // 3. Exclusão de Categoria com Tombstone
  // =========================================================================
  console.log('\n--- 3. Testando Exclusão de Categoria com Tombstone ---');
  {
    await syncService.deleteCategory('cat_educacao');

    // 3.1 Consulta normal esconde registro deletado
    const activeCat = await catRepo.getById('cat_educacao');
    assert(activeCat === null, 'Consulta normal getById deve retornar null para registro com tombstone');

    const allActive = await catRepo.getAll();
    assert(!allActive.some(c => c.id === 'cat_educacao'), 'getAll normal não deve listar categoria deletada');

    // 3.2 Consulta com includeDeleted=true revela tombstone
    const tombstoneCat = await catRepo.getById('cat_educacao', true);
    assert(tombstoneCat !== null, 'getById com includeDeleted=true deve retornar a categoria com tombstone');
    assert((tombstoneCat as any).deleted === true, 'Flag deleted deve ser true');
    assert(typeof (tombstoneCat as any).deletedAt === 'string', 'deletedAt deve ser timestamp ISO');
    assert((tombstoneCat as any).tombstoneRevision >= 2, 'tombstoneRevision deve ser incrementada');

    // 3.3 Enfileirado na SyncQueue como delete com tombstone
    const deleteQueueItem = await queueRepo.getById('categories_cat_educacao');
    assert(deleteQueueItem !== null, 'Item de delete deve existir na fila');
    assert(deleteQueueItem?.action === 'delete', 'Ação deve ser delete');
    assert(deleteQueueItem?.tombstone?.deleted === true, 'Metadados de tombstone devem estar presentes');

    // 3.4 Sincronizar exclusão com a nuvem
    await syncService.processQueue();
    assert(deletedCloudItems.some(d => d.entityId === 'cat_educacao'), 'cloud.delete deve ser acionado com tombstone');

    // 3.5 Teste Anti-Ressuscitação via ConflictResolver
    const resurrectedRemote: Category = {
      id: 'cat_educacao',
      name: 'Educação e Cursos (Tentativa Nuvem)',
      icon: 'GraduationCap',
      color: '#8B5CF6',
      type: 'expense',
    };
    (resurrectedRemote as any).revision = 1;

    const conflictRes = resolver.resolve('categories', tombstoneCat, resurrectedRemote);
    assert(conflictRes.action === 'mark_deleted', 'ConflictResolver deve impedir ressuscitação de categoria com tombstone');

    console.log('✅ 3. Exclusão com Tombstone e Anti-Ressuscitação de Categoria validadas.');
  }

  // =========================================================================
  // 4. InstallmentPlan Criar Offline -> Repository + SyncQueue
  // =========================================================================
  console.log('\n--- 4. Testando Criar InstallmentPlan Offline ---');
  {
    const plan: InstallmentPlan = {
      id: 'plan_notebook_gamer',
      description: 'Notebook Gamer Dell',
      totalAmount: 6000,
      installmentAmount: 600,
      totalInstallments: 10,
      type: 'expense',
      categoryId: 'cat-compras',
      accountId: 'acc_itau_principal',
      creditCardId: 'card_nubank_roxo',
      paymentMethod: 'credit_card',
      startDate: '2026-11-01',
      createdAt: new Date().toISOString(),
    };

    await syncService.saveInstallmentPlan(plan);

    // 4.1 Persistido no IndexedDBInstallmentPlanRepository
    const localPlan = await planRepo.getById('plan_notebook_gamer');
    assert(localPlan !== null, 'Parcelamento deve estar no repositório');
    assert(localPlan?.totalAmount === 6000, 'totalAmount deve ser 6000');
    assert(localPlan?.totalInstallments === 10, 'totalInstallments deve ser 10');

    // 4.2 Consultas especializadas
    const accountPlans = await planRepo.getByAccountId('acc_itau_principal');
    assert(accountPlans.some(p => p.id === 'plan_notebook_gamer'), 'getByAccountId deve retornar o plano');

    const cardPlans = await planRepo.getByCreditCardId('card_nubank_roxo');
    assert(cardPlans.some(p => p.id === 'plan_notebook_gamer'), 'getByCreditCardId deve retornar o plano');

    // 4.3 Enfileirado na SyncQueue com dependências causais de conta e cartão
    const queueItem = await queueRepo.getById('installmentPlans_plan_notebook_gamer');
    assert(queueItem !== null, 'Item deve existir na SyncQueue');
    assert(queueItem?.action === 'create', 'Ação deve ser create');
    assert(queueItem?.entityName === 'installmentPlans', 'entityName deve ser installmentPlans');
    assert(queueItem?.dependsOn !== undefined, 'dependsOn causal deve ser configurado');
    assert(queueItem?.dependsOn?.some(d => d.entityName === 'accounts' && d.entityId === 'acc_itau_principal') === true, 'Deve depender da conta');
    assert(queueItem?.dependsOn?.some(d => d.entityName === 'creditCards' && d.entityId === 'card_nubank_roxo') === true, 'Deve depender do cartão');

    console.log('✅ 4. Criação de InstallmentPlan offline e dependências causais validadas.');
  }

  // =========================================================================
  // 5. Sincronização de InstallmentPlan (Push & Hydrate)
  // =========================================================================
  console.log('\n--- 5. Testando Sincronização de InstallmentPlan ---');
  {
    await syncService.processQueue();

    const pushedPlan = pushedItems.find(p => p.entityId === 'plan_notebook_gamer');
    assert(pushedPlan !== undefined, 'InstallmentPlan deve ter sido enviado para a nuvem');
    assert((pushedPlan?.payload as any)?.totalAmount === 6000, 'Payload do plano deve conferir');

    // Testar hydrateFromCloud
    const remotePlan: InstallmentPlan = {
      id: 'plan_smartphone_cloud',
      description: 'Smartphone Galaxy S24',
      totalAmount: 4500,
      installmentAmount: 450,
      totalInstallments: 10,
      type: 'expense',
      categoryId: 'cat-eletronicos',
      accountId: 'acc_bradesco',
      paymentMethod: 'pix',
      startDate: '2026-12-01',
      createdAt: new Date().toISOString(),
    };

    const hydrateResult = await syncService.hydrateFromCloud('installmentPlans', [remotePlan]);
    assert(hydrateResult.persisted === 1, 'hydrateFromCloud deve persistir o plano remoto');

    const hydratedLocal = await planRepo.getById('plan_smartphone_cloud');
    assert(hydratedLocal !== null, 'Plano remoto deve existir no repositório');
    assert(hydratedLocal?.description === 'Smartphone Galaxy S24', 'Descrição deve conferir');

    console.log('✅ 5. Sincronização e hidratação de InstallmentPlan validadas.');
  }

  // =========================================================================
  // 6. Exclusão de InstallmentPlan com Tombstone
  // =========================================================================
  console.log('\n--- 6. Testando Exclusão de InstallmentPlan com Tombstone ---');
  {
    await syncService.deleteInstallmentPlan('plan_notebook_gamer');

    // 6.1 Consulta normal esconde
    const activePlan = await planRepo.getById('plan_notebook_gamer');
    assert(activePlan === null, 'getById normal deve retornar null para plano deletado');

    const allActive = await planRepo.getAll();
    assert(!allActive.some(p => p.id === 'plan_notebook_gamer'), 'getAll não deve conter plano deletado');

    // 6.2 Consulta com includeDeleted=true revela tombstone
    const tombstonePlan = await planRepo.getById('plan_notebook_gamer', true);
    assert(tombstonePlan !== null, 'getById com includeDeleted=true deve retornar tombstone');
    assert((tombstonePlan as any).deleted === true, 'Flag deleted deve ser true');
    assert(typeof (tombstonePlan as any).deletedAt === 'string', 'deletedAt deve ser preenchido');
    assert((tombstonePlan as any).tombstoneRevision >= 2, 'tombstoneRevision deve ser incrementada');

    // 6.3 Enfileirado na SyncQueue
    const deleteQueueItem = await queueRepo.getById('installmentPlans_plan_notebook_gamer');
    assert(deleteQueueItem !== null, 'Item de delete deve existir na SyncQueue');
    assert(deleteQueueItem?.action === 'delete', 'Ação deve ser delete');
    assert(deleteQueueItem?.tombstone?.deleted === true, 'Metadados de tombstone devem estar no item');

    // 6.4 Enviar delete para a nuvem
    await syncService.processQueue();
    assert(deletedCloudItems.some(d => d.entityId === 'plan_notebook_gamer'), 'cloud.delete deve ser chamado');

    // 6.5 ConflictResolver impede ressuscitação de InstallmentPlan
    const resurrectedRemote: InstallmentPlan = {
      id: 'plan_notebook_gamer',
      description: 'Notebook Gamer Dell (Tentativa Nuvem)',
      totalAmount: 6000,
      installmentAmount: 600,
      totalInstallments: 10,
      type: 'expense',
      categoryId: 'cat-compras',
      accountId: 'acc_itau_principal',
      paymentMethod: 'credit_card',
      startDate: '2026-11-01',
      createdAt: new Date().toISOString(),
    };
    (resurrectedRemote as any).revision = 1;

    const conflictRes = resolver.resolve('installmentPlans', tombstonePlan, resurrectedRemote);
    assert(conflictRes.action === 'mark_deleted', 'ConflictResolver deve impedir ressuscitação de parcelamento deletado');

    console.log('✅ 6. Exclusão com Tombstone e Anti-Ressuscitação de InstallmentPlan validadas.');
  }

  console.log('\n🎉 TODOS OS TESTES DA FASE 2.3 PASSARAM COM SUCESSO!\n');
  process.exit(0);
}

runCategoriesAndInstallmentsMigrationTests().catch(err => {
  console.error('\n❌ ERRO NOS TESTES DA FASE 2.3:', err);
  process.exit(1);
});
