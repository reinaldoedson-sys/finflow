import { calculateGoalBalance, GoalMovement } from '../src/domain/calculations';
import { toCents, fromCents } from '../src/domain/money';

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

console.log('--- INICIANDO TESTES DO MODELO DE LEDGER DE METAS (ETAPA 6) ---');

// =========================================================================
// TESTE 1: Meta sem movimentos preserva o saldo inicial
// =========================================================================
{
  const initialAmount = 1000.00;
  const movements: GoalMovement[] = [];
  const balance = calculateGoalBalance(initialAmount, movements);

  assert(balance === 1000.00, `Teste 1: Saldo sem movimentos é igual ao inicial (esperado: 1000, obtido: ${balance})`);
}

// =========================================================================
// TESTE 2: Múltiplos aportes incrementam o saldo com precisão de centavos
// =========================================================================
{
  const initialAmount = 0;
  const movements: GoalMovement[] = [
    { id: 'mov-1', goalId: 'goal-viagem', type: 'deposit', amount: 150.50, date: '2026-10-01', createdAt: '2026-10-01T10:00:00Z', notes: 'Primeiro aporte' },
    { id: 'mov-2', goalId: 'goal-viagem', type: 'deposit', amount: 300.25, date: '2026-10-15', createdAt: '2026-10-15T10:00:00Z', notes: 'Segundo aporte' },
    { id: 'mov-3', goalId: 'goal-viagem', type: 'deposit', amount: 49.25, date: '2026-10-20', createdAt: '2026-10-20T10:00:00Z' }
  ];

  // 150.50 + 300.25 + 49.25 = 500.00 exatos
  const balance = calculateGoalBalance(initialAmount, movements);
  assert(balance === 500.00, `Teste 2: Aportes acumulados com precisão de centavos (esperado: 500, obtido: ${balance})`);
}

// =========================================================================
// TESTE 3: Aportes e resgates (retiradas)
// =========================================================================
{
  const initialAmount = 2000.00;
  const movements: GoalMovement[] = [
    { id: 'mov-1', goalId: 'goal-carro', type: 'deposit', amount: 500.00, date: '2026-09-01', createdAt: '2026-09-01T10:00:00Z' },   // Saldo: 2500
    { id: 'mov-2', goalId: 'goal-carro', type: 'withdrawal', amount: 800.00, date: '2026-09-10', createdAt: '2026-09-10T10:00:00Z' },  // Resgate de 800 -> Saldo: 1700
    { id: 'mov-3', goalId: 'goal-carro', type: 'deposit', amount: 350.50, date: '2026-10-01', createdAt: '2026-10-01T10:00:00Z' }   // Saldo: 2050.50
  ];

  const balance = calculateGoalBalance(initialAmount, movements);
  assert(balance === 2050.50, `Teste 3: Resgate deduz do saldo com precisão (esperado: 2050.50, obtido: ${balance})`);
}

// =========================================================================
// TESTE 4: Resgate superior ao saldo acumulado não gera saldo negativo
// =========================================================================
{
  const initialAmount = 100.00;
  const movements: GoalMovement[] = [
    { id: 'mov-1', goalId: 'goal-emergencia', type: 'withdrawal', amount: 250.00, date: '2026-10-02', createdAt: '2026-10-02T10:00:00Z' }
  ];

  const balance = calculateGoalBalance(initialAmount, movements);
  assert(balance === 0, `Teste 4: Saldo da meta não fica negativo mesmo com resgate excessivo (esperado: 0, obtido: ${balance})`);
}

// =========================================================================
// TESTE 5: Isolamento de movimentos entre metas distintas
// =========================================================================
{
  const allMovements: GoalMovement[] = [
    { id: 'mov-1', goalId: 'goal-A', type: 'deposit', amount: 100.00, date: '2026-10-01', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'mov-2', goalId: 'goal-B', type: 'deposit', amount: 500.00, date: '2026-10-01', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'mov-3', goalId: 'goal-A', type: 'deposit', amount: 200.00, date: '2026-10-02', createdAt: '2026-10-02T10:00:00Z' }
  ];

  const goalAMovements = allMovements.filter(m => m.goalId === 'goal-A');
  const goalBMovements = allMovements.filter(m => m.goalId === 'goal-B');

  const balanceA = calculateGoalBalance(0, goalAMovements);
  const balanceB = calculateGoalBalance(0, goalBMovements);

  assert(balanceA === 300.00, `Teste 5: Saldo da Meta A isolado (esperado: 300, obtido: ${balanceA})`);
  assert(balanceB === 500.00, `Teste 5: Saldo da Meta B isolado (esperado: 500, obtido: ${balanceB})`);
}

console.log(`\nResultado Final dos Testes do Ledger de Metas: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}
