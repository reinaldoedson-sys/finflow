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
import { calculateInvestmentPosition } from '../src/domain/investmentPosition';
import type { CloudSyncProvider, CloudSyncResult } from '../src/services/providers/CloudSyncProvider';
import type { SyncQueueItem } from '../src/services/syncTypes';
import type { InvestmentAsset, InvestmentTransaction, Transaction, Account } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runEtapa28Tests() {
  console.log('🧪 Iniciando testes de Migração de INVESTMENTS (Etapa 2.8)...');

  const testDbName = `TestInvestmentDB_${Date.now()}`;
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
  // 1. Teste: Ledger Imutável (Append-only, Adjustment e Reversal/Tombstone)
  // =========================================================================
  console.log('\n--- 1. Testando Ledger Imutável ---');

  const asset1: InvestmentAsset = {
    id: 'ast_petr4',
    ticker: 'PETR4',
    name: 'Petrobras PN',
    type: 'stock',
    quantity: 100,
    averagePrice: 30,
    currentPrice: 38.5,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-10-01T10:00:00Z',
  };
  await syncService.saveInvestmentAsset(asset1);

  const txBuy: InvestmentTransaction = {
    id: 'itx_buy_1',
    assetId: 'ast_petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 100,
    price: 30,
    totalAmount: 3000,
    createdAt: '2026-10-01T10:00:00Z',
  };
  await syncService.saveInvestmentTransaction(txBuy);

  const savedBuy = await invRepo.getTransactionById('itx_buy_1');
  assert(savedBuy !== null, 'Transação de compra deve ter sido salva no ledger');
  assert(savedBuy!.quantity === 100, 'Quantidade deve ser 100');

  // Ajuste contábil (Adjustment Event)
  const txAdjusted: InvestmentTransaction = {
    ...txBuy,
    quantity: 110,
    totalAmount: 3300,
    notes: 'Ajuste de corretagem/bonificação',
  };
  await syncService.recordInvestmentAdjustment('itx_buy_1', txAdjusted);

  const savedAdjusted = await invRepo.getTransactionById('itx_buy_1');
  assert(savedAdjusted!.quantity === 110, 'Registro ajustado deve refletir nova quantidade');
  assert(savedAdjusted!.notes === 'Ajuste de corretagem/bonificação', 'Notas de ajuste preservadas');

  // Estorno contábil (Reversal Event com tombstone - nunca deleção física)
  await syncService.reverseInvestmentTransaction('itx_buy_1', 'erro_operacional');

  const activeLookup = await invRepo.getTransactionById('itx_buy_1');
  assert(activeLookup === null, 'Transação estornada NÃO deve aparecer em busca ativa da UI');

  const rawAuditLookup = await invRepo.getTransactionById('itx_buy_1', true);
  assert(rawAuditLookup !== null, 'Histórico do ledger deve ser preservado para auditoria (nunca deletado fisicamente)');
  assert((rawAuditLookup as any).deleted === true, 'Flag deleted deve ser true');
  assert((rawAuditLookup as any).tombstoneRevision >= 2, 'Tombstone revision incrementada');

  // =========================================================================
  // 2. Teste: Divergência entre Asset e Ledger
  // =========================================================================
  console.log('\n--- 2. Testando Divergência entre Asset e Ledger ---');

  // Cria ativo com valores desatualizados/divergentes gravados no documento
  const staleAsset: InvestmentAsset = {
    id: 'ast_vale3',
    ticker: 'VALE3',
    name: 'Vale S.A.',
    type: 'stock',
    quantity: 9999, // Divergente
    averagePrice: 1.0, // Divergente
    currentPrice: 65,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-10-01T10:00:00Z',
  };
  await invRepo.saveAsset(staleAsset);

  // Transações reais no ledger
  const valeTxs: InvestmentTransaction[] = [
    {
      id: 'itx_v1',
      assetId: 'ast_vale3',
      type: 'buy',
      date: '2026-10-02',
      quantity: 10,
      price: 60,
      totalAmount: 600,
      createdAt: '2026-10-02T10:00:00Z',
    },
    {
      id: 'itx_v2',
      assetId: 'ast_vale3',
      type: 'buy',
      date: '2026-10-03',
      quantity: 10,
      price: 70,
      totalAmount: 700,
      createdAt: '2026-10-03T10:00:00Z',
    },
  ];
  await invRepo.saveTransactionsBatch(valeTxs);

  // O motor de posição deve derivar a posição estritamente do ledger (quantidade = 20, PM = 65)
  const derivedPos = calculateInvestmentPosition(staleAsset, valeTxs);
  assert(derivedPos.quantity === 20, `Posição derivada deve ser 20, encontrou: ${derivedPos.quantity}`);
  assert(derivedPos.averagePrice === 65, `Preço médio derivado deve ser 65, encontrou: ${derivedPos.averagePrice}`);
  assert(derivedPos.totalCost === 1300, `Custo total derivado deve ser 1300, encontrou: ${derivedPos.totalCost}`);

  // =========================================================================
  // 3. Teste: Rollback de Aporte Parcial via executeAtomicOperation
  // =========================================================================
  console.log('\n--- 3. Testando Rollback de Aporte Parcial ---');

  await queue.clear();
  const queueBeforeRollback = await queue.count();
  assert(queueBeforeRollback === 0, 'Fila deve iniciar vazia');

  let failedAtomically = false;
  try {
    await syncService.executeAtomicOperation({
      correlationId: 'aporte_falho_1',
      operations: [
        {
          entityName: 'investments',
          entityId: 'ast_fail',
          action: 'create',
          payload: { id: 'ast_fail', ticker: 'FAIL3' },
        },
        {
          entityName: 'investmentTransactions',
          entityId: 'itx_fail',
          action: 'create',
          payload: { id: 'itx_fail', assetId: 'ast_fail' },
        },
      ],
      applyLocalPersist: async () => {
        // Grava o primeiro registro
        await invRepo.saveAsset({
          id: 'ast_fail',
          ticker: 'FAIL3',
          name: 'Falha S.A.',
          type: 'stock',
          quantity: 10,
          averagePrice: 10,
          currentPrice: 10,
          currency: 'BRL',
          autoUpdate: false,
          createdAt: '2026-10-08T12:00:00Z',
        });

        // Simula falha catastrófica no meio da transação local (ex: erro de rede/disco)
        throw new Error('Falha simulada no meio do lote de aporte!');
      },
    });
  } catch (err: any) {
    failedAtomically = true;
    assert(err.message.includes('Falha simulada'), 'Erro esperado de rollback');
  }

  assert(failedAtomically, 'Deve ter disparado exceção durante o lote atômico');

  // Verifica que o Dexie fez rollback do ativo
  const rolledBackAsset = await invRepo.getAssetById('ast_fail');
  assert(rolledBackAsset === null, 'Ativo NÃO deve ter sido persistido após rollback');

  // Verifica que a SyncQueue NÃO foi poluída com operações parciais
  const queueAfterRollback = await queue.count();
  assert(queueAfterRollback === 0, 'SyncQueue NÃO deve receber nenhum item em caso de falha local');

  // =========================================================================
  // 4. Teste: correlationId Obrigatório no Aporte
  // =========================================================================
  console.log('\n--- 4. Testando correlationId do Aporte ---');

  // Caso 4.1: Falha se correlationId for vazio
  let threwEmptyCorrelation = false;
  try {
    await syncService.executeAtomicOperation({
      correlationId: '',
      operations: [],
      applyLocalPersist: async () => {},
    });
  } catch (err: any) {
    threwEmptyCorrelation = true;
    assert(err.message.includes('correlationId obrigatório'), 'Deve exigir correlationId');
  }
  assert(threwEmptyCorrelation, 'Deve rejeitar chamada sem correlationId');

  // Caso 4.2: Sucesso com propagação de correlationId em todas as entidades
  const accountAporte: Account = {
    id: 'acc_corretora_1',
    name: 'Conta Corretora XP',
    type: 'investment',
    bankName: 'XP Investimentos',
    color: '#000000',
    initialBalance: 50000,
    currentBalance: 50000,
    icon: 'wallet',
  };
  await accountRepo.save(accountAporte);

  const correlationAporteId = 'aporte_corr_xyz_999';
  const newAssetAporte: InvestmentAsset = {
    id: 'ast_itub4',
    ticker: 'ITUB4',
    name: 'Itaú Unibanco',
    type: 'stock',
    quantity: 100,
    averagePrice: 35,
    currentPrice: 35,
    currency: 'BRL',
    autoUpdate: true,
    createdAt: '2026-10-08T14:00:00Z',
  };

  const newTxAporte: InvestmentTransaction = {
    id: 'itx_itub4_1',
    assetId: 'ast_itub4',
    type: 'buy',
    date: '2026-10-08',
    quantity: 100,
    price: 35,
    totalAmount: 3500,
    createdAt: '2026-10-08T14:00:00Z',
  };

  const newDebitAporte: Transaction = {
    id: 'tx_debit_itub4',
    description: 'Aporte ITUB4 (100 cotas)',
    amount: 3500,
    type: 'expense',
    categoryId: 'cat-invest',
    accountId: 'acc_corretora_1',
    paymentMethod: 'pix',
    date: '2026-10-08',
    status: 'completed',
    createdAt: '2026-10-08T14:00:00Z',
  };

  await syncService.executeAtomicOperation({
    correlationId: correlationAporteId,
    operations: [
      {
        entityName: 'investments',
        entityId: newAssetAporte.id,
        action: 'create',
        payload: newAssetAporte,
      },
      {
        entityName: 'investmentTransactions',
        entityId: newTxAporte.id,
        action: 'create',
        payload: newTxAporte,
        dependsOn: [{ entityName: 'investments', entityId: newAssetAporte.id }],
      },
      {
        entityName: 'transactions',
        entityId: newDebitAporte.id,
        action: 'create',
        payload: newDebitAporte,
        dependsOn: [{ entityName: 'accounts', entityId: accountAporte.id }],
      },
    ],
    applyLocalPersist: async () => {
      await invRepo.saveAsset(newAssetAporte);
      await invRepo.saveTransaction(newTxAporte);
      await txRepo.save(newDebitAporte);
    },
  });

  const queuedAporteItems = await queue.getAll();
  assert(queuedAporteItems.length === 3, 'Deve haver 3 itens na fila para o aporte');
  for (const item of queuedAporteItems) {
    assert(
      item.correlationId === correlationAporteId,
      `correlationId deve ser ${correlationAporteId}, encontrou: ${item.correlationId}`
    );
  }

  // =========================================================================
  // 5. Teste: Dependências Causais do Aporte
  // =========================================================================
  console.log('\n--- 5. Testando Dependências Causais do Aporte ---');

  const invTxQueueItem = queuedAporteItems.find(i => i.entityName === 'investmentTransactions')!;
  assert(invTxQueueItem !== undefined, 'Item de InvestmentTransaction deve estar na fila');
  assert(
    invTxQueueItem.dependsOn !== undefined && invTxQueueItem.dependsOn.length > 0,
    'InvestmentTransaction deve possuir dependsOn'
  );
  assert(
    invTxQueueItem.dependsOn![0].entityName === 'investments' &&
      invTxQueueItem.dependsOn![0].entityId === 'ast_itub4',
    'InvestmentTransaction deve depender do InvestmentAsset correspondente'
  );

  const debitQueueItem = queuedAporteItems.find(i => i.entityName === 'transactions')!;
  assert(debitQueueItem !== undefined, 'Item de débito bancário deve estar na fila');
  assert(
    debitQueueItem.dependsOn !== undefined && debitQueueItem.dependsOn.length > 0,
    'Transação bancária deve possuir dependsOn'
  );
  assert(
    debitQueueItem.dependsOn![0].entityName === 'accounts' &&
      debitQueueItem.dependsOn![0].entityId === 'acc_corretora_1',
    'Transação bancária deve depender da Account correspondente'
  );

  // Processa a fila e garante ordem causal
  await syncService.processQueue();
  assert((await queue.count()) === 0, 'Fila deve zerar após sincronizar tudo em ordem causal');

  // =========================================================================
  // 6. Teste: Market Quote sem Poluir SyncQueue
  // =========================================================================
  console.log('\n--- 6. Testando Market Quote como Cache sem SyncQueue ---');

  await syncService.updateInvestmentMarketQuote('ast_itub4', 39.75, {
    previousClose: 39.0,
    changePercent: 1.92,
    lastPriceUpdate: '2026-10-08T16:00:00Z',
  });

  const updatedAsset = await invRepo.getAssetById('ast_itub4');
  assert(updatedAsset !== null, 'Ativo deve existir');
  assert(updatedAsset!.currentPrice === 39.75, 'Preço atual deve ter sido atualizado no cache local');

  const queueAfterQuote = await queue.count();
  assert(
    queueAfterQuote === 0,
    `Market quote NUNCA deve gerar item na SyncQueue. Encontrou ${queueAfterQuote} itens.`
  );

  console.log('\n======================================================');
  console.log('✅ TODOS OS TESTES DA ETAPA 2.8 (INVESTMENTS) PASSARAM COM SUCESSO!');
  console.log('======================================================');
}

runEtapa28Tests().catch(err => {
  console.error('❌ Erro durante execução dos testes da Etapa 2.8:', err);
  process.exit(1);
});
