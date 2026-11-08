import {
  calculateInvoiceClosingDate,
  calculateInvoiceDueDate,
  computeCardInvoices,
  calculateDynamicLimit,
  buildInvoicePaymentTransaction,
  isInvoicePaymentTransaction
} from '../src/domain/creditCardInvoices';
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

function assertClose(actual: number, expected: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (diff < 0.001) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message} (esperado: ${expected}, obtido: ${actual})`);
    failed++;
  }
}

console.log('--- INICIANDO TESTES DE creditCardInvoices ---');

const mockCard: CreditCard = {
  id: 'card-nubank',
  name: 'Nubank Ultravioleta',
  bankName: 'Nubank',
  color: '#820AD1',
  limit: 5000,
  closingDay: 25,
  dueDay: 5,
  currentInvoice: 0
};

// 1. Datas de fechamento e vencimento
{
  const closingMar = calculateInvoiceClosingDate(25, '2026-03');
  assert(closingMar === '2026-03-25', 'Fechamento de março: dia 25');

  // dueDay (5) <= closingDay (25) -> Vencimento cai no próximo mês (Abril)
  const dueMar = calculateInvoiceDueDate(25, 5, '2026-03');
  assert(dueMar === '2026-04-05', 'Vencimento de fatura que fecha 25/03 vence em 05/04');

  // Caso onde dueDay > closingDay (ex: fecha dia 10, vence dia 20) -> mesmo mês
  const dueSame = calculateInvoiceDueDate(10, 20, '2026-03');
  assert(dueSame === '2026-03-20', 'Vencimento no mesmo mês quando dueDay > closingDay');

  // Virada de ano em dezembro
  const dueDec = calculateInvoiceDueDate(25, 5, '2026-12');
  assert(dueDec === '2027-01-05', 'Vencimento da fatura de dezembro cai em janeiro do ano seguinte');
}

// 2. Limite Dinâmico e Faturas
{
  const todayISO = '2026-03-10'; // Estamos em 10 de março de 2026

  const transactions: Transaction[] = [
    // Compra à vista em março (fatura atual em aberto)
    {
      id: 'tx-1',
      description: 'Supermercado Pão de Açúcar',
      amount: 450.00,
      type: 'expense',
      categoryId: 'cat-mercado',
      accountId: 'acc-1',
      creditCardId: 'card-nubank',
      paymentMethod: 'credit_card',
      date: '2026-03-05',
      status: 'completed',
      createdAt: '2026-03-05T10:00:00Z'
    },
    // Outra compra à vista em março
    {
      id: 'tx-2',
      description: 'Farmácia Raia',
      amount: 150.00,
      type: 'expense',
      categoryId: 'cat-saude',
      accountId: 'acc-1',
      creditCardId: 'card-nubank',
      paymentMethod: 'credit_card',
      date: '2026-03-08',
      status: 'completed',
      createdAt: '2026-03-08T15:00:00Z'
    },
    // Parcelamento em 3x de R$ 300 (total R$ 900)
    // Parcela 1/3 em março (fatura atual)
    {
      id: 'tx-p1',
      description: 'Notebook Dell (1/3)',
      amount: 300.00,
      type: 'expense',
      categoryId: 'cat-eletronicos',
      accountId: 'acc-1',
      creditCardId: 'card-nubank',
      paymentMethod: 'credit_card',
      date: '2026-03-02',
      status: 'completed',
      installmentPlanId: 'plan-1',
      installments: { current: 1, total: 3 },
      createdAt: '2026-03-02T10:00:00Z'
    },
    // Parcela 2/3 em abril (fatura futura)
    {
      id: 'tx-p2',
      description: 'Notebook Dell (2/3)',
      amount: 300.00,
      type: 'expense',
      categoryId: 'cat-eletronicos',
      accountId: 'acc-1',
      creditCardId: 'card-nubank',
      paymentMethod: 'credit_card',
      date: '2026-04-02',
      status: 'pending',
      installmentPlanId: 'plan-1',
      installments: { current: 2, total: 3 },
      createdAt: '2026-03-02T10:00:00Z'
    },
    // Parcela 3/3 em maio (fatura futura)
    {
      id: 'tx-p3',
      description: 'Notebook Dell (3/3)',
      amount: 300.00,
      type: 'expense',
      categoryId: 'cat-eletronicos',
      accountId: 'acc-1',
      creditCardId: 'card-nubank',
      paymentMethod: 'credit_card',
      date: '2026-05-02',
      status: 'pending',
      installmentPlanId: 'plan-1',
      installments: { current: 3, total: 3 },
      createdAt: '2026-03-02T10:00:00Z'
    }
  ];

  // Cálculo do Limite Dinâmico
  const limitInfo = calculateDynamicLimit(mockCard, transactions, todayISO);

  // Compras na fatura atual = 450 + 150 + 300 = 900
  assertClose(limitInfo.pendingOneOffAmount, 900, 'Compras na fatura atual: 900');

  // Parcelas futuras comprometidas = 300 (abril) + 300 (maio) = 600
  assertClose(limitInfo.committedInstallmentsAmount, 600, 'Parcelas futuras comprometidas: 600');

  // Total consumido = 900 + 600 = 1.500
  assertClose(limitInfo.totalConsumedAmount, 1500, 'Total consumido do limite: 1.500');

  // Limite disponível = 5.000 - 1.500 = 3.500
  assertClose(limitInfo.availableLimitAmount, 3500, 'Limite disponível real: 3.500');

  // Percentual consumido = 1.500 / 5.000 = 30%
  assert(limitInfo.consumedPercent === 30, `Percentual consumido esperado 30%, obtido ${limitInfo.consumedPercent}%`);

  // Faturas calculadas
  const invoices = computeCardInvoices(mockCard, transactions, todayISO);
  
  const marInvoice = invoices.find(inv => inv.month === '2026-03');
  assert(Boolean(marInvoice), 'Fatura de março foi calculada');
  assertClose(marInvoice!.totalAmount, 900, 'Total da fatura de março é 900 (450 + 150 + 300)');
  assert(marInvoice!.status === 'open', `Fatura de março está aberta (status: ${marInvoice!.status})`);
  assert(marInvoice!.isCurrent === true, 'Fatura de março é a atual');
  assert(marInvoice!.transactionsCount === 3, 'Fatura de março tem 3 transações');

  const aprInvoice = invoices.find(inv => inv.month === '2026-04');
  assert(Boolean(aprInvoice), 'Fatura de abril foi calculada');
  assertClose(aprInvoice!.totalAmount, 300, 'Total da fatura de abril é 300 (parcela 2/3)');
  assert(aprInvoice!.status === 'future', 'Fatura de abril é futura/prevista');
  assert(aprInvoice!.isFuture === true, 'Fatura de abril tem isFuture = true');

  const mayInvoice = invoices.find(inv => inv.month === '2026-05');
  assert(Boolean(mayInvoice), 'Fatura de maio foi calculada');
  assertClose(mayInvoice!.totalAmount, 300, 'Total da fatura de maio é 300 (parcela 3/3)');
  assert(mayInvoice!.status === 'future', 'Fatura de maio é futura/prevista');
}

// 3. Pagamento de Fatura ("Marcar fatura como paga")
{
  const todayISO = '2026-03-26'; // Após o fechamento (dia 25)
  const transactions: Transaction[] = [
    {
      id: 'tx-1',
      description: 'Restaurante',
      amount: 250.00,
      type: 'expense',
      categoryId: 'cat-alimentacao',
      accountId: 'acc-1',
      creditCardId: 'card-nubank',
      paymentMethod: 'credit_card',
      date: '2026-03-15',
      status: 'pending',
      createdAt: '2026-03-15T12:00:00Z'
    }
  ];

  const invoicesBefore = computeCardInvoices(mockCard, transactions, todayISO);
  const marBefore = invoicesBefore.find(inv => inv.month === '2026-03')!;
  assert(marBefore.status === 'closed_pending', 'Fatura de março fechada aguardando pagamento');
  assert(marBefore.isPaid === false, 'Fatura não está paga');

  // Gera transação de pagamento
  const paymentPayload = buildInvoicePaymentTransaction({
    card: mockCard,
    invoice: marBefore,
    accountId: 'acc-checking',
    paymentMethod: 'pix',
    paymentDate: '2026-03-26'
  });

  assert(paymentPayload.amount === 250, 'Valor do pagamento confere com a fatura (250)');
  assert(paymentPayload.type === 'expense', 'Tipo da transação de pagamento é expense para debitar conta bancária');
  assert(paymentPayload.accountId === 'acc-checking', 'Debita da conta corrente selecionada');
  assert(paymentPayload.tags?.includes('fatura-paga') === true, 'Contém tag canônica fatura-paga');

  const paymentTx: Transaction = {
    ...paymentPayload,
    id: 'tx-pay-1',
    createdAt: '2026-03-26T14:00:00Z'
  };

  assert(isInvoicePaymentTransaction(paymentTx, mockCard.id, '2026-03'), 'Reconhece o pagamento da fatura');

  // Adiciona a transação de pagamento à lista
  const transactionsAfter = [...transactions, paymentTx];
  const invoicesAfter = computeCardInvoices(mockCard, transactionsAfter, todayISO);
  const marAfter = invoicesAfter.find(inv => inv.month === '2026-03')!;

  assert(marAfter.isPaid === true, 'Fatura de março agora está paga');
  assert(marAfter.status === 'paid', 'Status é "paid"');
  assert(Boolean(marAfter.paymentTransaction), 'Vincula transação de pagamento à fatura');

  // Limite após pagamento: o valor de 250 já pago é liberado do limite
  const limitAfter = calculateDynamicLimit(mockCard, transactionsAfter, todayISO);
  assertClose(limitAfter.pendingOneOffAmount, 0, 'Após pagamento da fatura, compras pendentes = 0');
  assertClose(limitAfter.availableLimitAmount, 5000, 'Limite total 5.000 liberado');
}

console.log(`\nResultado Final: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}
