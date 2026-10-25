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
import type { SyncEntityName, SyncQueueItem } from '../src/services/syncTypes';
import type { Transaction, InvestmentTransaction, GoalMovement } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

/**
 * Nuvem compartilhada em memória com contagem de escritas.
 */
class SharedCloudProvider implements CloudSyncProvider {
  readonly name = 'SharedCloudProvider';
  public storage = new Map<string, Map<string, any>>();
  public writeCount = 0;

  async push<T>(item: SyncQueueItem<T>): Promise<CloudSyncResult<T>> {
    this.writeCount++;
    if (!this.storage.has(item.entityName)) {
      this.storage.set(item.entityName, new Map());
    }
    const col = this.storage.get(item.entityName)!;
    if (item.action === 'delete') {
      col.set(item.entityId, {
        id: item.entityId,
        deleted: true,
        revision: item.revision,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const payload = item.payload as any;
      col.set(item.entityId, {
        ...payload,
        id: item.entityId,
        revision: item.revision,
        updatedAt: payload?.updatedAt || new Date().toISOString(),
      });
    }
    return { success: true, data: item.payload };
  }

  async pull<T>(entityName: SyncEntityName): Promise<T[]> {
    const col = this.storage.get(entityName);
    if (!col) return [];
    return Array.from(col.values()) as T[];
  }

  async delete(): Promise<CloudSyncResult> {
    return { success: true };
  }
}

function createDevice(name: string, sharedCloud: SharedCloudProvider) {
  const dbName = `ConvergenceDB_${name}_${Date.now()}_${Math.random()}`;
  const db = new FinFlowDatabase(dbName);
  const queueRepo = new IndexedDBSyncQueueRepository(db);
  const queue = new SyncQueue(queueRepo, 10, 100);
  const resolver = new ConflictResolver();

  const txRepo = new IndexedDBTransactionRepository(db);
  const accountRepo = new IndexedDBAccountRepository(db);
  const cardRepo = new IndexedDBCreditCardRepository(db);
  const invRepo = new IndexedDBInvestmentRepository(db);
  const goalRepo = new IndexedDBGoalRepository(db);
  const budgetRepo = new IndexedDBBudgetRepository(db);

  const service = new FinancialSyncService({
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
    cloudProvider: sharedCloud,
  });

  const sync = async (entityName: SyncEntityName) => {
    // 1. Envia fila local pendente
    await service.processQueue();
    // 2. Baixa estado da nuvem e hidrata
    const remoteItems = await sharedCloud.pull<any>(entityName);
    await service.hydrateFromCloud(entityName, remoteItems);
  };

  return {
    name,
    db,
    queue,
    resolver,
    txRepo,
    invRepo,
    goalRepo,
    service,
    sync,
  };
}

async function runTests() {
  console.log('🧪 Iniciando teste de convergência entre aparelhos com empate de revisão (Passo 1)...');

  // =========================================================================
  // Caso 1: Transações Financeiras (transactions)
  // =========================================================================
  console.log('\n--- Teste 1: Transações financeiras com empate de revisão ---');
  {
    const sharedCloud = new SharedCloudProvider();
    const devA = createDevice('A', sharedCloud);
    const devB = createDevice('B', sharedCloud);

    // 1. Criar transação inicial X (revision 1) no Aparelho A e sincronizar
    const initialTx: Transaction = {
      id: 'tx_shared_1',
      description: 'Supermercado Mensal',
      amount: 10000,
      type: 'expense',
      categoryId: 'cat_alimentacao',
      accountId: 'acc_1',
      paymentMethod: 'pix',
      date: '2026-10-01',
      status: 'completed',
      revision: 1,
      createdAt: '2026-10-01T10:00:00Z',
    };

    await devA.service.saveTransaction(initialTx);
    await devA.sync('transactions');

    // Aparelho B sincroniza e obtém a transação inicial X (revision 1)
    await devB.sync('transactions');

    const txInA0 = await devA.txRepo.getById('tx_shared_1');
    const txInB0 = await devB.txRepo.getById('tx_shared_1');
    assert(txInA0?.amount === 10000, 'Aparelho A deve ter amount inicial 10000');
    assert(txInB0?.amount === 10000, 'Aparelho B deve ter amount inicial 10000');

    // 2. Desconectar/editar concorrentemente a partir da revision 1:
    // Aparelho A altera para 15000 (revision 2)
    await devA.service.saveTransaction({
      ...initialTx,
      amount: 15000,
      description: 'Supermercado (Edição por A)',
      revision: 2,
    });

    // Aparelho B altera para 20000 (revision 2)
    await devB.service.saveTransaction({
      ...initialTx,
      amount: 20000,
      description: 'Supermercado (Edição por B)',
      revision: 2,
    });

    console.log('  -> Estado após edição concorrente offline:');
    console.log('     Aparelho A local:', (await devA.txRepo.getById('tx_shared_1'))?.amount, 'rev:', (await devA.txRepo.getById('tx_shared_1'))?.revision);
    console.log('     Aparelho B local:', (await devB.txRepo.getById('tx_shared_1'))?.amount, 'rev:', (await devB.txRepo.getById('tx_shared_1'))?.revision);

    // 3. Rodadas alternadas de sincronização: A, B, A, B, A, B
    const writesBeforeRounds = sharedCloud.writeCount;
    for (let round = 1; round <= 3; round++) {
      await devA.sync('transactions');
      await devB.sync('transactions');
      console.log(`     Fim da Rodada ${round}: Nuvem writes: ${sharedCloud.writeCount}`);
    }

    const finalTxA = await devA.txRepo.getById('tx_shared_1');
    const finalTxB = await devB.txRepo.getById('tx_shared_1');

    console.log('  -> Valores finais:');
    console.log(`     Aparelho A final: amount=${finalTxA?.amount}, desc="${finalTxA?.description}"`);
    console.log(`     Aparelho B final: amount=${finalTxB?.amount}, desc="${finalTxB?.description}"`);
    console.log(`     Escritas totais na nuvem: ${sharedCloud.writeCount - writesBeforeRounds}`);

    // Critério (i): Ambos os aparelhos DEVEM convergir para a MESMA versão
    assert(
      finalTxA?.amount === finalTxB?.amount && finalTxA?.description === finalTxB?.description,
      `DIVERGÊNCIA NÃO RESOLVIDA: Aparelho A tem amount=${finalTxA?.amount} e Aparelho B tem amount=${finalTxB?.amount}`
    );
  }

  // =========================================================================
  // Caso 2: Ledgers de Eventos de Investimento (investmentTransactions)
  // =========================================================================
  console.log('\n--- Teste 2: Ledger de Investimentos com empate de revisão ---');
  {
    const sharedCloud = new SharedCloudProvider();
    const devA = createDevice('A', sharedCloud);
    const devB = createDevice('B', sharedCloud);

    // Criar ativo pai asset_petr4 para satisfazer dependência causal
    await devA.service.saveInvestmentAsset({
      id: 'asset_petr4',
      ticker: 'PETR4',
      name: 'Petrobras',
      type: 'stock',
      quantity: 100,
      averagePrice: 35.0,
      currentPrice: 35.0,
      currency: 'BRL',
      autoUpdate: false,
      revision: 1,
      createdAt: '2026-10-01T10:00:00Z',
    });
    await devA.sync('investments');
    await devB.sync('investments');

    const initialInvTx: InvestmentTransaction = {
      id: 'inv_tx_1',
      assetId: 'asset_petr4',
      type: 'buy',
      quantity: 100,
      price: 35.0,
      totalAmount: 3500.0,
      date: '2026-10-01',
      createdAt: '2026-10-01T10:00:00Z',
      revision: 1,
    };

    await devA.service.saveInvestmentTransaction(initialInvTx);
    await devA.sync('investmentTransactions');
    await devB.sync('investmentTransactions');

    // Edição concorrente para revision 2:
    await devA.service.saveInvestmentTransaction({
      ...initialInvTx,
      price: 36.0,
      totalAmount: 3600.0,
      revision: 2,
    });

    await devB.service.saveInvestmentTransaction({
      ...initialInvTx,
      price: 37.0,
      totalAmount: 3700.0,
      revision: 2,
    });

    for (let round = 1; round <= 3; round++) {
      await devA.sync('investmentTransactions');
      await devB.sync('investmentTransactions');
    }

    const finalInvA = await devA.invRepo.getTransactionById('inv_tx_1');
    const finalInvB = await devB.invRepo.getTransactionById('inv_tx_1');

    console.log('  -> Valores finais de investmentTransactions:');
    console.log(`     Aparelho A: totalAmount=${finalInvA?.totalAmount}, price=${finalInvA?.price}`);
    console.log(`     Aparelho B: totalAmount=${finalInvB?.totalAmount}, price=${finalInvB?.price}`);

    assert(
      finalInvA?.totalAmount === finalInvB?.totalAmount,
      `DIVERGÊNCIA EM INVESTMENT TRANSACTIONS: Aparelho A tem totalAmount=${finalInvA?.totalAmount} e Aparelho B tem totalAmount=${finalInvB?.totalAmount}`
    );
  }

  // =========================================================================
  // Caso 3: Movimentações de Metas (goalMovements)
  // =========================================================================
  console.log('\n--- Teste 3: Movimentação de Metas com empate de revisão ---');
  {
    const sharedCloud = new SharedCloudProvider();
    const devA = createDevice('A', sharedCloud);
    const devB = createDevice('B', sharedCloud);

    // Criar meta pai goal_viagem para satisfazer dependência causal
    await devA.service.saveGoal({
      id: 'goal_viagem',
      name: 'Viagem de Férias',
      targetAmount: 5000,
      currentAmount: 0,
      targetDate: '2026-12-31',
      icon: 'plane',
      color: '#3b82f6',
      revision: 1,
    });
    await devA.sync('goals');
    await devB.sync('goals');

    const initialMov: GoalMovement = {
      id: 'mov_goal_1',
      goalId: 'goal_viagem',
      type: 'deposit',
      amount: 500,
      date: '2026-10-01',
      createdAt: '2026-10-01T10:00:00Z',
      revision: 1,
    };

    await devA.service.saveGoalMovement(initialMov);
    await devA.sync('goalMovements');
    await devB.sync('goalMovements');

    await devA.service.saveGoalMovement({
      ...initialMov,
      amount: 600,
      revision: 2,
    });

    await devB.service.saveGoalMovement({
      ...initialMov,
      amount: 700,
      revision: 2,
    });

    for (let round = 1; round <= 3; round++) {
      await devA.sync('goalMovements');
      await devB.sync('goalMovements');
    }

    const finalMovA = await devA.goalRepo.getMovementById('mov_goal_1');
    const finalMovB = await devB.goalRepo.getMovementById('mov_goal_1');

    console.log('  -> Valores finais de goalMovements:');
    console.log(`     Aparelho A: amount=${finalMovA?.amount}`);
    console.log(`     Aparelho B: amount=${finalMovB?.amount}`);

    assert(
      finalMovA?.amount === finalMovB?.amount,
      `DIVERGÊNCIA EM GOAL MOVEMENTS: Aparelho A tem amount=${finalMovA?.amount} e Aparelho B tem amount=${finalMovB?.amount}`
    );
  }

  console.log('\n🎉 Todos os testes de convergência concluídos!');
}

runTests().catch(err => {
  console.error('\n❌ Falha no teste de convergência:', err.message);
  process.exit(1);
});
