import { CreditCard, Transaction } from '../types/finance';
import { todayLocalISO } from '../utils/localDate';

export type AlertUrgency = 'overdue' | 'today' | 'soon';

export interface DueAlert {
  id: string;
  kind: 'credit_card' | 'pending_bill';
  title: string;
  subtitle: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  diffDays: number; // < 0: vencida há X dias, 0: vence hoje, 1: amanhã, 2..3: em X dias
  urgency: AlertUrgency;
  cardId?: string;
  transactionId?: string;
}

/**
 * Calcula a data de vencimento da fatura atual do cartão de crédito baseando-se no dia de vencimento (dueDay)
 * e na data de hoje.
 */
export function calculateCardDueDate(dueDay: number, todayISO: string = todayLocalISO()): string {
  const parts = todayISO.split('-').map(Number);
  const year = parts[0];
  const month = parts[1]; // 1-12
  const currentDay = parts[2];

  // Se o dia de vencimento já passou há mais de 10 dias neste mês, o vencimento da próxima fatura aberta é no próximo mês
  // Mas se for recente (até 10 dias após o vencimento) ou se ainda está por vir neste mês, considera este mês.
  let targetYear = year;
  let targetMonth = month;

  if (currentDay > dueDay + 10) {
    // Aponta para o próximo mês
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }

  // Ajusta se o mês tiver menos dias que dueDay (ex: fevereiro e dia 31)
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const safeDay = Math.min(dueDay, daysInMonth);

  const yStr = String(targetYear);
  const mStr = String(targetMonth).padStart(2, '0');
  const dStr = String(safeDay).padStart(2, '0');

  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Calcula a diferença em dias entre duas datas no formato 'YYYY-MM-DD'.
 * Positivo se targetDate for futuro em relação a baseDate.
 * 0 se for o mesmo dia.
 * Negativo se targetDate já tiver passado.
 */
export function diffCalendarDays(targetDate: string, baseDate: string = todayLocalISO()): number {
  const [y1, m1, d1] = targetDate.split('-').map(Number);
  const [y2, m2, d2] = baseDate.split('-').map(Number);

  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((utc1 - utc2) / msPerDay);
}

/**
 * Identifica e consolida todos os alertas de vencimentos a vencer em até N dias (padrão: 3 dias) ou já vencidos.
 * Analisa tanto faturas de cartões de crédito com saldo devedor quanto parcelas/despesas pendentes.
 */
export function computeDueAlerts(
  creditCards: CreditCard[],
  transactions: Transaction[],
  todayISO: string = todayLocalISO(),
  thresholdDays: number = 3
): DueAlert[] {
  const alerts: DueAlert[] = [];

  // 1. Alertas de Faturas de Cartão de Crédito com saldo a pagar
  for (const card of creditCards) {
    if (card.deleted || (card as { isDeleted?: boolean }).isDeleted) {
      continue;
    }

    const invoiceAmount = typeof card.currentInvoice === 'number' ? card.currentInvoice : 0;
    if (invoiceAmount <= 0) {
      continue;
    }

    if (!card.dueDay || card.dueDay < 1 || card.dueDay > 31) {
      continue;
    }

    const dueDate = calculateCardDueDate(card.dueDay, todayISO);
    const diffDays = diffCalendarDays(dueDate, todayISO);

    // Considera alertas de faturas que vencem em até thresholdDays ou vencidas há até 7 dias
    if (diffDays <= thresholdDays && diffDays >= -7) {
      let urgency: AlertUrgency = 'soon';
      let subtitle = `Vence em ${diffDays} dias`;

      if (diffDays < 0) {
        urgency = 'overdue';
        subtitle = `Vencida há ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'dia' : 'dias'}`;
      } else if (diffDays === 0) {
        urgency = 'today';
        subtitle = 'Vence hoje!';
      } else if (diffDays === 1) {
        urgency = 'soon';
        subtitle = 'Vence amanhã';
      }

      alerts.push({
        id: `alert-card-${card.id}`,
        kind: 'credit_card',
        title: `Fatura ${card.name}`,
        subtitle,
        amount: invoiceAmount,
        dueDate,
        diffDays,
        urgency,
        cardId: card.id,
      });
    }
  }

  // 2. Alertas de Contas a Pagar e Parcelas Pendentes
  for (const tx of transactions) {
    if (tx.deleted || tx.deletedAt || (tx as { isDeleted?: boolean }).isDeleted) {
      continue;
    }
    if (tx.type !== 'expense' || tx.status !== 'pending') {
      continue;
    }
    if (!tx.date || typeof tx.date !== 'string' || tx.date.length < 10) {
      continue;
    }

    const diffDays = diffCalendarDays(tx.date, todayISO);

    // Considera contas a vencer em até thresholdDays ou vencidas há até 15 dias
    if (diffDays <= thresholdDays && diffDays >= -15) {
      let urgency: AlertUrgency = 'soon';
      let subtitle = `Vence em ${diffDays} dias`;

      if (diffDays < 0) {
        urgency = 'overdue';
        subtitle = `Atrasada há ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'dia' : 'dias'}`;
      } else if (diffDays === 0) {
        urgency = 'today';
        subtitle = 'Vence hoje!';
      } else if (diffDays === 1) {
        urgency = 'soon';
        subtitle = 'Vence amanhã';
      }

      alerts.push({
        id: `alert-tx-${tx.id}`,
        kind: 'pending_bill',
        title: tx.description,
        subtitle,
        amount: tx.amount,
        dueDate: tx.date,
        diffDays,
        urgency,
        transactionId: tx.id,
      });
    }
  }

  // Ordena por urgência: 'overdue' primeiro, depois 'today', depois menor diffDays, depois maior valor
  const urgencyWeight: Record<AlertUrgency, number> = {
    overdue: 0,
    today: 1,
    soon: 2,
  };

  alerts.sort((a, b) => {
    const uDiff = urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
    if (uDiff !== 0) return uDiff;
    const dDiff = a.diffDays - b.diffDays;
    if (dDiff !== 0) return dDiff;
    return b.amount - a.amount;
  });

  return alerts;
}
