import { InvestmentTransaction, InvestmentTransactionType } from '../types/finance';
import { toCents, fromCents } from './money';
import { generateId } from './id';

export interface ValidateTransactionParams {
  assetId?: any;
  type?: any;
  date?: any;
  quantity?: any;
  price?: any;
  totalAmount?: any;
  notes?: any;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Calcula o total financeiro de uma operação (quantidade * preço)
 * utilizando precisão de centavos inteiros via camada monetária.
 */
export function calculateTransactionTotal(quantity: number, price: number): number {
  if (
    typeof quantity !== 'number' ||
    typeof price !== 'number' ||
    isNaN(quantity) ||
    isNaN(price) ||
    !isFinite(quantity) ||
    !isFinite(price) ||
    quantity <= 0 ||
    price <= 0
  ) {
    return 0;
  }

  const priceCents = toCents(price);
  const totalCents = Math.round(quantity * priceCents);
  return fromCents(totalCents);
}

/**
 * Valida os dados de uma operação de investimento (compra, venda ou dividendo).
 * Não permite campos vazios, tipos inválidos, valores negativos, NaN ou Infinity.
 * Opcionalmente valida se o assetId pertence a um ativo existente.
 */
export function validateInvestmentTransaction(
  tx: ValidateTransactionParams,
  existingAssets?: Array<{ id: string }>
): ValidationResult {
  if (!tx || typeof tx !== 'object') {
    return { isValid: false, error: 'Dados da operação não informados.' };
  }

  // 1. assetId obrigatório
  if (typeof tx.assetId !== 'string' || tx.assetId.trim().length === 0) {
    return { isValid: false, error: 'O código/ID do ativo (assetId) é obrigatório.' };
  }

  // 2. Validação de integridade referencial com os ativos existentes
  if (existingAssets && !existingAssets.some(a => a.id === tx.assetId)) {
    return { isValid: false, error: `Ativo de investimento com ID "${tx.assetId}" não encontrado.` };
  }

  // 3. type obrigatório e restrito a 'buy', 'sell' ou 'dividend'
  const validTypes: InvestmentTransactionType[] = ['buy', 'sell', 'dividend'];
  if (!validTypes.includes(tx.type)) {
    return { isValid: false, error: 'Tipo de operação inválido. Permitido apenas: compra (buy), venda (sell) ou dividendo (dividend).' };
  }

  // 4. date obrigatória
  if (typeof tx.date !== 'string' || tx.date.trim().length === 0) {
    return { isValid: false, error: 'A data da operação é obrigatória.' };
  }

  // 5. quantity validações (não pode ser negativa, nem NaN, nem Infinity)
  if (typeof tx.quantity !== 'number' || isNaN(tx.quantity) || !isFinite(tx.quantity)) {
    return { isValid: false, error: 'A quantidade deve ser um número válido.' };
  }
  if (tx.quantity < 0) {
    return { isValid: false, error: 'A quantidade não pode ser negativa.' };
  }
  if ((tx.type === 'buy' || tx.type === 'sell') && tx.quantity <= 0) {
    return { isValid: false, error: 'Operações de compra e venda exigem quantidade maior que zero.' };
  }

  // 6. price validações (não pode ser negativo, nem NaN, nem Infinity)
  if (typeof tx.price !== 'number' || isNaN(tx.price) || !isFinite(tx.price)) {
    return { isValid: false, error: 'O preço unitário deve ser um número válido.' };
  }
  if (tx.price < 0) {
    return { isValid: false, error: 'O preço não pode ser negativo.' };
  }

  // 7. totalAmount validações
  if (typeof tx.totalAmount !== 'number' || isNaN(tx.totalAmount) || !isFinite(tx.totalAmount)) {
    return { isValid: false, error: 'O valor total deve ser um número válido.' };
  }
  if (tx.totalAmount < 0) {
    return { isValid: false, error: 'O valor total não pode ser negativo.' };
  }

  return { isValid: true };
}

/**
 * Cria um objeto InvestmentTransaction seguro e validado,
 * gerando ID com prefixo 'itx' e timestamp de criação.
 */
export function createInvestmentTransaction(
  params: Omit<InvestmentTransaction, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
  existingAssets?: Array<{ id: string }>
): InvestmentTransaction {
  // Se totalAmount não foi explicitamente calculado ou é 0 para compra/venda, calcula automaticamente
  let totalAmount = params.totalAmount;
  if (
    (typeof totalAmount !== 'number' || totalAmount <= 0) &&
    (params.type === 'buy' || params.type === 'sell')
  ) {
    totalAmount = calculateTransactionTotal(params.quantity, params.price);
  }

  const payloadToValidate: ValidateTransactionParams = {
    ...params,
    totalAmount
  };

  const validation = validateInvestmentTransaction(payloadToValidate, existingAssets);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Operação de investimento inválida.');
  }

  return {
    id: params.id || generateId('itx'),
    assetId: params.assetId,
    type: params.type,
    date: params.date,
    quantity: params.quantity,
    price: params.price,
    totalAmount,
    notes: params.notes ? params.notes.trim() : undefined,
    createdAt: params.createdAt || new Date().toISOString()
  };
}
