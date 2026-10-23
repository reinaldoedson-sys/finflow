import 'fake-indexeddb/auto';
import {
  decideOwnership,
  canPushItem,
  getStoredLocalOwner,
  setStoredLocalOwner,
  LOCAL_OWNER_STORAGE_KEY,
} from '../src/domain/localOwnership';
import { FinFlowDatabase } from '../src/storage/indexedDB/database';
import { IndexedDBSyncQueueRepository } from '../src/repositories/implementations/IndexedDBSyncQueueRepository';
import {
  IndexedDBTransactionRepository,
  IndexedDBAccountRepository,
  IndexedDBCreditCardRepository,
  IndexedDBInvestmentRepository,
  IndexedDBGoalRepository,
  IndexedDBBudgetRepository,
  IndexedDBCategoryRepository,
  IndexedDBInstallmentPlanRepository,
} from '../src/repositories/implementations';
import { SyncQueue } from '../src/services/syncQueue';
import { ConflictResolver } from '../src/services/conflictResolver';
import { FinancialSyncService } from '../src/services/financialSyncService';
import type { CloudSyncProvider, CloudSyncResult } from '../src/services/providers/CloudSyncProvider';
import type { SyncQueueItem } from '../src/services/syncTypes';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

class FakeCloudProvider implements CloudSyncProvider {
  readonly name = 'FakeCloudProvider';
  public pushedItems: SyncQueueItem[] = [];

  constructor(private userId?: string) {}

  getUserId(): string | undefined {
    return this.userId;
  }

  setUserId(id?: string): void {
    this.userId = id;
  }

  async push(item: SyncQueueItem): Promise<CloudSyncResult> {
    if (!this.userId) {
      return { success: false, error: 'Usuário não autenticado', isRetryable: true };
    }
    if (!canPushItem(item.ownerUid, this.userId)) {
      return {
        success: false,
        error: `Item do dono "${item.ownerUid}" não pode ser enviado para a conta "${this.userId}"`,
        isRetryable: false,
      };
    }
    this.pushedItems.push(item);
    return { success: true };
  }

  async pull<T>(): Promise<T[]> {
    return [];
  }

  async delete(): Promise<CloudSyncResult> {
    return { success: true };
  }

  async fetchSyncStatus() {
    return { lastSyncTimestamp: null, isOnline: true };
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes de Local Ownership e Isolamento entre Contas Google...');

  // =========================================================================
  // 1. Testes de decideOwnership
  // =========================================================================
  console.log('\n--- 1. Testando decideOwnership ---');
  {
    // Sem dono guardado -> 'claim'
    assert(decideOwnership(null, 'user_123') === 'claim', 'null storedOwner deve resultar em claim');
    assert(decideOwnership('', 'user_123') === 'claim', 'storedOwner vazio deve resultar em claim');

    // Mesmo uid -> 'same'
    assert(decideOwnership('user_123', 'user_123') === 'same', 'mesmo uid deve resultar em same');

    // uid diferente -> 'conflict'
    assert(decideOwnership('user_123', 'user_456') === 'conflict', 'uid diferente deve resultar em conflict');

    // Falha / indisponibilidade de storage
    const brokenStorage = {
      getItem: () => {
        throw new Error('QuotaExceeded / SecurityError (modo anônimo restrito)');
      },
      setItem: () => {
        throw new Error('QuotaExceeded / SecurityError (modo anônimo restrito)');
      },
      removeItem: () => {
        throw new Error('QuotaExceeded / SecurityError (modo anônimo restrito)');
      },
    };

    const ownerFromBrokenStorage = getStoredLocalOwner(brokenStorage);
    assert(ownerFromBrokenStorage === null, 'Storage com exceção deve retornar null com segurança');
    assert(
      decideOwnership(ownerFromBrokenStorage, 'user_123') === 'claim',
      'Storage indisponível deve permitir claim'
    );

    // setStoredLocalOwner não deve lançar com storage quebrado
    setStoredLocalOwner('user_123', brokenStorage);

    // Storage em memória normal
    const memoryMap = new Map<string, string>();
    const memStorage = {
      getItem: (k: string) => memoryMap.get(k) ?? null,
      setItem: (k: string, v: string) => memoryMap.set(k, v),
      removeItem: (k: string) => memoryMap.delete(k),
    };

    assert(getStoredLocalOwner(memStorage) === null, 'Novo storage deve iniciar sem dono');
    setStoredLocalOwner('user_abc', memStorage);
    assert(getStoredLocalOwner(memStorage) === 'user_abc', 'Dono gravado deve ser retornado');
    assert(memoryMap.get(LOCAL_OWNER_STORAGE_KEY) === 'user_abc', 'Chave correta no storage');
    setStoredLocalOwner(null, memStorage);
    assert(getStoredLocalOwner(memStorage) === null, 'Dono removido quando null');

    console.log('  ✅ decideOwnership validado para claim, same, conflict e storage indisponível.');
  }

  // =========================================================================
  // 2. Testes de canPushItem
  // =========================================================================
  console.log('\n--- 2. Testando canPushItem ---');
  {
    // Item sem dono (null, undefined, vazio) -> true (preserva dados anônimos pré-login)
    assert(canPushItem(null, 'user_A') === true, 'null ownerUid pode subir para usuário logado');
    assert(canPushItem(undefined, 'user_A') === true, 'undefined ownerUid pode subir para usuário logado');
    assert(canPushItem('', 'user_A') === true, 'ownerUid vazio pode subir para usuário logado');

    // Mesmo uid -> true
    assert(canPushItem('user_A', 'user_A') === true, 'mesmo ownerUid deve retornar true');

    // Outro uid -> false (impede contaminação cruzada)
    assert(canPushItem('user_A', 'user_B') === false, 'ownerUid diferente do usuário logado deve retornar false');

    console.log('  ✅ canPushItem validado para sem dono, mesmo uid, outro uid e undefined.');
  }

  // =========================================================================
  // 3. Teste de Integração: Cenário (d)
  // Fila com itens do dono "A" processada com uid "B" não envia nenhum item e
  // não os remove; processada com uid "A" envia normalmente.
  // =========================================================================
  console.log('\n--- 3. Testando Cenário (d) de Isolamento da Fila ---');
  {
    const testDb = new FinFlowDatabase(`TestLocalOwnershipDB_${Date.now()}`);
    const queueRepo = new IndexedDBSyncQueueRepository(testDb);
    const queue = new SyncQueue(queueRepo, 50, 500);

    // Enfileira dois itens pertencentes à Conta A
    const item1 = await queue.enqueue({
      operationId: 'op_tx_1',
      entityName: 'transactions',
      entityId: 'tx_1',
      action: 'create',
      payload: { id: 'tx_1', description: 'Transação da Conta A', amount: 150 },
      ownerUid: 'user_A',
    });
    assert(item1 !== null, 'Item 1 da Conta A deve ser enfileirado');
    assert(item1!.ownerUid === 'user_A', 'Item 1 deve conter ownerUid user_A');

    const item2 = await queue.enqueue({
      operationId: 'op_acc_1',
      entityName: 'accounts',
      entityId: 'acc_1',
      action: 'create',
      payload: { id: 'acc_1', name: 'Banco da Conta A' },
      ownerUid: 'user_A',
    });
    assert(item2 !== null, 'Item 2 da Conta A deve ser enfileirado');
    assert(item2!.ownerUid === 'user_A', 'Item 2 deve conter ownerUid user_A');

    const initialQueueCount = await queue.count();
    assert(initialQueueCount === 2, 'Fila deve conter exatamente 2 itens pendentes da Conta A');

    // Configura CloudSyncProvider com usuário B autenticado
    const fakeCloud = new FakeCloudProvider('user_B');

    const syncService = new FinancialSyncService({
      repositories: {
        transactions: new IndexedDBTransactionRepository(testDb),
        accounts: new IndexedDBAccountRepository(testDb),
        creditCards: new IndexedDBCreditCardRepository(testDb),
        investments: new IndexedDBInvestmentRepository(testDb),
        goals: new IndexedDBGoalRepository(testDb),
        budgets: new IndexedDBBudgetRepository(testDb),
        categories: new IndexedDBCategoryRepository(testDb),
        installmentPlans: new IndexedDBInstallmentPlanRepository(testDb),
      },
      syncQueue: queue,
      conflictResolver: new ConflictResolver(),
      cloudProvider: fakeCloud,
      autoProcessQueue: false,
    });

    // Passo 1: Executa o processamento da fila sob a conta "user_B"
    await syncService.processQueue();

    // Verificações para a conta B:
    assert(
      fakeCloud.pushedItems.length === 0,
      'Nenhum item da conta A deve ser enviado para a nuvem da conta B'
    );
    const countAfterAttemptB = await queue.count();
    assert(
      countAfterAttemptB === 2,
      'Os itens da conta A NÃO podem ser removidos da fila quando executados com a conta B'
    );

    // Passo 2: Troca a autenticação para a conta original "user_A"
    fakeCloud.setUserId('user_A');

    // Executa o processamento da fila sob a conta "user_A"
    await syncService.processQueue();

    // Verificações para a conta A:
    assert(
      fakeCloud.pushedItems.length === 2,
      'Todos os itens da conta A devem ser enviados normalmente quando o usuário for user_A'
    );
    const countAfterAttemptA = await queue.count();
    assert(
      countAfterAttemptA === 0,
      'Após o envio bem-sucedido para a conta A, a fila deve estar completamente vazia'
    );

    console.log('  ✅ Cenário (d) validado com sucesso: nenhum vazamento para user_B e sincronização completa para user_A.');
  }

  console.log('\n🎉 Todos os testes de Local Ownership passaram com sucesso!');
}

runTests().catch(err => {
  console.error('\n❌ Falha nos testes de Local Ownership:', err);
  process.exit(1);
});
