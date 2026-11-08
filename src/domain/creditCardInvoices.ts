import { CreditCard, Transaction, PaymentMethod } from '../types/finance';
import { toCents, fromCents } from './money';
import { todayLocalISO } from '../utils/localDate';
import { getMonthLabel } from '../utils/currency';

export type InvoiceStatus = 'paid' | 'open' | 'closed_pending' | 'overdue' | 'future';

export interface CreditCardInvoice {
  cardId: string;
  month: string; // YYYY-MM
  monthLabel: string; // ex: "Março de 2026"
  closingDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  totalAmount: number;
  oneOffAmount: number;
  installmentsAmount: number;
  transactionsCount: number;
  transactions: Transaction[];
  status: InvoiceStatus;
  statusLabel: string;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  isPaid: boolean;
  paymentTransaction?: Transaction;
}

export interface CreditCardDynamicLimit {
  cardId: string;
  cardLimit: number;
  pendingOneOffCents: number;
  pendingOneOffAmount: number;
  committedInstallmentsCents: number;
  committedInstallmentsAmount: number;
  totalConsumedCents: number;
  totalConsumedAmount: number;
  availableLimitCents: number;
  availableLimitAmount: number;
  consumedPercent: number;
  oneOffPercent: number;
  installmentsPercent: number;
}

/**
 * Calcula a data de fechamento da fatura para um determinado mês 'YYYY-MM'.
 */
export function calculateInvoiceClosingDate(closingDay: number, month: string): string {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, m, 0).getDate();
  const safeDay = Math.min(Math.max(1, closingDay || 1), daysInMonth);
  return `${yearStr}-${monthStr}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Calcula a data de vencimento da fatura para um determinado mês 'YYYY-MM'.
 * Se dueDay <= closingDay, o vencimento ocorre no mês subsequente.
 */
export function calculateInvoiceDueDate(closingDay: number, dueDay: number, month: string): string {
  const [yearStr, monthStr] = month.split('-');
  let year = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10);

  if ((dueDay || 1) <= (closingDay || 1)) {
    m += 1;
    if (m > 12) {
      m = 1;
      year += 1;
    }
  }

  const daysInDueMonth = new Date(year, m, 0).getDate();
  const safeDay = Math.min(Math.max(1, dueDay || 10), daysInDueMonth);
  return `${year}-${String(m).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Verifica se uma transação é um pagamento registrado de fatura do cartão.
 */
export function isInvoicePaymentTransaction(
  tx: Transaction,
  cardId: string,
  month: string
): boolean {
  if (tx.deleted) return false;
  
  // Tag canônica: 'fatura-paga' ou 'fatura_paga'
  const hasTag = tx.tags?.some(t => t === 'fatura-paga' || t === 'fatura_paga');
  const hasCardTag = tx.tags?.some(t => t === `card:${cardId}` || t === `cartao:${cardId}`);
  const hasMonthTag = tx.tags?.some(t => t === `fatura:${month}` || t === `competencia:${month}`);

  if (hasTag && hasCardTag && hasMonthTag) {
    return true;
  }

  // Fallback por notas ou descrição estruturada
  if (
    tx.type === 'expense' &&
    (tx.notes?.includes(`fatura:${month}`) || tx.description?.toLowerCase().includes(`fatura`) && tx.description?.toLowerCase().includes(month))
  ) {
    return true;
  }

  return false;
}

/**
 * Computa o histórico e todas as faturas (passadas fechadas, atual aberta e futuras previstas)
 * de um cartão de crédito.
 */
export function computeCardInvoices(
  card: CreditCard,
  transactions: Transaction[],
  todayISO: string = todayLocalISO()
): CreditCardInvoice[] {
  const currentMonth = todayISO.slice(0, 7);
  const cardTxs = transactions.filter(t => !t.deleted && t.creditCardId === card.id && t.type === 'expense');

  // Coleta todos os meses relevantes
  const monthsSet = new Set<string>();
  monthsSet.add(currentMonth);

  for (const tx of cardTxs) {
    if (tx.date && tx.date.length >= 7) {
      monthsSet.add(tx.date.slice(0, 7));
    }
  }

  // Verifica transações de pagamento de faturas com tags de competência
  for (const tx of transactions) {
    if (!tx.deleted && (tx.tags?.includes('fatura-paga') || tx.tags?.includes('fatura_paga'))) {
      const monthTag = tx.tags.find(t => t.startsWith('fatura:') || t.startsWith('competencia:'));
      if (monthTag) {
        const m = monthTag.split(':')[1];
        if (m) monthsSet.add(m);
      }
    }
  }

  // Garante que pelo menos o mês anterior e o próximo mês estejam no conjunto
  const [currYear, currM] = currentMonth.split('-').map(Number);
  const prevDate = new Date(currYear, currM - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  monthsSet.add(prevMonth);

  const nextDate = new Date(currYear, currM, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  monthsSet.add(nextMonth);

  const sortedMonths = Array.from(monthsSet).sort();
  const invoices: CreditCardInvoice[] = [];

  for (const month of sortedMonths) {
    const closingDate = calculateInvoiceClosingDate(card.closingDay, month);
    const dueDate = calculateInvoiceDueDate(card.closingDay, card.dueDay, month);

    const monthTxs = cardTxs.filter(t => t.date.startsWith(month));
    let totalCents = 0;
    let oneOffCents = 0;
    let installmentsCents = 0;

    for (const tx of monthTxs) {
      const cents = toCents(tx.amount);
      totalCents += cents;
      const isInstallment = Boolean(tx.installmentPlanId || tx.installments || /\(\d+\/\d+\)/.test(tx.description));
      if (isInstallment) {
        installmentsCents += cents;
      } else {
        oneOffCents += cents;
      }
    }

    const totalAmount = fromCents(totalCents);
    const oneOffAmount = fromCents(oneOffCents);
    const installmentsAmount = fromCents(installmentsCents);

    const paymentTx = transactions.find(t => isInvoicePaymentTransaction(t, card.id, month));
    const isPaid = Boolean(paymentTx);

    const isCurrent = month === currentMonth;
    const isPast = month < currentMonth;
    const isFuture = month > currentMonth;

    let status: InvoiceStatus;
    let statusLabel: string;

    if (isPaid) {
      status = 'paid';
      statusLabel = 'Paga';
    } else if (isFuture) {
      status = 'future';
      statusLabel = 'Prevista';
    } else if (isPast) {
      if (dueDate < todayISO) {
        status = 'overdue';
        statusLabel = 'Vencida';
      } else {
        status = 'closed_pending';
        statusLabel = 'Fechada';
      }
    } else {
      // Mês atual
      if (todayISO >= closingDate) {
        if (dueDate < todayISO) {
          status = 'overdue';
          statusLabel = 'Vencida';
        } else {
          status = 'closed_pending';
          statusLabel = 'Fechada';
        }
      } else {
        status = 'open';
        statusLabel = 'Aberta';
      }
    }

    invoices.push({
      cardId: card.id,
      month,
      monthLabel: getMonthLabel(month),
      closingDate,
      dueDate,
      totalAmount,
      oneOffAmount,
      installmentsAmount,
      transactionsCount: monthTxs.length,
      transactions: monthTxs.sort((a, b) => a.date.localeCompare(b.date)),
      status,
      statusLabel,
      isCurrent,
      isPast,
      isFuture,
      isPaid,
      paymentTransaction: paymentTx
    });
  }

  return invoices;
}

/**
 * Computa o Limite Dinâmico do cartão:
 * - Compras à vista pendentes (faturas abertas ou fechadas pendentes de pagamento)
 * - Parcelas futuras comprometidas (compras parceladas de meses futuros que bloqueiam o limite)
 * - Limite consumido e disponível com cálculo em centavos.
 */
export function calculateDynamicLimit(
  card: CreditCard,
  transactions: Transaction[],
  todayISO: string = todayLocalISO()
): CreditCardDynamicLimit {
  const currentMonth = todayISO.slice(0, 7);
  const cardLimit = typeof card.limit === 'number' ? card.limit : 0;
  const cardLimitCents = toCents(cardLimit);

  // Computa faturas para saber quais já foram pagas
  const invoices = computeCardInvoices(card, transactions, todayISO);
  const paidMonths = new Set(invoices.filter(inv => inv.isPaid).map(inv => inv.month));

  let pendingOneOffCents = 0;
  let committedInstallmentsCents = 0;

  const cardTxs = transactions.filter(t => !t.deleted && t.creditCardId === card.id && t.type === 'expense');

  for (const tx of cardTxs) {
    const txMonth = tx.date.slice(0, 7);
    const amountCents = toCents(tx.amount);

    // Se o mês da fatura já foi pago, essa despesa não consome mais o limite do cartão
    if (paidMonths.has(txMonth)) {
      continue;
    }

    const isInstallment = Boolean(tx.installmentPlanId || tx.installments || /\(\d+\/\d+\)/.test(tx.description));

    if (isInstallment) {
      if (txMonth > currentMonth) {
        // Parcela de fatura futura: consome o limite global comprometido
        committedInstallmentsCents += amountCents;
      } else {
        // Parcela do mês atual ou anterior que ainda não foi paga na fatura
        pendingOneOffCents += amountCents;
      }
    } else {
      // Compra à vista em fatura aberta ou não paga
      pendingOneOffCents += amountCents;
    }
  }

  const totalConsumedCents = pendingOneOffCents + committedInstallmentsCents;
  const availableLimitCents = Math.max(0, cardLimitCents - totalConsumedCents);

  const pendingOneOffAmount = fromCents(pendingOneOffCents);
  const committedInstallmentsAmount = fromCents(committedInstallmentsCents);
  const totalConsumedAmount = fromCents(totalConsumedCents);
  const availableLimitAmount = fromCents(availableLimitCents);

  const consumedPercent = cardLimitCents > 0
    ? Math.min(100, Math.round((totalConsumedCents / cardLimitCents) * 100))
    : 0;

  const oneOffPercent = cardLimitCents > 0
    ? Math.min(100, Math.round((pendingOneOffCents / cardLimitCents) * 100))
    : 0;

  const installmentsPercent = cardLimitCents > 0
    ? Math.min(100, Math.round((committedInstallmentsCents / cardLimitCents) * 100))
    : 0;

  return {
    cardId: card.id,
    cardLimit,
    pendingOneOffCents,
    pendingOneOffAmount,
    committedInstallmentsCents,
    committedInstallmentsAmount,
    totalConsumedCents,
    totalConsumedAmount,
    availableLimitCents,
    availableLimitAmount,
    consumedPercent,
    oneOffPercent,
    installmentsPercent
  };
}

/**
 * Cria a transação de pagamento de fatura do cartão em uma única operação.
 */
export function buildInvoicePaymentTransaction(params: {
  card: CreditCard;
  invoice: CreditCardInvoice;
  accountId: string;
  paymentMethod?: PaymentMethod;
  paymentDate?: string;
  categoryId?: string;
  amount?: number;
  notes?: string;
}): Omit<Transaction, 'id' | 'createdAt'> {
  const { card, invoice, accountId } = params;
  const paymentAmount = params.amount ?? invoice.totalAmount;
  const paymentDate = params.paymentDate || todayLocalISO();
  const paymentMethod = params.paymentMethod || 'pix';
  const categoryId = params.categoryId || 'cat-outros';

  return {
    description: `Pagamento Fatura ${card.name} (${invoice.month})`,
    amount: paymentAmount,
    type: 'expense',
    accountId,
    paymentMethod,
    categoryId,
    date: paymentDate,
    status: 'completed',
    notes: params.notes || `Pagamento total referente à fatura de ${invoice.monthLabel} do cartão ${card.name}`,
    tags: ['fatura-paga', `card:${card.id}`, `cartao:${card.id}`, `fatura:${invoice.month}`, `competencia:${invoice.month}`]
  };
}
