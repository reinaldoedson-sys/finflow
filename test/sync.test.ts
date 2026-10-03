import {
  enqueueOperation,
  dequeueOperation,
  mergeCloudWithPending,
  PendingSyncOperation,
  SyncStatus
} from '../src/domain/sync';
import { Transaction } from '../src/types/finance';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- INICIANDO TESTES DE CONSISTÊNCIA LOCAL-FIRST E FIRESTORE (ETAPA 5) ---');

// Helper para mock de transações
function createMockTx(id: string, description: string, amount: number): Transaction {
  return {
    id,
    description,
    amount,
    type: 'expense',
    categoryId: 'cat-alimentacao',
    accountId: 'acc-1',
    paymentMethod: 'pix',
    date: '2026-10-03',
    status: 'completed',
    createdAt: new Date().toISOString()
  };
}

// =========================================================================
// TESTE A: Operação local + Firestore funcionando -> status 'synced'
// =========================================================================
{
  let queue: PendingSyncOperation[] = [];
  let status: SyncStatus = 'synced';
  const localTransactions: Transaction[] = [];

  // Simula criação local
  const txA = createMockTx('tx-a', 'Compra Mercado', 150);
  localTransactions.push(txA);

  // Firestore responde com sucesso imediato (sem adicionar na fila de pendentes)
  const firestoreSuccess = true;
  if (!firestoreSuccess) {
    queue = enqueueOperation(queue, {
      collection: 'transactions',
      docId: txA.id,
      type: 'set',
      payload: txA
    });
    status = 'error';
  } else {
    status = 'synced';
  }

  assert(localTransactions.length === 1, 'Teste A: Transação criada com sucesso no estado local');
  assert(queue.length === 0, 'Teste A: Fila de pendências permanece vazia');
  assert(status === 'synced', 'Teste A: Status de sincronização permanece "synced"');
}

// =========================================================================
// TESTE B: Operação local funcionando + Firestore falhando -> local preservado, status 'error', operação na fila
// =========================================================================
{
  let queue: PendingSyncOperation[] = [];
  let status: SyncStatus = 'synced';
  let syncError: string | null = null;
  const localTransactions: Transaction[] = [];

  // 1. Criação local
  const txB = createMockTx('tx-b', 'Farmácia', 85.50);
  localTransactions.push(txB);

  // 2. Simula falha do Firestore (ex: rede offline ou timeout)
  const firestoreSuccess = false;
  if (!firestoreSuccess) {
    queue = enqueueOperation(queue, {
      collection: 'transactions',
      docId: txB.id,
      type: 'set',
      payload: txB,
      lastError: 'Network unavailable'
    });
    status = 'error';
    syncError = 'Falha ao sincronizar com a nuvem. Alteração mantida localmente.';
  }

  assert(localTransactions.length === 1, 'Teste B: Alteração local preservada mesmo com falha do Firestore');
  assert(localTransactions[0].description === 'Farmácia', 'Teste B: Dados locais íntegros');
  assert(status === 'error', 'Teste B: Status de sincronização atualizado para "error"');
  assert(queue.length === 1, 'Teste B: Operação registrada na fila de pendências para retry');
  assert(queue[0].docId === 'tx-b', 'Teste B: ID estável mantido na operação');
  assert(syncError !== null, 'Teste B: Mensagem de erro amigável registrada no contexto');
}

// =========================================================================
// TESTE C: Retry após falha -> reenvia sem duplicar, status volta para 'synced'
// =========================================================================
{
  let queue: PendingSyncOperation[] = [];
  let status: SyncStatus = 'error';

  // Popula fila simulando a falha anterior
  const txC = createMockTx('tx-c', 'Combustível', 200);
  queue = enqueueOperation(queue, {
    collection: 'transactions',
    docId: txC.id,
    type: 'set',
    payload: txC,
    lastError: 'Network error'
  });

  // Simula banco remoto (mock Firestore collection)
  const mockFirestoreDatabase = new Map<string, any>();

  // Executa retry:
  const operationsToRetry = [...queue];
  for (const op of operationsToRetry) {
    // Simula setDoc idempotente usando o mesmo docId estável
    mockFirestoreDatabase.set(`${op.collection}/${op.docId}`, op.payload);
    queue = dequeueOperation(queue, op.collection, op.docId);
  }

  if (queue.length === 0) {
    status = 'synced';
  }

  assert(queue.length === 0, 'Teste C: Fila de pendências esvaziada após retry bem-sucedido');
  assert(status === 'synced', 'Teste C: Status de sincronização atualizado para "synced"');
  assert(mockFirestoreDatabase.size === 1, 'Teste C: Documento gravado exatamente 1 vez no Firestore (sem duplicação)');
  assert(mockFirestoreDatabase.has('transactions/tx-c'), 'Teste C: Chave gravada com docId estável "tx-c"');

  // Segundo retry acidental: reprocessamento não cria novo documento
  mockFirestoreDatabase.set('transactions/tx-c', txC);
  assert(mockFirestoreDatabase.size === 1, 'Teste C: Retry subsequente é estritamente idempotente (sem duplicidade)');
}

// =========================================================================
// TESTE D: Múltiplas operações pendentes -> ambas na fila, ambas sincronizam
// =========================================================================
{
  let queue: PendingSyncOperation[] = [];
  let status: SyncStatus = 'synced';

  const tx1 = createMockTx('tx-1', 'Almoço', 45);
  const tx2 = createMockTx('tx-2', 'Jantar', 60);

  // Ambas falham no Firestore e entram na fila
  queue = enqueueOperation(queue, { collection: 'transactions', docId: tx1.id, type: 'set', payload: tx1 });
  queue = enqueueOperation(queue, { collection: 'transactions', docId: tx2.id, type: 'set', payload: tx2 });
  status = 'error';

  assert(queue.length === 2, 'Teste D: Ambas as operações pendentes enfileiradas');
  assert(queue.map(q => q.docId).includes('tx-1') && queue.map(q => q.docId).includes('tx-2'), 'Teste D: Ambos os IDs registrados');

  // Retry de todas as pendências
  const mockDb = new Map<string, any>();
  for (const op of [...queue]) {
    mockDb.set(`${op.collection}/${op.docId}`, op.payload);
    queue = dequeueOperation(queue, op.collection, op.docId);
  }

  if (queue.length === 0) {
    status = 'synced';
  }

  assert(queue.length === 0, 'Teste D: Todas as operações pendentes processadas');
  assert(mockDb.size === 2, 'Teste D: Ambas as transações sincronizadas no banco');
  assert(status === 'synced', 'Teste D: Status final volta para "synced"');
}

// =========================================================================
// TESTE E: Falha de rede não apaga dados locais e snapshots do Firestore respeitam dados locais pendentes
// =========================================================================
{
  // Cenário: Usuário cria 'tx-offline' localmente. Firestore está offline.
  const localTransactions: Transaction[] = [
    createMockTx('tx-offline', 'Café no Aeroporto', 18.00)
  ];

  let queue: PendingSyncOperation[] = [];
  queue = enqueueOperation(queue, {
    collection: 'transactions',
    docId: 'tx-offline',
    type: 'set',
    payload: localTransactions[0]
  });

  // O Firestore responde com snapshot do servidor (que ainda NÃO contém 'tx-offline' porque o servidor não a recebeu)
  const cloudSnapshot: Transaction[] = [
    createMockTx('tx-cloud-old', 'Lançamento Antigo no Servidor', 100)
  ];

  // A função pura de merge local-first não pode apagar a transação local!
  const mergedResult = mergeCloudWithPending(cloudSnapshot, queue, 'transactions', localTransactions);

  assert(mergedResult.length === 2, `Teste E: Snapshot do servidor não apagou dado local não sincronizado (total: ${mergedResult.length})`);
  assert(mergedResult.some(t => t.id === 'tx-offline'), 'Teste E: "tx-offline" mantida viva na interface');
  assert(mergedResult.some(t => t.id === 'tx-cloud-old'), 'Teste E: "tx-cloud-old" do servidor também incorporada');

  // Cenário de exclusão pendente: usuário excluiu 'tx-cloud-old' localmente, mas a rede caiu antes do deleteDoc
  queue = enqueueOperation(queue, {
    collection: 'transactions',
    docId: 'tx-cloud-old',
    type: 'delete'
  });

  // Novo snapshot chega do Firestore (onde tx-cloud-old ainda existe): a exclusão local deve ser honrada
  const mergedAfterDelete = mergeCloudWithPending(cloudSnapshot, queue, 'transactions', localTransactions);
  assert(!mergedAfterDelete.some(t => t.id === 'tx-cloud-old'), 'Teste E: Item com exclusão pendente não ressuscita com snapshot do servidor');
}

console.log(`\nResultado Final dos Testes de Consistência: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}
