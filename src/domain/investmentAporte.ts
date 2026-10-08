import { InvestmentAsset, InvestmentTransaction, Transaction, Account } from '../types/finance';
import { calculateAportePosition } from './investments';
import { calculateTransactionTotal, isValidDateString } from './investmentTransactions';
import { generateId } from './id';

export interface ExecuteAporteParams {
  assetId: string;
  quantity: number;
  price: number;
  date: string;
  sourceAccountId?: string;
  notes?: string;
  idempotencyKey?: string;
  transactionId?: string;
  debitTransactionId?: string;
}

export interface AporteValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Pré-validação estrita de todos os parâmetros de um aporte antes de tocar no estado ou na nuvem.
 * Previne falhas parciais em estágios intermediários (Etapa 9.6B).
 */
export function validateAporteParams(
  params: ExecuteAporteParams,
  assets: InvestmentAsset[],
  accounts?: Account[]
): AporteValidationResult {
  if (!params || typeof params !== 'object') {
    return { isValid: false, error: 'Parâmetros de aporte não informados.' };
  }

  // 1. assetId
  if (!params.assetId || typeof params.assetId !== 'string' || params.assetId.trim().length === 0) {
    return { isValid: false, error: 'O código/ID do ativo é obrigatório.' };
  }

  const targetAsset = assets.find(a => a.id === params.assetId);
  if (!targetAsset) {
    return { isValid: false, error: `Ativo com ID "${params.assetId}" não encontrado na carteira.` };
  }

  // 2. Quantidade
  if (
    typeof params.quantity !== 'number' ||
    isNaN(params.quantity) ||
    !isFinite(params.quantity) ||
    params.quantity <= 0
  ) {
    return { isValid: false, error: 'A quantidade do aporte deve ser maior que zero.' };
  }

  // 3. Preço
  if (
    typeof params.price !== 'number' ||
    isNaN(params.price) ||
    !isFinite(params.price) ||
    params.price <= 0
  ) {
    return { isValid: false, error: 'O preço unitário do aporte deve ser maior que zero.' };
  }

  // 4. Data (formato YYYY-MM-DD e data de calendário real)
  if (!isValidDateString(params.date)) {
    return { isValid: false, error: 'Data do aporte inválida. Utilize o formato AAAA-MM-DD.' };
  }

  // 5. Conta bancária para débito (se informada)
  if (params.sourceAccountId && params.sourceAccountId.trim().length > 0) {
    if (accounts && !accounts.some(acc => acc.id === params.sourceAccountId)) {
      return { isValid: false, error: `Conta bancária com ID "${params.sourceAccountId}" não encontrada para débito do aporte.` };
    }
  }

  return { isValid: true };
}

export interface PreparedAportePlan {
  itxId: string;
  debitTxId?: string;
  targetAsset: InvestmentAsset;
  totalAmount: number;
  newQuantity: number;
  newAveragePrice: number;
  newInvestmentTransaction: InvestmentTransaction;
  updatedAsset: InvestmentAsset;
  newDebitTransaction?: Transaction;
}

/**
 * Prepara deterministicamente todos os registros envolvidos no aporte antes de persistir (Etapa 9.6B).
 * Utiliza IDs idempotentes/estáveis para prevenir duplicação em caso de retry.
 */
export function prepareAportePlan(
  params: ExecuteAporteParams,
  targetAsset: InvestmentAsset,
  investCategoryId: string = 'cat-outros',
  fixedTimestamp?: string
): PreparedAportePlan {
  const opId = params.idempotencyKey ? params.idempotencyKey.replace(/^(aporte-|itx-|tx-)/, '') : generateId('aporte').replace('aporte-', '');
  const itxId = params.transactionId || `itx-${opId}`;
  const totalAmount = calculateTransactionTotal(params.quantity, params.price);
  const now = fixedTimestamp || new Date().toISOString();

  // 1. Recalcula a nova posição (quantidade e preço médio ponderado)
  const { newQuantity, newAveragePrice } = calculateAportePosition(
    { quantity: targetAsset.quantity, averagePrice: targetAsset.averagePrice },
    { quantity: params.quantity, price: params.price }
  );

  // 2. Prepara InvestmentTransaction ('buy')
  const newInvestmentTransaction: InvestmentTransaction = {
    id: itxId,
    assetId: targetAsset.id,
    type: 'buy',
    date: params.date,
    quantity: params.quantity,
    price: params.price,
    totalAmount,
    notes: params.notes?.trim() || `Aporte de ${params.quantity} cotas em ${targetAsset.ticker}`,
    createdAt: now
  };

  // 3. Prepara o InvestmentAsset atualizado
  const updatedAsset: InvestmentAsset = {
    ...targetAsset,
    quantity: newQuantity,
    averagePrice: newAveragePrice,
    lastPriceUpdate: now
  };

  // 4. Prepara a Transaction bancária (débito), se conta bancária foi informada
  let debitTxId: string | undefined = undefined;
  let newDebitTransaction: Transaction | undefined = undefined;

  if (params.sourceAccountId && params.sourceAccountId.trim().length > 0) {
    debitTxId = params.debitTransactionId || `tx-${opId}`;
    newDebitTransaction = {
      id: debitTxId,
      description: `Aporte - ${targetAsset.ticker} (${params.quantity} cotas)`,
      amount: totalAmount,
      type: 'expense',
      accountId: params.sourceAccountId,
      categoryId: investCategoryId,
      paymentMethod: 'transfer',
      date: params.date,
      status: 'completed',
      notes: `Aporte de ${params.quantity} cotas a ${params.price} em ${targetAsset.ticker}. Operação: ${itxId}`,
      createdAt: now
    };
  }

  return {
    itxId,
    debitTxId,
    targetAsset,
    totalAmount,
    newQuantity,
    newAveragePrice,
    newInvestmentTransaction,
    updatedAsset,
    newDebitTransaction
  };
}

export interface IdempotencyCheckResult {
  alreadyFullyExecuted: boolean;
  itxExists: boolean;
  debitExists: boolean;
  assetAlreadyUpdated: boolean;
}

/**
 * Verifica se esta operação ou partes dela já foram executadas previamente (prevenção de duplicação em retry).
 * Se a transação do ledger (itxId) já existir, ela já foi computada na posição do ativo.
 */
export function checkAporteIdempotency(
  itxId: string,
  debitTxId: string | undefined,
  targetAssetId: string,
  newQuantity: number,
  existingTxs: InvestmentTransaction[],
  existingDebits: Transaction[],
  existingAssets: InvestmentAsset[]
): IdempotencyCheckResult {
  const itxExists = existingTxs.some(t => t.id === itxId);
  const debitExists = debitTxId ? existingDebits.some(t => t.id === debitTxId) : true;
  const targetAsset = existingAssets.find(a => a.id === targetAssetId);
  // Se a transação já foi registrada no ledger para este ID de aporte ou o ativo já reflete a quantidade
  const assetAlreadyUpdated = itxExists || (targetAsset !== undefined && targetAsset.quantity === newQuantity);

  return {
    alreadyFullyExecuted: itxExists && debitExists && assetAlreadyUpdated,
    itxExists,
    debitExists,
    assetAlreadyUpdated
  };
}
