import { 
  calculateCardDueDate, 
  diffCalendarDays, 
  computeDueAlerts 
} from '../src/domain/dueAlerts';
import { CreditCard, Transaction } from '../src/types/finance';

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

function assertClose(actual: number, expected: number, message: string, tolerance = 0.001) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`✅ PASS: ${message} (${actual})`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}. Esperado: ${expected}, Obtido: ${actual}`);
    failed++;
  }
}

function runTests() {
  console.log('--- TESTES: ALERTAS DE VENCIMENTO E LEMBRETES ---\n');

  // 1. calculateCardDueDate
  console.log('[1] calculateCardDueDate:');
  {
    const today = '2026-03-05';
    // dueDay 10 neste mês
    assert(
      calculateCardDueDate(10, today) === '2026-03-10',
      'dueDay 10 com hoje em 05/03 calcula 2026-03-10'
    );

    // dueDay 5 (hoje)
    assert(
      calculateCardDueDate(5, today) === '2026-03-05',
      'dueDay 5 com hoje em 05/03 calcula 2026-03-05 (hoje)'
    );

    // dueDay 3 (passou há 2 dias, ainda dentro da janela de alerta da fatura aberta)
    assert(
      calculateCardDueDate(3, today) === '2026-03-03',
      'dueDay 3 com hoje em 05/03 calcula 2026-03-03 (recente)'
    );

    // dueDay 5 com hoje em 25/03 (> 10 dias após o vencimento): aponta para próximo mês
    assert(
      calculateCardDueDate(5, '2026-03-25') === '2026-04-05',
      'dueDay 5 com hoje em 25/03 aponta para 2026-04-05'
    );
  }

  // 2. diffCalendarDays
  console.log('\n[2] diffCalendarDays:');
  {
    assert(diffCalendarDays('2026-03-10', '2026-03-10') === 0, 'Mesmo dia devolve 0');
    assert(diffCalendarDays('2026-03-12', '2026-03-10') === 2, '2 dias no futuro devolve 2');
    assert(diffCalendarDays('2026-03-08', '2026-03-10') === -2, '2 dias no passado devolve -2');
    assert(diffCalendarDays('2026-04-01', '2026-03-31') === 1, 'Virada de mês calcula 1 dia');
  }

  // 3. computeDueAlerts
  console.log('\n[3] computeDueAlerts:');
  {
    const today = '2026-03-10';

    const cards: CreditCard[] = [
      // Fatura de R$ 1200 vencendo hoje (dueDay 10)
      { id: 'c1', name: 'Nubank', bankName: 'Nubank', limit: 5000, closingDay: 3, dueDay: 10, color: '#8b5cf6', currentInvoice: 1200 },
      // Fatura de R$ 800 vencendo em 2 dias (dueDay 12)
      { id: 'c2', name: 'Itaú', bankName: 'Itaú', limit: 8000, closingDay: 5, dueDay: 12, color: '#f59e0b', currentInvoice: 800 },
      // Fatura de R$ 500 vencendo em 15 dias (fora do limite de 3 dias)
      { id: 'c3', name: 'XP', bankName: 'XP', limit: 10000, closingDay: 18, dueDay: 25, color: '#10b981', currentInvoice: 500 },
      // Cartão sem fatura a pagar (currentInvoice = 0)
      { id: 'c4', name: 'Inter', bankName: 'Inter', limit: 3000, closingDay: 1, dueDay: 10, color: '#f97316', currentInvoice: 0 },
    ];

    const txs: Transaction[] = [
      // Conta atrasada (venceu ontem 09/03)
      { id: 't1', description: 'Conta de Luz', amount: 180, type: 'expense', categoryId: 'cat-luz', accountId: 'a1', paymentMethod: 'pix', date: '2026-03-09', status: 'pending', createdAt: '2026-03-01' },
      // Parcela vencendo amanhã (11/03)
      { id: 't2', description: 'Parcela Notebook 2/10', amount: 350, type: 'expense', categoryId: 'cat-compra', accountId: 'a1', paymentMethod: 'pix', date: '2026-03-11', status: 'pending', createdAt: '2026-03-01' },
      // Conta já concluída (não deve gerar alerta)
      { id: 't3', description: 'Internet Paga', amount: 120, type: 'expense', categoryId: 'cat-net', accountId: 'a1', paymentMethod: 'pix', date: '2026-03-10', status: 'completed', createdAt: '2026-03-01' },
      // Receita pendente (não é despesa a pagar)
      { id: 't4', description: 'Salário a receber', amount: 5000, type: 'income', categoryId: 'cat-sal', accountId: 'a1', paymentMethod: 'pix', date: '2026-03-10', status: 'pending', createdAt: '2026-03-01' },
    ];

    const alerts = computeDueAlerts(cards, txs, today, 3);

    // Esperados:
    // 1. Conta de Luz (overdue, atrasada há 1 dia)
    // 2. Fatura Nubank (today, vence hoje)
    // 3. Parcela Notebook (soon, vence amanhã, diffDays 1)
    // 4. Fatura Itaú (soon, vence em 2 dias, diffDays 2)
    assert(alerts.length === 4, `Total de 4 alertas gerados (obtido: ${alerts.length})`);

    // 1º alerta: atrasado (urgency: 'overdue')
    assert(alerts[0].id === 'alert-tx-t1', '1º alerta é a conta atrasada (Conta de Luz)');
    assert(alerts[0].urgency === 'overdue', 'Conta atrasada tem urgency "overdue"');
    assert(alerts[0].diffDays === -1, 'diffDays é -1');

    // 2º alerta: vence hoje (urgency: 'today')
    assert(alerts[1].id === 'alert-card-c1', '2º alerta é o cartão vencendo hoje (Nubank)');
    assert(alerts[1].urgency === 'today', 'Fatura Nubank tem urgency "today"');
    assert(alerts[1].diffDays === 0, 'diffDays é 0');
    assertClose(alerts[1].amount, 1200, 'Valor da fatura Nubank é 1200');

    // 3º alerta: vence amanhã (diffDays 1)
    assert(alerts[2].id === 'alert-tx-t2', '3º alerta é a parcela do notebook (vence amanhã)');
    assert(alerts[2].urgency === 'soon', 'Parcela tem urgency "soon"');
    assert(alerts[2].diffDays === 1, 'diffDays é 1');

    // 4º alerta: vence em 2 dias (diffDays 2)
    assert(alerts[3].id === 'alert-card-c2', '4º alerta é a fatura Itaú (vence em 2 dias)');
    assert(alerts[3].diffDays === 2, 'diffDays é 2');
    assertClose(alerts[3].amount, 800, 'Valor da fatura Itaú é 800');
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
