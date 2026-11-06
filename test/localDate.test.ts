import {
  toLocalISODate,
  todayLocalISO,
  addDaysLocalISO,
  toLocalYearMonth
} from '../src/utils/localDate';

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
  console.log('--- TESTES: UTILITÁRIOS DE DATA LOCAL (localDate.ts) EM FUSO LOCAL ---\n');

  console.log('[1] toLocalISODate com horários locais extremos (fim e início do dia):');
  {
    // 2026-11-06 às 22:30: Em UTC-3 isso já é 2026-11-07 01:30 UTC.
    // toISOString() geraria "2026-11-07" (errado!), mas toLocalISODate deve gerar "2026-11-06".
    const lateNightDate = new Date(2026, 10, 6, 22, 30, 0, 0); // mês 10 = Novembro
    const lateResult = toLocalISODate(lateNightDate);
    assert(
      lateResult === '2026-11-06',
      `2026-11-06 às 22:30 local -> "${lateResult}" (esperado: "2026-11-06")`
    );

    // 2026-11-06 às 00:10: Logo após a meia-noite local
    const earlyMorningDate = new Date(2026, 10, 6, 0, 10, 0, 0);
    const earlyResult = toLocalISODate(earlyMorningDate);
    assert(
      earlyResult === '2026-11-06',
      `2026-11-06 às 00:10 local -> "${earlyResult}" (esperado: "2026-11-06")`
    );
  }

  console.log('\n[2] todayLocalISO() devolve string YYYY-MM-DD válida:');
  {
    const today = todayLocalISO();
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(today),
      `todayLocalISO() gerou formato válido YYYY-MM-DD: "${today}"`
    );
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert(
      today === expected,
      `todayLocalISO() coincide com o relógio local do sistema: "${today}"`
    );
  }

  console.log('\n[3] addDaysLocalISO: soma e subtração de dias, virada de mês e de ano:');
  {
    // Virada de ano: 2026-12-31 + 1 dia = 2027-01-01
    const newYear = addDaysLocalISO('2026-12-31', 1);
    assert(
      newYear === '2027-01-01',
      `2026-12-31 + 1 dia -> "${newYear}" (esperado: "2027-01-01")`
    );

    // Virada de mês: 2026-03-01 - 1 dia em ano não bissexto (2026) = 2026-02-28
    const febEnd = addDaysLocalISO('2026-03-01', -1);
    assert(
      febEnd === '2026-02-28',
      `2026-03-01 - 1 dia -> "${febEnd}" (esperado: "2026-02-28")`
    );

    // Caso de ano bissexto: 2024-03-01 - 1 dia = 2024-02-29
    const leapFeb = addDaysLocalISO('2024-03-01', -1);
    assert(
      leapFeb === '2024-02-29',
      `2024-03-01 - 1 dia (bissexto) -> "${leapFeb}" (esperado: "2024-02-29")`
    );

    // Soma normal no meio do mês
    const midMonth = addDaysLocalISO('2026-11-15', 5);
    assert(
      midMonth === '2026-11-20',
      `2026-11-15 + 5 dias -> "${midMonth}" (esperado: "2026-11-20")`
    );
  }

  console.log('\n[4] toLocalYearMonth às 23:50 do último dia do mês:');
  {
    // 2026-11-30 às 23:50: Em UTC já é 2026-12-01.
    // toLocalYearMonth deve manter 2026-11.
    const endOfMonthDate = new Date(2026, 10, 30, 23, 50, 0, 0); // 30 de Novembro
    const monthResult = toLocalYearMonth(endOfMonthDate);
    assert(
      monthResult === '2026-11',
      `2026-11-30 às 23:50 local -> "${monthResult}" (esperado: "2026-11")`
    );

    // 2026-12-31 às 23:59: Fim do ano
    const endOfYearDate = new Date(2026, 11, 31, 23, 59, 0, 0);
    const yearResult = toLocalYearMonth(endOfYearDate);
    assert(
      yearResult === '2026-12',
      `2026-12-31 às 23:59 local -> "${yearResult}" (esperado: "2026-12")`
    );
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
