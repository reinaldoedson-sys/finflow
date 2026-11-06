import type { PaymentMethod } from '../types/finance';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  bank_slip: 'Boleto',
  cash: 'Dinheiro',
  transfer: 'Transferência',
};

/**
 * Função pura para conversão do método de pagamento para rótulo amigável em português.
 * pix -> "Pix"
 * credit_card -> "Cartão de crédito"
 * debit_card -> "Cartão de débito"
 * bank_slip -> "Boleto"
 * cash -> "Dinheiro"
 * transfer -> "Transferência"
 * Se for um valor desconhecido, devolve o texto original.
 */
export function getPaymentMethodLabel(method: string | PaymentMethod | null | undefined): string {
  if (method === null || method === undefined) return '';
  const str = String(method);
  const normalized = str.toLowerCase().trim() as PaymentMethod;
  if (Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABELS, normalized)) {
    return PAYMENT_METHOD_LABELS[normalized];
  }
  return str;
}
