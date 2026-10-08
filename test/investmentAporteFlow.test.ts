import assert from 'node:assert';
import { InvestmentAsset, InvestmentTransaction, Transaction, Account, Category } from '../src/types/finance';
import {
  validateAporteParams,
  prepareAportePlan,
  checkAporteIdempotency,
  ExecuteAporteParams,
  PreparedAportePlan
} from '../src/domain/investmentAporte';
import { calculateAportePosition } from '../src/domain/investments';
import { calculateTransactionTotal } from '../src/domain/investmentTransactions';
import {
  PendingSyncOperation,
  SyncStatus,
  enqueueOperation,
  dequeueOperation
} from '../src/domain/sync';

console.log('--- INICIANDO TESTES DO FLUXO DE APORTE E CONSISTÊNCIA (ETAPA 9.6B) ---');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res.then(() => {
        console.log(`✅ PASS: ${name}`);
        passed++;
      }).catch(err => {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        failed++;
      });
    } else {
      console.log(`✅ PASS: ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

// =========================================================================
// MOCK APORTE ENGINE (Simulação fiel do FinanceContext com injeção de falhas)
// =========================================================================
interface MockContextState {
  investments: InvestmentAsset[];
  investmentTransactions: InvestmentTransaction[];
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  pendingQueue: PendingSyncOperation[];
  syncStatus: SyncStatus;
  syncError: string | null;
  localStorageStore: Record<string, string>;
  firestoreSimulatedDocs: Record<string, any>;
  failLocalPersistence?: boolean;
  failFirestoreBatch?: boolean;
}

function createMockAporteEngine(initialOverrides?: Partial<MockContextState>) {
  const state: MockContextState = {
    investments: [
      {
        id: 'inv-petr4',
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'stock',
        quantity: 100,
        averagePrice: 30.00,
        currentPrice: 35.00,
        currency: 'BRL',
        autoUpdate: false,
        createdAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'inv-vale3',
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'stock',
        quantity: 200,
        averagePrice: 60.00,
        currentPrice: 65.00,
        currency: 'BRL',
        autoUpdate: false,
        createdAt: '2026-01-01T00:00:00Z'
      }
    ],
    investmentTransactions: [],
    transactions: [],
    accounts: [
      {
        id: 'acc-nubank',
        name: 'Nubank',
        bankName: 'Nubank',
        type: 'checking',
        color: '#8b5cf6',
        icon: 'Landmark',
        initialBalance: 10000.00,
        currentBalance: 10000.00
      }
    ],
    categories: [
      { id: 'cat-invest', name: 'Investimentos', icon: 'TrendingUp', color: '#10b981', type: 'expense' },
      { id: 'cat-outros', name: 'Outros', icon: 'MoreHorizontal', color: '#64748b', type: 'expense' }
    ],
    pendingQueue: [],
    syncStatus: 'synced',
    syncError: null,
    localStorageStore: {},
    firestoreSimulatedDocs: {},
    ...initialOverrides
  };

  async function executeAporte(params: ExecuteAporteParams): Promise<{ transactionId: string; debitTransactionId?: string }> {
    // 1. Pré-validação
    const validation = validateAporteParams(params, state.investments, state.accounts);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Parâmetros de aporte inválidos.');
    }

    const targetAsset = state.investments.find(a => a.id === params.assetId)!;
    const investCat = state.categories.find(c => c.id === 'cat-invest' || c.name.toLowerCase().includes('invest'));
    const categoryId = investCat ? investCat.id : 'cat-outros';

    // 2. Prepara o plano
    const plan = prepareAportePlan(params, targetAsset, categoryId);

    // 3. Verificação de idempotência
    const idempotency = checkAporteIdempotency(
      plan.itxId,
      plan.debitTxId,
      targetAsset.id,
      plan.newQuantity,
      state.investmentTransactions,
      state.transactions,
      state.investments
    );

    if (idempotency.alreadyFullyExecuted) {
      return { transactionId: plan.itxId, debitTransactionId: plan.debitTxId };
    }

    // 4. Snapshots locais para rollback
    const prevInvestments = [...state.investments];
    const prevInvestmentTxs = [...state.investmentTransactions];
    const prevTransactions = [...state.transactions];

    try {
      if (state.failLocalPersistence) {
        throw new Error('Simulated LocalStorage QuotaExceededError');
      }

      // Atualizações locais coordenadas
      const nextInvestmentTxs = !idempotency.itxExists
        ? [plan.newInvestmentTransaction, ...prevInvestmentTxs.filter(t => t.id !== plan.itxId)]
        : prevInvestmentTxs;

      const nextInvestments = !idempotency.assetAlreadyUpdated
        ? prevInvestments.map(inv => inv.id === targetAsset.id ? plan.updatedAsset : inv)
        : prevInvestments;

      const nextTransactions = (plan.newDebitTransaction && !idempotency.debitExists)
        ? [plan.newDebitTransaction, ...prevTransactions.filter(t => t.id !== plan.debitTxId)]
        : prevTransactions;

      state.investmentTransactions = nextInvestmentTxs;
      state.investments = nextInvestments;
      if (plan.newDebitTransaction && !idempotency.debitExists) {
        state.transactions = nextTransactions;
      }

      state.localStorageStore['investment_transactions'] = JSON.stringify(nextInvestmentTxs);
      state.localStorageStore['investments'] = JSON.stringify(nextInvestments);
      if (plan.newDebitTransaction) {
        state.localStorageStore['transactions'] = JSON.stringify(nextTransactions);
      }
    } catch (localErr) {
      // Rollback local
      state.investments = prevInvestments;
      state.investmentTransactions = prevInvestmentTxs;
      state.transactions = prevTransactions;
      throw new Error(`Falha ao registrar aporte localmente: ${localErr instanceof Error ? localErr.message : String(localErr)}`);
    }

    // 5. Persistência atômica no Firestore / Cloud Sync
    const itxPayload = plan.newInvestmentTransaction;
    const assetPayload = {
      quantity: plan.newQuantity,
      averagePrice: plan.newAveragePrice,
      lastPriceUpdate: plan.updatedAsset.lastPriceUpdate
    };
    const debitPayload = plan.newDebitTransaction;

    try {
      if (state.failFirestoreBatch) {
        throw new Error('Simulated Firestore Network Offline');
      }

      // Simula commit atômico do batch no Firestore
      state.firestoreSimulatedDocs[`investmentTransactions/${plan.itxId}`] = itxPayload;
      state.firestoreSimulatedDocs[`investments/${targetAsset.id}`] = assetPayload;
      if (debitPayload) {
        state.firestoreSimulatedDocs[`transactions/${plan.debitTxId}`] = debitPayload;
      }

      state.pendingQueue = dequeueOperation(state.pendingQueue, 'investmentTransactions', plan.itxId);
      state.pendingQueue = dequeueOperation(state.pendingQueue, 'investments', targetAsset.id);
      if (plan.debitTxId) {
        state.pendingQueue = dequeueOperation(state.pendingQueue, 'transactions', plan.debitTxId);
      }
      state.syncStatus = 'synced';
      state.syncError = null;
    } catch (cloudErr) {
      // Em falha na nuvem, enfileira ordenadamente no Sync Engine sem quebrar dados locais
      const errMsg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);

      if (!idempotency.itxExists) {
        state.pendingQueue = enqueueOperation(state.pendingQueue, {
          collection: 'investmentTransactions',
          docId: plan.itxId,
          type: 'set',
          payload: itxPayload,
          lastError: errMsg
        });
      }
      if (!idempotency.assetAlreadyUpdated) {
        state.pendingQueue = enqueueOperation(state.pendingQueue, {
          collection: 'investments',
          docId: targetAsset.id,
          type: 'update',
          payload: assetPayload,
          lastError: errMsg
        });
      }
      if (debitPayload && !idempotency.debitExists) {
        state.pendingQueue = enqueueOperation(state.pendingQueue, {
          collection: 'transactions',
          docId: plan.debitTxId!,
          type: 'set',
          payload: debitPayload,
          lastError: errMsg
        });
      }

      state.syncStatus = 'error';
      state.syncError = 'Aporte salvo localmente. Aguardando conexão para sincronizar com a nuvem.';
    }

    return { transactionId: plan.itxId, debitTransactionId: plan.debitTxId };
  }

  return { state, executeAporte };
}

// =========================================================================
// 1. TESTE: APORTE COM SUCESSO (COM CONTA BANCÁRIA)
// =========================================================================
runTest('1. Aporte com sucesso e débito bancário atualiza todas as 3 entidades de forma consistente', async () => {
  const { state, executeAporte } = createMockAporteEngine();

  // PETR4 tem 100 cotas a R$ 30,00 (custo = R$ 3.000,00)
  // Novo aporte: 50 cotas a R$ 36,00 (total = R$ 1.800,00)
  // Nova posição esperada: 150 cotas a R$ 32,00 ((3000 + 1800) / 150 = 32.00)
  const result = await executeAporte({
    assetId: 'inv-petr4',
    quantity: 50,
    price: 36.00,
    date: '2026-10-06',
    sourceAccountId: 'acc-nubank',
    notes: 'Aporte mensal planejado'
  });

  assert(result.transactionId.startsWith('itx-'), 'Retorna transactionId válido com prefixo itx-');
  assert(result.debitTransactionId?.startsWith('tx-'), 'Retorna debitTransactionId válido com prefixo tx-');

  // Verifica InvestmentTransaction
  assert.strictEqual(state.investmentTransactions.length, 1);
  const itx = state.investmentTransactions[0];
  assert.strictEqual(itx.id, result.transactionId);
  assert.strictEqual(itx.assetId, 'inv-petr4');
  assert.strictEqual(itx.type, 'buy');
  assert.strictEqual(itx.quantity, 50);
  assert.strictEqual(itx.price, 36.00);
  assert.strictEqual(itx.totalAmount, 1800.00);

  // Verifica InvestmentAsset
  const petr4 = state.investments.find(a => a.id === 'inv-petr4')!;
  assert.strictEqual(petr4.quantity, 150);
  assert.strictEqual(petr4.averagePrice, 32.00);

  // Verifica Transaction bancária
  assert.strictEqual(state.transactions.length, 1);
  const debitTx = state.transactions[0];
  assert.strictEqual(debitTx.id, result.debitTransactionId);
  assert.strictEqual(debitTx.amount, 1800.00);
  assert.strictEqual(debitTx.accountId, 'acc-nubank');
  assert.strictEqual(debitTx.type, 'expense');

  // Verifica Firestore atômico
  assert.strictEqual(state.syncStatus, 'synced');
  assert(state.firestoreSimulatedDocs[`investmentTransactions/${itx.id}`] !== undefined);
  assert(state.firestoreSimulatedDocs[`investments/inv-petr4`].quantity === 150);
  assert(state.firestoreSimulatedDocs[`transactions/${debitTx.id}`].amount === 1800.00);
});

// =========================================================================
// 2. TESTE: APORTE SEM CONTA BANCÁRIA
// =========================================================================
runTest('2. Aporte sem conta bancária atualiza apenas ativo e ledger sem criar débito financeiro', async () => {
  const { state, executeAporte } = createMockAporteEngine();

  // VALE3 tem 200 cotas a R$ 60,00 (custo = R$ 12.000,00)
  // Novo aporte: 50 cotas a R$ 70,00 (total = R$ 3.500,00)
  // Nova posição esperada: 250 cotas a R$ 62,00 ((12000 + 3500) / 250 = 62.00)
  const result = await executeAporte({
    assetId: 'inv-vale3',
    quantity: 50,
    price: 70.00,
    date: '2026-10-06'
    // Sem sourceAccountId
  });

  assert(result.transactionId.startsWith('itx-'), 'Retorna transactionId válido');
  assert.strictEqual(result.debitTransactionId, undefined, 'Sem debitTransactionId');

  assert.strictEqual(state.investmentTransactions.length, 1);
  assert.strictEqual(state.transactions.length, 0, 'Nenhuma transação bancária criada');

  const vale3 = state.investments.find(a => a.id === 'inv-vale3')!;
  assert.strictEqual(vale3.quantity, 250);
  assert.strictEqual(vale3.averagePrice, 62.00);
});

// =========================================================================
// 3. TESTE: FALHAS ANTES DA PERSISTÊNCIA (VALIDAÇÃO PRE-FLIGHT)
// =========================================================================
runTest('3. Falha antes da persistência não altera nenhum estado local ou remoto', async () => {
  const { state, executeAporte } = createMockAporteEngine();

  // Caso 3a: Ativo inexistente
  let err1: any = null;
  try {
    await executeAporte({
      assetId: 'inv-nao-existe',
      quantity: 10,
      price: 20,
      date: '2026-10-06'
    });
  } catch (e) { err1 = e; }
  assert(err1 !== null, 'Rejeita ativo inexistente');
  assert.strictEqual(state.investmentTransactions.length, 0);

  // Caso 3b: Quantidade <= 0
  let err2: any = null;
  try {
    await executeAporte({
      assetId: 'inv-petr4',
      quantity: 0,
      price: 20,
      date: '2026-10-06'
    });
  } catch (e) { err2 = e; }
  assert(err2 !== null, 'Rejeita quantidade zero');

  // Caso 3c: Preço <= 0
  let err3: any = null;
  try {
    await executeAporte({
      assetId: 'inv-petr4',
      quantity: 10,
      price: -5,
      date: '2026-10-06'
    });
  } catch (e) { err3 = e; }
  assert(err3 !== null, 'Rejeita preço negativo');

  // Caso 3d: Data inválida
  let err4: any = null;
  try {
    await executeAporte({
      assetId: 'inv-petr4',
      quantity: 10,
      price: 20,
      date: '2026-02-31' // 31 de fevereiro não existe
    });
  } catch (e) { err4 = e; }
  assert(err4 !== null, 'Rejeita data impossível no calendário');

  // Caso 3e: Conta bancária inexistente
  let err5: any = null;
  try {
    await executeAporte({
      assetId: 'inv-petr4',
      quantity: 10,
      price: 20,
      date: '2026-10-06',
      sourceAccountId: 'acc-inexistente'
    });
  } catch (e) { err5 = e; }
  assert(err5 !== null, 'Rejeita conta bancária que não existe');

  // Estado deve permanecer completamente limpo
  assert.strictEqual(state.investmentTransactions.length, 0);
  assert.strictEqual(state.transactions.length, 0);
  assert.strictEqual(state.investments[0].quantity, 100);
});

// =========================================================================
// 4. TESTE: FALHA NA SINCRONIZAÇÃO (FIRESTORE OFFLINE / ERRO DE REDE)
// =========================================================================
runTest('4. Falha na sincronização cloud preserva dados locais e enfileira todas as operações no Sync Engine', async () => {
  const { state, executeAporte } = createMockAporteEngine({
    failFirestoreBatch: true // Simula Firestore falhando no batch.commit
  });

  const result = await executeAporte({
    assetId: 'inv-petr4',
    quantity: 20,
    price: 35.00,
    date: '2026-10-06',
    sourceAccountId: 'acc-nubank'
  });

  // Estado local deve estar consistente
  assert.strictEqual(state.investmentTransactions.length, 1);
  assert.strictEqual(state.transactions.length, 1);
  const petr4 = state.investments.find(a => a.id === 'inv-petr4')!;
  assert.strictEqual(petr4.quantity, 120);

  // Status de sincronização deve indicar 'error'
  assert.strictEqual(state.syncStatus, 'error');
  assert(state.syncError !== null, 'Mensagem de erro de sync registrada');

  // Fila deve conter exatamente as 3 operações com IDs estáveis
  assert.strictEqual(state.pendingQueue.length, 3, '3 operações enfileiradas na fila de pendências');
  const itxOp = state.pendingQueue.find(op => op.collection === 'investmentTransactions');
  const assetOp = state.pendingQueue.find(op => op.collection === 'investments');
  const debitOp = state.pendingQueue.find(op => op.collection === 'transactions');

  assert(itxOp !== undefined && itxOp.docId === result.transactionId, 'Operação do ledger enfileirada');
  assert(assetOp !== undefined && assetOp.docId === 'inv-petr4', 'Operação do ativo enfileirada');
  assert(debitOp !== undefined && debitOp.docId === result.debitTransactionId, 'Operação de débito enfileirada');
});

// =========================================================================
// 5. TESTE: TENTATIVA DE RETRY (IDEMPOTÊNCIA)
// =========================================================================
runTest('5. Retry com a mesma chave idempotente não duplica a compra nem o débito bancário', async () => {
  const { state, executeAporte } = createMockAporteEngine();

  const idempotencyKey = 'sessao-aporte-abc-123';

  // 1ª execução
  const res1 = await executeAporte({
    assetId: 'inv-petr4',
    quantity: 10,
    price: 32.00,
    date: '2026-10-06',
    sourceAccountId: 'acc-nubank',
    idempotencyKey
  });

  assert.strictEqual(state.investmentTransactions.length, 1);
  assert.strictEqual(state.transactions.length, 1);
  assert.strictEqual(state.investments[0].quantity, 110);
  const firstAvgPrice = state.investments[0].averagePrice;

  // 2ª execução com MESMA chave (simulação de retry por timeout ou duplo clique do usuário)
  const res2 = await executeAporte({
    assetId: 'inv-petr4',
    quantity: 10,
    price: 32.00,
    date: '2026-10-06',
    sourceAccountId: 'acc-nubank',
    idempotencyKey
  });

  // Deve retornar o mesmo transactionId
  assert.strictEqual(res2.transactionId, res1.transactionId);
  assert.strictEqual(res2.debitTransactionId, res1.debitTransactionId);

  // NÃO pode duplicar compra no ledger
  assert.strictEqual(state.investmentTransactions.length, 1, 'Não duplicou a InvestmentTransaction');

  // NÃO pode duplicar débito na conta
  assert.strictEqual(state.transactions.length, 1, 'Não duplicou a Transaction de débito');

  // NÃO pode somar a quantidade do ativo novamente (permanece 110 e não vira 120)
  assert.strictEqual(state.investments[0].quantity, 110, 'Quantidade do ativo não foi incrementada novamente');
  assert.strictEqual(state.investments[0].averagePrice, firstAvgPrice, 'Preço médio não foi corrompido');
});

// =========================================================================
// 6. TESTE: CONSISTÊNCIA ENTRE LEDGER, ATIVO E TRANSAÇÃO BANCÁRIA
// =========================================================================
runTest('6. Consistência estrita de valores entre ledger, nova posição e extrato bancário', async () => {
  const { state, executeAporte } = createMockAporteEngine();

  const qty = 33;
  const price = 41.25;
  const expectedTotal = calculateTransactionTotal(qty, price); // 33 * 41.25 = 1361.25

  const res = await executeAporte({
    assetId: 'inv-petr4',
    quantity: qty,
    price: price,
    date: '2026-10-06',
    sourceAccountId: 'acc-nubank'
  });

  const itx = state.investmentTransactions.find(t => t.id === res.transactionId)!;
  const debit = state.transactions.find(t => t.id === res.debitTransactionId)!;
  const asset = state.investments.find(a => a.id === 'inv-petr4')!;

  // 1. TotalAmount do ledger é exatamente igual ao valor do débito bancário
  assert.strictEqual(itx.totalAmount, expectedTotal);
  assert.strictEqual(debit.amount, itx.totalAmount);

  // 2. Custo anterior (100 * 30 = 3000) + Aporte (1361.25) = 4361.25
  // Nova quantidade = 133
  // Novo preço médio = 4361.25 / 133 = 32.79
  const expectedPosition = calculateAportePosition(
    { quantity: 100, averagePrice: 30.00 },
    { quantity: qty, price: price }
  );
  assert.strictEqual(asset.quantity, expectedPosition.newQuantity);
  assert.strictEqual(asset.averagePrice, expectedPosition.newAveragePrice);
});

// =========================================================================
// 7. TESTE: ROLLBACK LOCAL EM CASO DE ERRO INESPERADO
// =========================================================================
runTest('7. Rollback local em caso de erro na persistência restaura snapshot sem dados órfãos', async () => {
  const { state, executeAporte } = createMockAporteEngine({
    failLocalPersistence: true // Simula falha ao gravar no localStorage
  });

  let errorThrown = false;
  try {
    await executeAporte({
      assetId: 'inv-petr4',
      quantity: 50,
      price: 36.00,
      date: '2026-10-06',
      sourceAccountId: 'acc-nubank'
    });
  } catch (err: any) {
    errorThrown = true;
    assert(err.message.includes('Falha ao registrar aporte localmente'), 'Mensagem informativa de rollback');
  }

  assert(errorThrown, 'Erro capturado');

  // Estado deve ter sido restaurado para o estado inicial
  assert.strictEqual(state.investmentTransactions.length, 0, 'Ledger vazio após rollback');
  assert.strictEqual(state.transactions.length, 0, 'Extrato vazio após rollback');
  assert.strictEqual(state.investments[0].quantity, 100, 'Quantidade do ativo restaurada');
  assert.strictEqual(state.investments[0].averagePrice, 30.00, 'Preço médio restaurado');
});

// =========================================================================
// RESUMO FINAL
// =========================================================================
setTimeout(() => {
  console.log('\n======================================================');
  console.log(`Resultado Final dos Testes do Fluxo de Aporte (Etapa 9.6B): ${passed} passaram, ${failed} falharam.`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}, 50);
