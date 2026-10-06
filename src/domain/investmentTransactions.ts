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
 * Valida se uma string de data está no formato estrito YYYY-MM-DD
 * e se corresponde a uma data real válida no calendário (inclusive anos bissextos).
 * Rejeita formatos como 'banana', '2026', '01/10/2026', '2026-1-1', '2026-99-99', etc.
 */
export function isValidDateString(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') return false;

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(year, month - 1, day);
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return false;
  }

  return true;
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
 * Valida integridade referencial com existingAssets e correspondência estrita
 * entre quantidade × preço = totalAmount para BUY e SELL.
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

  // 4. date obrigatória no formato YYYY-MM-DD e calendário válido
  if (!isValidDateString(tx.date)) {
    return { isValid: false, error: 'Data inválida. A data deve estar no formato AAAA-MM-DD (ex: 2026-10-05) e ser uma data real válida.' };
  }

  // 5. quantity validações (não pode ser negativa, nem NaN, nem Infinity)
  if (typeof tx.quantity !== 'number' || isNaN(tx.quantity) || !isFinite(tx.quantity)) {
    return { isValid: false, error: 'A quantidade deve ser um número válido.' };
  }
  if (tx.quantity < 0) {
    return { isValid: false, error: 'A quantidade não pode ser negativa.' };
  }

  // 6. price validações (não pode ser negativo, nem NaN, nem Infinity)
  if (typeof tx.price !== 'number' || isNaN(tx.price) || !isFinite(tx.price)) {
    return { isValid: false, error: 'O preço unitário deve ser um número válido.' };
  }
  if (tx.price < 0) {
    return { isValid: false, error: 'O preço não pode ser negativo.' };
  }

  // 7. totalAmount validações básicas
  if (typeof tx.totalAmount !== 'number' || isNaN(tx.totalAmount) || !isFinite(tx.totalAmount)) {
    return { isValid: false, error: 'O valor total deve ser um número válido.' };
  }
  if (tx.totalAmount <= 0) {
    return { isValid: false, error: 'O valor total da operação deve ser estritamente maior que zero.' };
  }

  // 8. Regras específicas para BUY e SELL
  if (tx.type === 'buy' || tx.type === 'sell') {
    if (tx.quantity <= 0) {
      return { isValid: false, error: `Operação de ${tx.type === 'buy' ? 'compra' : 'venda'} exige quantidade estritamente maior que zero.` };
    }
    if (tx.price <= 0) {
      return { isValid: false, error: `Operação de ${tx.type === 'buy' ? 'compra' : 'venda'} exige preço unitário estritamente maior que zero.` };
    }

    // Validação monetária exata: totalAmount deve corresponder a quantity × price
    const expectedTotalCents = Math.round(tx.quantity * toCents(tx.price));
    const actualTotalCents = toCents(tx.totalAmount);

    if (expectedTotalCents !== actualTotalCents) {
      return {
        isValid: false,
        error: `O valor total informado (${fromCents(actualTotalCents).toFixed(2)}) não corresponde a quantidade × preço (${fromCents(expectedTotalCents).toFixed(2)}).`
      };
    }
  }

  // 9. Regras específicas para DIVIDEND
  if (tx.type === 'dividend') {
    if (tx.totalAmount <= 0) {
      return { isValid: false, error: 'O valor total do dividendo/provento deve ser maior que zero.' };
    }
    // Para dividendos, quantidade e preço são opcionais (podem ser zero)
  }

  // 10. Notas (se presentes)
  if (tx.notes !== undefined && tx.notes !== null && typeof tx.notes !== 'string') {
    return { isValid: false, error: 'O campo de observações deve ser textual.' };
  }

  return { isValid: true };
}

export type CreateInvestmentTransactionParams = Omit<InvestmentTransaction, 'id' | 'createdAt' | 'totalAmount'> & {
  id?: string;
  createdAt?: string;
  totalAmount?: number;
};

/**
 * Cria um objeto InvestmentTransaction seguro e validado,
 * gerando ID com prefixo 'itx' e timestamp de criação.
 */
export function createInvestmentTransaction(
  params: CreateInvestmentTransactionParams,
  existingAssets?: Array<{ id: string }>
): InvestmentTransaction {
  // Se totalAmount não foi explicitamente informado ou é <= 0 para compra/venda, calcula automaticamente
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
    totalAmount: totalAmount as number,
    notes: params.notes && typeof params.notes === 'string' ? params.notes.trim() : undefined,
    createdAt: params.createdAt || new Date().toISOString()
  };
}
