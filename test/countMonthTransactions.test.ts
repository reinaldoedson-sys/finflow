import { countMonthTransactions } from '../src/domain/transactions';
import type { Transaction } from '../src/types/finance';

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

function runTests() {
  console.log('--- TESTES: CONTAGEM DE TRANSAÇÕES DO MÊS (countMonthTransactions) ---');

  // Caso 1: Mês com lançamentos
  {
    const sampleTxs = [
      { id: '1', date: '2026-11-03', description: 'Supermercado', amount: 150 },
      { id: '2', date: '2026-11-15', description: 'Salário', amount: 5000 },
      { id: '3', date: '2026-11-28', description: 'Internet Fibra', amount: 120 }
    ] as Transaction[];

    const count = countMonthTransactions(sampleTxs, '2026-11');
    assert(count === 3, `Mês com 3 lançamentos retorna 3 (obtido: ${count})`);
  }

  // Caso 2: Mês vazio
  {
    const sampleTxs = [
      { id: '1', date: '2026-11-03', description: 'Supermercado', amount: 150 },
      { id: '2', date: '2026-11-15', description: 'Salário', amount: 5000 }
    ] as Transaction[];

    const countEmptyMonth = countMonthTransactions(sampleTxs, '2026-12');
    assert(countEmptyMonth === 0, `Mês sem lançamentos (2026-12) retorna 0 (obtido: ${countEmptyMonth})`);

    const countEmptyArray = countMonthTransactions([], '2026-11');
    assert(countEmptyArray === 0, `Array vazio [] retorna 0 (obtido: ${countEmptyArray})`);
  }

  // Caso 3: Lançamentos de meses diferentes
  {
    const multiMonthTxs = [
      { id: '1', date: '2026-09-10', description: 'Conta Antiga', amount: 50 },
      { id: '2', date: '2026-10-05', description: 'Farmácia Outubro', amount: 80 },
      { id: '3', date: '2026-10-22', description: 'Restaurante Outubro', amount: 110 },
      { id: '4', date: '2026-11-01', description: 'Aluguel Novembro', amount: 2000 },
      { id: '5', date: '2026-12-25', description: 'Presente Dezembro', amount: 300 }
    ] as Transaction[];

    const countOct = countMonthTransactions(multiMonthTxs, '2026-10');
    assert(countOct === 2, `Lançamentos de meses diferentes: conta somente os 2 de 2026-10 (obtido: ${countOct})`);

    const countNov = countMonthTransactions(multiMonthTxs, '2026-11');
    assert(countNov === 1, `Lançamentos de meses diferentes: conta somente o 1 de 2026-11 (obtido: ${countNov})`);
  }

  // Caso 4: Parcelas futuras que NÃO entram na contagem do mês atual
  {
    // Cenário real: 2 lançamentos comuns em novembro/2026
    const baseTxs: Transaction[] = [
      { id: 'tx-1', date: '2026-11-05', description: 'Padaria', amount: 30 } as Transaction,
      { id: 'tx-2', date: '2026-11-10', description: 'Combustível', amount: 200 } as Transaction
    ];

    // Financiamento de veículo em 34 parcelas começando em 10/12/2026 e terminando em 10/09/2029
    const carInstallments: Transaction[] = [];
    for (let i = 0; i < 34; i++) {
      // 2026-12 + i meses
      const date = new Date(2026, 11 + i, 10);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      carInstallments.push({
        id: `inst-${i + 1}`,
        date: `${y}-${m}-${d}`,
        description: `Financiamento do carro (${i + 1}/34)`,
        amount: 850,
        installmentPlanId: 'plan-car'
      } as Transaction);
    }

    // Total de 36 transações carregadas em memória
    const allMemoryTxs = [...baseTxs, ...carInstallments];
    assert(allMemoryTxs.length === 36, `Total em memória possui 36 transações (2 do mês + 34 futuras)`);

    // Contagem para o mês vigente (2026-11): deve contar APENAS as 2 do mês atual
    const countNov2026 = countMonthTransactions(allMemoryTxs, '2026-11');
    assert(
      countNov2026 === 2,
      `Parcelas futuras de 2026-12 a 2029-09 NÃO entram na contagem de 2026-11 (esperado: 2, obtido: ${countNov2026})`
    );

    // Contagem para o mês da 1ª parcela (2026-12): deve contar exatamente 1
    const countDec2026 = countMonthTransactions(allMemoryTxs, '2026-12');
    assert(
      countDec2026 === 1,
      `Em 2026-12 deve constar exatamente 1 parcela (esperado: 1, obtido: ${countDec2026})`
    );

    // Contagem para um mês distante no meio do plano (2028-06): deve contar 1
    const countJun2028 = countMonthTransactions(allMemoryTxs, '2028-06');
    assert(
      countJun2028 === 1,
      `Em 2028-06 deve constar exatamente 1 parcela correspondente (esperado: 1, obtido: ${countJun2028})`
    );
  }

  // Caso 5: Casos extremos e robustez de parâmetros
  {
    assert(countMonthTransactions(null, '2026-11') === 0, 'transactions null retorna 0');
    assert(countMonthTransactions(undefined, '2026-11') === 0, 'transactions undefined retorna 0');
    assert(countMonthTransactions([], '2026-11') === 0, 'transactions vazio retorna 0');
    assert(countMonthTransactions([{ date: '2026-11-01' }], '') === 0, 'yearMonth vazio retorna 0');
    assert(countMonthTransactions([{ date: '2026-11-01' }], null) === 0, 'yearMonth null retorna 0');
    assert(countMonthTransactions([{ date: '2026-11-01' }], undefined) === 0, 'yearMonth undefined retorna 0');
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
