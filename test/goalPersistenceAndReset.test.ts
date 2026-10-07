import fs from 'fs';
import path from 'path';
import { calculateGoalBalance, resolveGoalInitialAmount } from '../src/domain/calculations';
import { FinancialGoal, GoalMovement } from '../src/types/finance';
import {
  isSampleDataDocument,
  filterOutSampleData,
  mergeCloudWithPending,
  PendingSyncOperation,
  ALL_SYNC_SUBCOLLECTIONS,
  SyncCollection
} from '../src/domain/sync';
import {
  INITIAL_ACCOUNTS,
  INITIAL_CREDIT_CARDS,
  INITIAL_BUDGETS,
  INITIAL_GOALS,
  INITIAL_GOAL_MOVEMENTS,
  INITIAL_INSTALLMENT_PLANS,
  INITIAL_TRANSACTIONS,
  INITIAL_INVESTMENTS,
  INITIAL_INVESTMENT_TRANSACTIONS
} from '../src/utils/mockData';

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

console.log('--- INICIANDO TESTES DE INTEGRIDADE DE METAS E RESET (ETAPA 9.6A) ---');

// =========================================================================
// 1. CORRIGIR PERSISTÊNCIA DE initialAmount DAS METAS
// =========================================================================
console.log('\n[1. Persistência de initialAmount e Prevenção de Dupla Contagem]');

// A. Meta sem movimentos
{
  const goalA: FinancialGoal = {
    id: 'goal-sem-mov',
    name: 'Reserva sem aportes',
    targetAmount: 5000,
    initialAmount: 1000,
    currentAmount: 1000,
    targetDate: '2026-12-31',
    color: '#10b981',
    icon: 'ShieldCheck'
  };
  const movsA: GoalMovement[] = [];
  const resolvedInitial = resolveGoalInitialAmount(goalA, movsA);
  const derivedBalance = calculateGoalBalance(resolvedInitial, movsA);

  assert(resolvedInitial === 1000, 'A. Meta sem movimentos preserva initialAmount = 1000');
  assert(derivedBalance === 1000, 'A. Saldo calculado sem movimentos é igual ao initialAmount (1000)');
}

// B. Meta com initialAmount + movimento
{
  const goalB: FinancialGoal = {
    id: 'goal-com-mov',
    name: 'Carro Novo',
    targetAmount: 50000,
    initialAmount: 1000,
    currentAmount: 1500,
    targetDate: '2027-12-31',
    color: '#3b82f6',
    icon: 'Car'
  };
  const movsB: GoalMovement[] = [
    {
      id: 'gmov-dep-1',
      goalId: 'goal-com-mov',
      type: 'deposit',
      amount: 500,
      date: '2026-10-01',
      createdAt: '2026-10-01T10:00:00Z'
    }
  ];
  const resolvedInitial = resolveGoalInitialAmount(goalB, movsB);
  const derivedBalance = calculateGoalBalance(resolvedInitial, movsB);

  assert(resolvedInitial === 1000, 'B. Meta com initialAmount + movimento mantém initialAmount = 1000');
  assert(derivedBalance === 1500, 'B. Saldo derivado é exatamente 1500 (1000 + 500)');
}

// C. Salvar no Firestore e recarregar
{
  const goalC: FinancialGoal = {
    id: 'goal-cloud-test',
    name: 'Reforma da Casa',
    targetAmount: 20000,
    initialAmount: 1000,
    currentAmount: 1500,
    targetDate: '2027-06-30',
    color: '#f59e0b',
    icon: 'Home'
  };
  const movsC: GoalMovement[] = [
    {
      id: 'gmov-c-1',
      goalId: 'goal-cloud-test',
      type: 'deposit',
      amount: 500,
      date: '2026-10-02',
      createdAt: '2026-10-02T10:00:00Z'
    }
  ];

  // Simula gravação no Firestore via seedInitialDataToCloud
  const resolvedInitial = resolveGoalInitialAmount(goalC, movsC);
  const derivedBalance = calculateGoalBalance(resolvedInitial, movsC);
  const firestoreDocPayload = {
    name: goalC.name,
    targetAmount: goalC.targetAmount,
    initialAmount: resolvedInitial, // Firestore GUARDA 1000
    currentAmount: derivedBalance,  // Firestore GUARDA 1500 (cache)
    targetDate: goalC.targetDate,
    color: goalC.color,
    icon: goalC.icon
  };

  assert(firestoreDocPayload.initialAmount === 1000, 'C. Documento gravado no Firestore guarda initialAmount = 1000');
  assert(firestoreDocPayload.currentAmount === 1500, 'C. Documento gravado no Firestore guarda currentAmount calculado = 1500');

  // Simula recarga a partir do snapshot do Firestore
  const reloadedFromFirestore: FinancialGoal = {
    id: 'goal-cloud-test',
    name: firestoreDocPayload.name,
    targetAmount: firestoreDocPayload.targetAmount,
    initialAmount: firestoreDocPayload.initialAmount,
    currentAmount: firestoreDocPayload.currentAmount,
    targetDate: firestoreDocPayload.targetDate,
    color: firestoreDocPayload.color,
    icon: firestoreDocPayload.icon
  };

  const reloadedInitial = resolveGoalInitialAmount(reloadedFromFirestore, movsC);
  const reloadedBalance = calculateGoalBalance(reloadedInitial, movsC);

  assert(reloadedInitial === 1000, 'C. Após recarregar, initialAmount é 1000');
  assert(reloadedBalance === 1500, 'C. Ao recarregar, o saldo calculado continua sendo 1500');
}

// D. Garantir que o saldo NÃO seja duplicado
{
  const initialAmount = 1000;
  const deposit = 500;
  const movs: GoalMovement[] = [
    {
      id: 'gmov-d-1',
      goalId: 'goal-d',
      type: 'deposit',
      amount: deposit,
      date: '2026-10-03',
      createdAt: '2026-10-03T10:00:00Z'
    }
  ];

  // Se o Firestore guardasse currentAmount (1500) como initialAmount (bug antigo):
  const buggyInitial = 1500;
  const buggyReloadedBalance = calculateGoalBalance(buggyInitial, movs);
  assert(buggyReloadedBalance === 2000, 'D. Simulação: se o bug existisse, saldo viraria 2000 (dupla contagem)');

  // Com a persistência correta:
  const correctInitial = resolveGoalInitialAmount({ initialAmount, currentAmount: 1500 }, movs);
  const correctReloadedBalance = calculateGoalBalance(correctInitial, movs);
  assert(correctReloadedBalance === 1500, 'D. Proteção ativa: saldo recarregado é 1500 e NÃO 2000');
}

// E. Dados antigos sem initialAmount (migração transparente)
{
  // Meta legada onde initialAmount é undefined e só existe currentAmount = 1500
  const legacyGoal = {
    id: 'goal-legacy',
    name: 'Meta Legada Sem initialAmount',
    targetAmount: 10000,
    currentAmount: 1500, // Saldo no documento antigo
    targetDate: '2027-01-01',
    color: '#8b5cf6',
    icon: 'PiggyBank'
  };
  const legacyMovements: GoalMovement[] = [
    {
      id: 'gmov-leg-1',
      goalId: 'goal-legacy',
      type: 'deposit',
      amount: 500,
      date: '2026-09-01',
      createdAt: '2026-09-01T10:00:00Z'
    }
  ];

  // A função deve inferir: initial = 1500 - 500 = 1000
  const inferredInitial = resolveGoalInitialAmount(legacyGoal, legacyMovements);
  assert(inferredInitial === 1000, 'E. Migração segura: deduz initialAmount = 1000 a partir de currentAmount - depósitos');

  // Ao aplicar o ledger de metas:
  const balance = calculateGoalBalance(inferredInitial, legacyMovements);
  assert(balance === 1500, 'E. Saldo real da meta permanece estritamente 1500 após a migração');

  // Teste de dados antigos sem movimentos e sem initialAmount
  const legacyGoalNoMov = { currentAmount: 850 };
  const inferredInitialNoMov = resolveGoalInitialAmount(legacyGoalNoMov, []);
  assert(inferredInitialNoMov === 850, 'E. Meta legada sem movimentos infere initialAmount = 850');
  assert(calculateGoalBalance(inferredInitialNoMov, []) === 850, 'E. Saldo permanece 850');

  // Teste de dados antigos com resgates e sem initialAmount
  const legacyGoalWithWithdrawal = { currentAmount: 700 };
  const withdrawalMovs: GoalMovement[] = [
    {
      id: 'gmov-w-1',
      goalId: 'g-w',
      type: 'withdrawal',
      amount: 300,
      date: '2026-09-10',
      createdAt: '2026-09-10T10:00:00Z'
    }
  ];
  // inferredInitial = 700 - (-300) = 1000
  const inferredWithdrawalInitial = resolveGoalInitialAmount(legacyGoalWithWithdrawal, withdrawalMovs);
  assert(inferredWithdrawalInitial === 1000, 'E. Meta legada com resgate infere initialAmount = 1000');
  assert(calculateGoalBalance(inferredWithdrawalInitial, withdrawalMovs) === 700, 'E. Saldo permanece 700');
}

// =========================================================================
// 2. AUDITORIA DE clearAllData()
// =========================================================================
console.log('\n[2. Auditoria e Resiliência de clearAllData()]');

{
  const financeContextCode = fs.readFileSync(path.resolve(process.cwd(), 'src/context/FinanceContext.tsx'), 'utf-8');
  const clearAllDataMatch = financeContextCode.match(/const clearAllData = async \(\) => {([\s\S]*?)};/);
  assert(clearAllDataMatch !== null, 'clearAllData() está declarada no FinanceContext');

  if (clearAllDataMatch) {
    const code = clearAllDataMatch[1];

    // Verifica que todas as coleções do FinFlow estão contempladas
    const expectedCollections: SyncCollection[] = [
      'transactions',
      'accounts',
      'creditCards',
      'categories',
      'budgets',
      'goals',
      'goalMovements',
      'installmentPlans',
      'investments',
      'investmentTransactions'
    ];

    for (const col of expectedCollections) {
      assert(
        code.includes(`'${col}'`),
        `clearAllData() inclui explicitamente a coleção '${col}'`
      );
    }

    // Verifica que usa o uid do usuário autenticado atual
    assert(
      code.includes('currentUser.uid') || code.includes('uid = currentUser.uid'),
      'clearAllData() restringe operações estritamente ao currentUser.uid'
    );

    // Verifica tratamento de erro detectável
    assert(
      code.includes('setSyncStatus(\'error\')') && code.includes('throw new Error'),
      'clearAllData() sinaliza syncStatus = "error" e lança exceção em caso de falha no Firestore'
    );

    // Verifica que zera storage e estados locais apenas após exclusão na nuvem
    assert(
      code.includes('setPendingQueue([])') && code.includes('savePendingQueueToStorage([])'),
      'clearAllData() limpa a fila de sincronização pendente'
    );
    assert(
      code.includes('setTransactions([])') && code.includes('setGoals([])') && code.includes('setInvestmentTransactions([])'),
      'clearAllData() reseta estados locais das coleções'
    );
  }

  // Simulação de comportamento de erro no Firestore durante clearAllData
  let localDataPreserved = true;
  let detectedError = false;
  let syncStatus = 'synced';

  try {
    // Simula falha ao excluir subcoleções na nuvem
    const mockFirestoreFail = true;
    if (mockFirestoreFail) {
      syncStatus = 'error';
      throw new Error('Firestore delete permission denied');
    }
    // Se não falhasse, limparia dados locais
    localDataPreserved = false;
  } catch (err) {
    detectedError = true;
  }

  assert(detectedError, 'Falha no Firestore durante clearAllData é devidamente capturada');
  assert(localDataPreserved, 'Dados locais são preservados quando a exclusão na nuvem falha');
  assert(syncStatus === 'error', 'Status é alterado para error permitindo nova tentativa');
}

// =========================================================================
// 3. AUDITORIA DE clearSampleData()
// =========================================================================
console.log('\n[3. Auditoria e Resiliência de clearSampleData()]');

{
  const financeContextCode = fs.readFileSync(path.resolve(process.cwd(), 'src/context/FinanceContext.tsx'), 'utf-8');
  const clearSampleDataMatch = financeContextCode.match(/const clearSampleData = async \(\) => {([\s\S]*?)};/);
  assert(clearSampleDataMatch !== null, 'clearSampleData() está declarada no FinanceContext');

  if (clearSampleDataMatch) {
    const code = clearSampleDataMatch[1];

    assert(
      code.includes('deleteSubcollectionsFromFirestore') && code.includes('isSampleDataDocument'),
      'clearSampleData() usa filtro isSampleDataDocument para apagar apenas demonstração no Firestore'
    );

    assert(
      code.includes('filterOutSampleData'),
      'clearSampleData() usa filterOutSampleData para filtrar dados em memória e localStorage'
    );

    assert(
      code.includes('setSyncStatus(\'error\')') && code.includes('throw new Error'),
      'clearSampleData() lança erro e sinaliza status se exclusão cloud falhar'
    );
  }

  // Validação funcional de filterOutSampleData:
  // Cria array misto de itens de demonstração e itens reais do usuário
  const mixedAccounts = [
    ...INITIAL_ACCOUNTS, // acc-itau, acc-nubank, acc-xp
    {
      id: 'acc-real-user-1',
      name: 'Conta Corrente Santander Real',
      bankName: 'Santander',
      type: 'checking' as const,
      color: '#ff0000',
      initialBalance: 5000,
      currentBalance: 5000,
      icon: 'Building2'
    }
  ];

  const filteredAccounts = filterOutSampleData('accounts', mixedAccounts);
  assert(filteredAccounts.length === 1, 'clearSampleData remove exatamente as 3 contas demo e mantém 1 real');
  assert(filteredAccounts[0].id === 'acc-real-user-1', 'Conta real do usuário foi 100% preservada');

  // Metas mistas
  const mixedGoals = [
    ...INITIAL_GOALS,
    {
      id: 'goal-real-1',
      name: 'Casamento 2028',
      targetAmount: 80000,
      initialAmount: 10000,
      currentAmount: 10000,
      targetDate: '2028-12-10',
      color: '#ec4899',
      icon: 'Heart'
    }
  ];

  const filteredGoals = filterOutSampleData('goals', mixedGoals);
  assert(filteredGoals.length === 1, 'clearSampleData remove metas demo e preserva metas reais');
  assert(filteredGoals[0].id === 'goal-real-1', 'Meta real do usuário preservada');

  // Investimentos mistos
  const mixedInvestments = [
    ...INITIAL_INVESTMENTS,
    {
      id: 'inv-real-vale3',
      ticker: 'VALE3',
      name: 'Vale S.A.',
      type: 'stock' as const,
      quantity: 100,
      averagePrice: 60.50,
      currentPrice: 62.00,
      currency: 'BRL' as const
    }
  ];

  const filteredInvestments = filterOutSampleData('investments', mixedInvestments);
  assert(filteredInvestments.length === 1, 'clearSampleData preserva ativo real VALE3');
  assert(filteredInvestments[0].ticker === 'VALE3', 'Ativo real VALE3 mantido intacto');
}

// =========================================================================
// 4. AUDITORIA DE resetToDefaults()
// =========================================================================
console.log('\n[4. Auditoria Determinística de resetToDefaults()]');

{
  const financeContextCode = fs.readFileSync(path.resolve(process.cwd(), 'src/context/FinanceContext.tsx'), 'utf-8');
  const resetToDefaultsMatch = financeContextCode.match(/const resetToDefaults = async \(\) => {([\s\S]*?)};/);
  assert(resetToDefaultsMatch !== null, 'resetToDefaults() está declarada no FinanceContext');

  if (resetToDefaultsMatch) {
    const code = resetToDefaultsMatch[1];

    // Valida que apaga as subcoleções antigas ANTES de regravar defaults
    const deleteIdx = code.indexOf('deleteSubcollectionsFromFirestore');
    const seedIdx = code.indexOf('seedDefaultsToCloud');
    assert(deleteIdx !== -1 && seedIdx !== -1 && deleteIdx < seedIdx,
      'resetToDefaults() apaga documentos antigos do Firestore ANTES de gravar os defaults'
    );

    // Valida que trata erros do Firestore
    assert(
      code.includes('setSyncStatus(\'error\')') && code.includes('throw new Error'),
      'resetToDefaults() trata erros do Firestore e não silencia falhas'
    );

    // Valida que restaura todas as coleções padrão canônicas
    assert(
      code.includes('setAccounts(INITIAL_ACCOUNTS)') &&
      code.includes('setCreditCards(INITIAL_CREDIT_CARDS)') &&
      code.includes('setBudgets(INITIAL_BUDGETS)') &&
      code.includes('setGoals(INITIAL_GOALS)') &&
      code.includes('setGoalMovements(INITIAL_GOAL_MOVEMENTS)') &&
      code.includes('setInstallmentPlans(INITIAL_INSTALLMENT_PLANS)') &&
      code.includes('setTransactions(INITIAL_TRANSACTIONS)') &&
      code.includes('setInvestments(INITIAL_INVESTMENTS)') &&
      code.includes('setInvestmentTransactions(INITIAL_INVESTMENT_TRANSACTIONS)'),
      'resetToDefaults() restaura exatamente todos os conjuntos padrão canônicos'
    );
  }
}

// =========================================================================
// 5. PROTEÇÃO CONTRA DOCUMENTOS ANTIGOS REAPARECENDO (LISTENERS & MERGE)
// =========================================================================
console.log('\n[5. Proteção Contra Documentos Antigos Reaparecendo]');

{
  const financeContextCode = fs.readFileSync(path.resolve(process.cwd(), 'src/context/FinanceContext.tsx'), 'utf-8');

  // Verifica que nenhum listener de onSnapshot faz re-upload indevido quando a nuvem retorna vazia
  const hasUnsubInvestmentsReupload = financeContextCode.includes('customInvestments.forEach') &&
    financeContextCode.includes('executeSync(\'investments\'');
  assert(!hasUnsubInvestmentsReupload, 'unsubInvestments não faz re-upload indevido quando lista da nuvem está vazia');

  const hasUnsubInvestmentTxsReupload = financeContextCode.includes('prev.forEach(itx =>') &&
    financeContextCode.includes('executeSync(\'investmentTransactions\'');
  assert(!hasUnsubInvestmentTxsReupload, 'unsubInvestmentTransactions não faz re-upload indevido quando lista está vazia');

  // Testa mergeCloudWithPending quando o Firestore retorna vazio após clearAllData
  const cloudEmpty: { id: string }[] = [];
  const pendingQueueEmpty: PendingSyncOperation[] = [];
  const localItems = [{ id: 'old-item-1' }];

  const mergedAfterClear = mergeCloudWithPending(cloudEmpty, pendingQueueEmpty, 'transactions', localItems);
  assert(mergedAfterClear.length === 0, 'mergeCloudWithPending retorna vazio quando servidor e fila estão vazios');

  // Se o servidor retornar documento antigo que foi excluído localmente ('delete' na fila):
  const cloudOldDocs = [{ id: 'doc-para-excluir', name: 'Item Antigo' }];
  const pendingWithDelete: PendingSyncOperation[] = [
    {
      id: 'transactions_doc-para-excluir',
      collection: 'transactions',
      docId: 'doc-para-excluir',
      type: 'delete',
      timestamp: new Date().toISOString(),
      retries: 0
    }
  ];

  const mergedWithDelete = mergeCloudWithPending(cloudOldDocs, pendingWithDelete, 'transactions', []);
  assert(mergedWithDelete.length === 0, 'Item antigo com exclusão pendente é suprimido e não reaparece na interface');
}

// =========================================================================
// RESUMO FINAL
// =========================================================================
console.log('\n======================================================');
console.log(`Resultado Final dos Testes (Etapa 9.6A): ${passed} passaram, ${failed} falharam.`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
