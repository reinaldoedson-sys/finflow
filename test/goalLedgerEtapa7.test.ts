import { calculateGoalBalance } from '../src/domain/calculations';
import { GoalMovement, FinancialGoal } from '../src/types/finance';
import { generateId } from '../src/domain/id';
import { enqueueOperation, dequeueOperation, mergeCloudWithPending, SyncCollection } from '../src/domain/sync';

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

console.log('--- INICIANDO TESTES DO LEDGER DE METAS (ETAPA 7) ---');

// =========================================================================
// 1. GERAÇÃO DE ID E ESTRUTURA CANÔNICA
// =========================================================================
{
  const movId = generateId('gmov');
  assert(movId.startsWith('gmov-'), `ID gerado possui prefixo 'gmov-': ${movId}`);

  const deposit: GoalMovement = {
    id: movId,
    goalId: 'goal-viagem',
    type: 'deposit',
    amount: 150.50, // estritamente positivo
    date: '2026-10-04',
    createdAt: new Date().toISOString(),
    notes: 'Aporte mensal'
  };

  assert(deposit.amount > 0, 'Valor de depósito é estritamente positivo');
  assert(deposit.type === 'deposit', 'Tipo é deposit');
}

// =========================================================================
// 2. MIGRAÇÃO DE METAS EXISTENTES (CONSERVAÇÃO DO SALDO COM initialAmount)
// =========================================================================
{
  // Simulação de meta existente legada vinda do Firestore ou LocalStorage (sem initialAmount explícito)
  const legacyGoal = {
    id: 'goal-europa',
    name: 'Viagem Europa',
    targetAmount: 14000.00,
    currentAmount: 9200.00, // Saldo pré-migração
    targetDate: '2027-04-15',
    color: '#3b82f6',
    icon: 'Plane'
  };

  // Estratégia de migração: se initialAmount for indefinido, usar currentAmount
  const initial = typeof (legacyGoal as any).initialAmount === 'number'
    ? (legacyGoal as any).initialAmount
    : (typeof legacyGoal.currentAmount === 'number' ? legacyGoal.currentAmount : 0);

  const movements: GoalMovement[] = [];
  const balance = calculateGoalBalance(initial, movements);

  assert(balance === 9200.00, `Meta existente preservou R$ 9.200 como saldo inicial sem movimentos (obtido: ${balance})`);

  // Adicionando um novo depósito de R$ 500 no ledger
  const mov1: GoalMovement = {
    id: generateId('gmov'),
    goalId: 'goal-europa',
    type: 'deposit',
    amount: 500.00,
    date: '2026-10-04',
    createdAt: new Date().toISOString(),
    notes: 'Novo aporte pós-migração'
  };

  const balanceAfterDeposit = calculateGoalBalance(initial, [mov1]);
  assert(balanceAfterDeposit === 9700.00, `Saldo derivado após aporte: esperado 9700, obtido: ${balanceAfterDeposit}`);

  // Adicionando um resgate de R$ 200 no ledger
  const mov2: GoalMovement = {
    id: generateId('gmov'),
    goalId: 'goal-europa',
    type: 'withdrawal',
    amount: 200.00,
    date: '2026-10-05',
    createdAt: new Date().toISOString(),
    notes: 'Resgate para compra de passagem'
  };

  const balanceAfterWithdrawal = calculateGoalBalance(initial, [mov1, mov2]);
  assert(balanceAfterWithdrawal === 9500.00, `Saldo derivado após resgate: esperado 9500, obtido: ${balanceAfterWithdrawal}`);
}

// =========================================================================
// 3. NOVA META CRIADA DO ZERO
// =========================================================================
{
  const newGoal: FinancialGoal = {
    id: generateId('goal'),
    name: 'Carro Novo',
    targetAmount: 50000.00,
    initialAmount: 0,
    currentAmount: 0,
    targetDate: '2028-12-31',
    color: '#10b981',
    icon: 'Car'
  };

  assert(newGoal.initialAmount === 0, 'Nova meta inicia com initialAmount = 0');
  const balanceInit = calculateGoalBalance(newGoal.initialAmount!, []);
  assert(balanceInit === 0, 'Saldo derivado de nova meta sem movimentos é 0');

  const mov: GoalMovement = {
    id: generateId('gmov'),
    goalId: newGoal.id,
    type: 'deposit',
    amount: 1250.75,
    date: '2026-10-04',
    createdAt: new Date().toISOString()
  };

  const balanceWithMov = calculateGoalBalance(newGoal.initialAmount!, [mov]);
  assert(balanceWithMov === 1250.75, `Saldo após primeiro aporte: esperado 1250.75, obtido: ${balanceWithMov}`);
}

// =========================================================================
// 4. PRECISÃO DE CENTAVOS E RETIRADA SUPERIOR AO SALDO
// =========================================================================
{
  const initial = 100.00;
  const movements: GoalMovement[] = [
    { id: '1', goalId: 'g', type: 'deposit', amount: 33.33, date: '2026-10-01', createdAt: '...' },
    { id: '2', goalId: 'g', type: 'deposit', amount: 33.33, date: '2026-10-02', createdAt: '...' },
    { id: '3', goalId: 'g', type: 'deposit', amount: 33.34, date: '2026-10-03', createdAt: '...' },
  ];
  // 100 + 33.33 + 33.33 + 33.34 = 200.00 exatos
  const bal = calculateGoalBalance(initial, movements);
  assert(bal === 200.00, `Precisão de centavos perfeita (esperado 200, obtido: ${bal})`);

  // Resgate superior ao saldo acumulado não resulta em saldo negativo
  const excessiveWithdrawal: GoalMovement = {
    id: '4', goalId: 'g', type: 'withdrawal', amount: 500.00, date: '2026-10-04', createdAt: '...'
  };
  const balFloored = calculateGoalBalance(initial, [...movements, excessiveWithdrawal]);
  assert(balFloored === 0, `Saldo da meta possui piso de zero (não negativo): obtido ${balFloored}`);
}

// =========================================================================
// 5. INTEGRAÇÃO COM A FILA DE SINCRONIZAÇÃO (ETAPA 5)
// =========================================================================
{
  let queue: any[] = [];
  const col: SyncCollection = 'goalMovements';
  const movId = 'gmov-offline-test';

  // Simulação de gravação offline de uma movimentação
  queue = enqueueOperation(queue, {
    collection: col,
    docId: movId,
    type: 'set',
    payload: {
      goalId: 'goal-1',
      type: 'deposit',
      amount: 450.00,
      date: '2026-10-04'
    },
    lastError: 'Network unreachable'
  });

  assert(queue.length === 1, 'Movimentação offline enfileirada na fila de sincronização');
  assert(queue[0].id === 'goalMovements_gmov-offline-test', 'ID estável da operação na fila gerado corretamente');

  // Snapshot do servidor chega enquanto offline: mergeCloudWithPending não descarta a movimentação pendente
  const serverMovs: GoalMovement[] = [
    { id: 'gmov-server-1', goalId: 'goal-1', type: 'deposit', amount: 100.00, date: '2026-09-01', createdAt: '...' }
  ];
  const merged = mergeCloudWithPending(serverMovs, queue, col, []);
  assert(merged.some(m => m.id === movId), 'Movimentação offline preservada após fusão com snapshot do servidor');
  assert(merged.some(m => m.id === 'gmov-server-1'), 'Movimentação prévia do servidor mantida');

  // Simulação de retry bem sucedido: operação desenfileirada
  queue = dequeueOperation(queue, col, movId);
  assert(queue.length === 0, 'Fila de sincronização limpa após confirmação de envio');
}

console.log(`\nResultado Final dos Testes do Ledger Etapa 7: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}
