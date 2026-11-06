import { getInstallmentPlanEndDate } from '../src/domain/installments';

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
  console.log('--- TESTES: CÁLCULO DE DATA DE TÉRMINO DE PARCELAMENTOS (getInstallmentPlanEndDate) ---');

  // Caso 1: 12x a partir de 2026-10-10 termina em 2027-09-10
  {
    const plan = { startDate: '2026-10-10', totalInstallments: 12 };
    const endDate = getInstallmentPlanEndDate(plan);
    assert(endDate === '2027-09-10', `12x a partir de 2026-10-10 termina em 2027-09-10 (obtido: ${endDate})`);
  }

  // Caso 2: 34x a partir de 2026-12-10 termina em 2029-09-10 (exemplo: Financiamento do carro)
  {
    const plan = { startDate: '2026-12-10', totalInstallments: 34 };
    const endDate = getInstallmentPlanEndDate(plan);
    assert(endDate === '2029-09-10', `34x a partir de 2026-12-10 termina em 2029-09-10 (obtido: ${endDate})`);
  }

  // Caso 3: 18x a partir de 2026-11-06 termina em 2028-04-06
  {
    const plan = { startDate: '2026-11-06', totalInstallments: 18 };
    const endDate = getInstallmentPlanEndDate(plan);
    assert(endDate === '2028-04-06', `18x a partir de 2026-11-06 termina em 2028-04-06 (obtido: ${endDate})`);
  }

  // Caso 4: 1 parcela devolve a data de início
  {
    const plan = { startDate: '2026-05-15', totalInstallments: 1 };
    const endDate = getInstallmentPlanEndDate(plan);
    assert(endDate === '2026-05-15', `1 parcela devolve a data de início 2026-05-15 (obtido: ${endDate})`);
  }

  // Caso 5: Início em 31/01/2026 com 2 parcelas termina em 28/02/2026 (ajuste de fim de mês)
  {
    const plan = { startDate: '2026-01-31', totalInstallments: 2 };
    const endDate = getInstallmentPlanEndDate(plan);
    assert(endDate === '2026-02-28', `Início em 31/01/2026 com 2 parcelas termina em 28/02/2026 (obtido: ${endDate})`);
  }

  // Caso 6: Virada de ano
  {
    const plan = { startDate: '2026-11-20', totalInstallments: 3 };
    const endDate = getInstallmentPlanEndDate(plan);
    assert(endDate === '2027-01-20', `Virada de ano: 3 parcelas a partir de 2026-11-20 termina em 2027-01-20 (obtido: ${endDate})`);

    const planCrossYear = { startDate: '2026-12-15', totalInstallments: 2 };
    const endDateCrossYear = getInstallmentPlanEndDate(planCrossYear);
    assert(endDateCrossYear === '2027-01-15', `Virada de ano: 2 parcelas a partir de 2026-12-15 termina em 2027-01-15 (obtido: ${endDateCrossYear})`);
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
