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
import type { SyncQueueItem, TombstoneMetadata } from '../src/services/syncTypes';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes unitários de FinancialSyncService, SyncQueue e ConflictResolver (Etapa 2.3)...');

  const testDbName = `TestSyncServiceDB_${Date.now()}`;
  const testDb = new FinFlowDatabase(testDbName);

  const queueRepo = new IndexedDBSyncQueueRepository(testDb);
  const queue = new SyncQueue(queueRepo, 50, 500); // delays baixos para execução rápida dos testes
  const resolver = new ConflictResolver();

  // =========================================================================
  // 1. Testes de SyncQueue (Regras de Negócio e Coalescência)
  // =========================================================================
  console.log('\n--- 1. Testando SyncQueue ---');

  // Teste 1.1: create + update -> consolida em 'create' com payload fundido
  console.log('  -> Testando regra: create + update...');
  const opCreate1 = await queue.enqueue({
    operationId: 'op_1',
    entityName: 'transactions',
    entityId: 'tx_100',
    action: 'create',
    payload: { id: 'tx_100', description: 'Mercado', amount: 100 },
    revision: 1,
  });
  assert(opCreate1 !== null, 'Item inicial create deve ser enfileirado');
  assert(opCreate1!.action === 'create', 'Ação deve ser create');

  const opUpdate1 = await queue.enqueue({
    operationId: 'op_2',
    entityName: 'transactions',
    entityId: 'tx_100',
    action: 'update',
    payload: { amount: 120, notes: 'Comprado com cupom' },
    revision: 2,
  });
  assert(opUpdate1 !== null, 'Item consolidado deve existir');
  assert(opUpdate1!.action === 'create', 'Ação consolidada deve permanecer "create"');
  assert((opUpdate1!.payload as any)?.amount === 120, 'Payload deve ter amount = 120');
  assert((opUpdate1!.payload as any)?.description === 'Mercado', 'Payload deve manter description = Mercado');
  assert((opUpdate1!.payload as any)?.notes === 'Comprado com cupom', 'Payload deve incluir notes');
  assert(opUpdate1!.revision >= 2, 'Revisão deve ter sido incrementada');

  const countAfterCreateUpdate = await queue.count();
  assert(countAfterCreateUpdate === 1, `Deveria ter apenas 1 item consolidado na fila, tem ${countAfterCreateUpdate}`);

  // Teste 1.2: create + delete -> descarta da fila (item nunca foi pra nuvem)
  console.log('  -> Testando regra: create + delete...');
  await queue.enqueue({
    operationId: 'op_temp_create',
    entityName: 'transactions',
    entityId: 'tx_temp',
    action: 'create',
    payload: { id: 'tx_temp', amount: 50 },
  });
  assert((await queue.count()) === 2, 'Deveria ter 2 itens antes do delete');

  const opDeleteTemp = await queue.enqueue({
    operationId: 'op_temp_del',
    entityName: 'transactions',
    entityId: 'tx_temp',
    action: 'delete',
  });
  assert(opDeleteTemp === null, 'create + delete deve descartar o item e retornar null');
  assert((await queue.count()) === 1, 'Item efêmero deve sumir da fila');

  // Teste 1.3: update + update -> funde payloads
  console.log('  -> Testando regra: update + update...');
  // Simula um item que já existia na nuvem e recebe um update local
  await queue.enqueue({
    operationId: 'op_acc_up1',
    entityName: 'accounts',
    entityId: 'acc_1',
    action: 'update',
    payload: { name: 'Conta Principal' },
    revision: 2,
  });

  const opAccUp2 = await queue.enqueue({
    operationId: 'op_acc_up2',
    entityName: 'accounts',
    entityId: 'acc_1',
    action: 'update',
    payload: { color: '#820ad1', bankName: 'Nubank' },
    revision: 3,
  });

  assert(opAccUp2 !== null, 'Item após segundo update deve existir');
  assert(opAccUp2!.action === 'update', 'Ação deve continuar "update"');
  assert((opAccUp2!.payload as any)?.name === 'Conta Principal', 'Nome do primeiro update deve ser preservado');
  assert((opAccUp2!.payload as any)?.color === '#820ad1', 'Cor do segundo update deve ser preservada');

  // Teste 1.4: update + delete -> transforma em 'delete' com tombstone
  console.log('  -> Testando regra: update + delete...');
  const opAccDelete = await queue.enqueue({
    operationId: 'op_acc_del',
    entityName: 'accounts',
    entityId: 'acc_1',
    action: 'delete',
  });
  assert(opAccDelete !== null, 'Item com tombstone deve existir');
  assert(opAccDelete!.action === 'delete', 'Ação deve ter sido convertida para delete');
  assert(opAccDelete!.tombstone !== undefined, 'Tombstone deve ser gerado');
  assert(opAccDelete!.tombstone!.deleted === true, 'tombstone.deleted deve ser true');

  // Teste 1.5: Idempotência com operationId
  console.log('  -> Testando idempotência de operationId...');
  const duplicateEnqueue = await queue.enqueue({
    operationId: 'op_acc_del', // mesma chave
    entityName: 'accounts',
    entityId: 'acc_1',
    action: 'delete',
  });
  assert(duplicateEnqueue === null || duplicateEnqueue.operationId === 'op_acc_del', 'Mesma operação não deve ser duplicada');

  // Teste 1.6: Retry e Exponential Backoff
  console.log('  -> Testando retry e exponential backoff...');
  const beforeFailure = Date.now();
  const failedItem = await queue.recordFailure('transactions_tx_100', 'Network Timeout');
  assert(failedItem !== null, 'Item falho deve ser retornado');
  assert(failedItem!.retries === 1, 'retries deve ser 1');
  assert(failedItem!.nextRetryAt !== undefined, 'nextRetryAt deve ser agendado');
  assert(failedItem!.nextRetryAt! >= beforeFailure + 40, 'nextRetryAt deve respeitar o backoff');
  assert(failedItem!.lastError === 'Network Timeout', 'lastError deve ser salvo');

  // =========================================================================
  // 2. Testes de ConflictResolver
  // =========================================================================
  console.log('\n--- 2. Testando ConflictResolver ---');

  // Teste 2.1: Conflito de Transaction (Ledger inviolável)
  console.log('  -> Testando conflito de transação (ledger inviolável)...');
  const localTx = {
    id: 'tx_lead_1',
    amount: 15000,
    type: 'expense',
    date: '2026-10-01',
    accountId: 'acc_1',
    revision: 2,
  };
  const remoteTx = {
    id: 'tx_lead_1',
    amount: 18000, // Divergência financeira
    type: 'expense',
    date: '2026-10-01',
    accountId: 'acc_1',
    revision: 1, // Versão mais antiga
  };

  const resTx = resolver.resolve('transactions', localTx, remoteTx);
  assert(resTx.action === 'use_local', 'Deve usar local pois revisão local é maior');
  assert(resTx.divergenceDetected === true, 'Deve sinalizar divergência financeira');

  // Mesmo cenário, mas com revisão remota maior
  const remoteTxHigher = { ...remoteTx, revision: 3 };
  const resTxHigher = resolver.resolve('transactions', localTx, remoteTxHigher);
  assert(resTxHigher.action === 'use_remote', 'Deve adotar remota quando revisão remota for maior');
  assert(resTxHigher.divergenceDetected === true, 'Deve detectar divergência');

  // Teste 2.2: Conflito de Snapshot (LWW)
  console.log('  -> Testando conflito de snapshot (LWW)...');
  const localSnapshot = {
    id: 'acc_snap',
    currentBalance: 50000,
    updatedAt: '2026-10-08T10:00:00Z',
  };
  const remoteSnapshot = {
    id: 'acc_snap',
    currentBalance: 58000,
    updatedAt: '2026-10-08T11:00:00Z', // Mais recente
  };

  const resSnap = resolver.resolveSnapshotConflict(localSnapshot, remoteSnapshot);
  assert(resSnap.action === 'use_remote', 'Snapshot mais recente na nuvem deve vencer por LWW');
  assert(resSnap.resolvedItem?.currentBalance === 58000, 'Saldo deve ser 58000');

  // Teste 2.3: Delete / Tombstone Protection
  console.log('  -> Testando proteção de tombstone...');
  const tombstone: TombstoneMetadata = {
    deleted: true,
    deletedAt: '2026-10-08T12:00:00Z',
    tombstoneRevision: 3,
  };
  const remoteRevivedItem = {
    id: 'tx_tomb',
    amount: 3000,
    revision: 2,
  };

  const resTombstone = resolver.resolve('transactions', null, remoteRevivedItem, tombstone);
  assert(resTombstone.action === 'mark_deleted', 'Tombstone local impede ressuscitação de item vindo da nuvem');

  // Teste 2.4: Revisão maior vs menor em entidade geral
  console.log('  -> Testando revisão maior vs menor...');
  const localAcc = { id: 'acc_test', name: 'Conta A', revision: 5 };
  const remoteAcc = { id: 'acc_test', name: 'Conta B', revision: 2 };
  const resAcc = resolver.resolve('accounts', localAcc, remoteAcc);
  assert(resAcc.action === 'use_local', 'Revisão local maior vence');
  assert(resAcc.resolvedItem?.name === 'Conta A', 'Nome local preservado');

  // =========================================================================
  // 3. Testes de Integração de FinancialSyncService (Zero React)
  // =========================================================================
  console.log('\n--- 3. Testando FinancialSyncService ---');

  // Mock de CloudSyncProvider
  let pushedItems: SyncQueueItem[] = [];
  const mockCloud: CloudSyncProvider = {
    name: 'MockCloudProvider',
    push: async <T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>> => {
      pushedItems.push(item);
      return { success: true, data: item.payload };
    },
    pull: async <T>() => [] as T[],
    delete: async () => ({ success: true }),
  };

  const txRepo = new IndexedDBTransactionRepository(testDb);
  const accountRepo = new IndexedDBAccountRepository(testDb);
  const cardRepo = new IndexedDBCreditCardRepository(testDb);
  const invRepo = new IndexedDBInvestmentRepository(testDb);
  const goalRepo = new IndexedDBGoalRepository(testDb);
  const budgetRepo = new IndexedDBBudgetRepository(testDb);

  await queue.clear();

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
  });

  // Salva transação pelo FinancialSyncService
  await syncService.saveTransaction({
    id: 'tx_svc_1',
    description: 'Café da manhã',
    amount: 1500,
    type: 'expense',
    categoryId: 'cat_alimentacao',
    accountId: 'acc_1',
    paymentMethod: 'pix',
    date: '2026-10-08',
    status: 'completed',
    createdAt: '2026-10-08T09:00:00Z',
  });

  // Verifica persistência local imediata
  const localSaved = await txRepo.getById('tx_svc_1');
  assert(localSaved !== null, 'Transação deve ter sido salva imediatamente no IndexedDB');
  assert(localSaved!.description === 'Café da manhã', 'Descrição deve bater');

  // Processa a fila de sincronização
  await syncService.processQueue();
  assert(syncService.getStatus() === 'synced', 'Status deve ser "synced" após envio com sucesso');
  assert(pushedItems.length === 1, 'Item deve ter sido enviado ao CloudSyncProvider');
  assert(pushedItems[0].entityId === 'tx_svc_1', 'ID da entidade enviada deve bater');
  assert((await queue.count()) === 0, 'Fila deve estar vazia após envio com sucesso');

  // Testes de Contas Local-First (Etapa 2.5)
  console.log('  -> Testando saveAccount no FinancialSyncService...');
  await syncService.saveAccount({
    id: 'acc_local_1',
    name: 'Conta Inter',
    type: 'checking',
    bankName: 'Inter',
    color: '#ff7a00',
    initialBalance: 50000,
    currentBalance: 50000,
    icon: 'wallet',
  });

  const localSavedAcc = await accountRepo.getById('acc_local_1');
  assert(localSavedAcc !== null, 'Conta deve ter sido salva no IndexedDB');
  assert(localSavedAcc!.name === 'Conta Inter', 'Nome da conta deve bater');

  // Snapshot de saldo local (não gera mutação na fila)
  console.log('  -> Testando saveAccountBalanceSnapshot (cache local sem sujar fila)...');
  await syncService.saveAccountBalanceSnapshot('acc_local_1', 62000);
  const snapAcc = await accountRepo.getById('acc_local_1');
  assert(snapAcc!.currentBalance === 62000, 'Snapshot de saldo deve ser atualizado no IndexedDB');
  assert((await queue.count()) === 1, 'Fila deve conter apenas a criação da conta, snapshot não deve enfileirar');

  // Sincroniza criação da conta
  await syncService.processQueue();
  assert((await queue.count()) === 0, 'Fila deve zerar após sincronizar criação');

  // Soft-delete / tombstone de conta
  console.log('  -> Testando deleteAccount (tombstone e preservação referencial)...');
  await syncService.deleteAccount('acc_local_1');
  const activeAccAfterDelete = await accountRepo.getById('acc_local_1');
  assert(activeAccAfterDelete === null, 'Conta deletada não deve aparecer em consultas ativas');

  const tombstoneAcc = await accountRepo.getById('acc_local_1', true);
  assert(tombstoneAcc !== null, 'Registro tombstone deve existir no IndexedDB');
  assert((tombstoneAcc as any).deleted === true, 'Flag deleted deve ser true');
  assert((tombstoneAcc as any).deletedAt !== undefined, 'deletedAt deve estar preenchido');

  assert((await queue.count()) === 1, 'Fila deve ter 1 operação de exclusão');
  await syncService.processQueue();
  assert((await queue.count()) === 0, 'Fila deve zerar após sincronizar exclusão');

  console.log('\n======================================================');
  console.log('✅ TODOS OS TESTES DA ETAPA 2.3 FORAM APROVADOS COM SUCESSO!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('❌ Erro durante execução dos testes:', err);
  process.exit(1);
});
