import { InvestmentAsset, InvestmentTransaction } from '../types/finance';
import { toCents, fromCents } from './money';
import { calculateTransactionTotal } from './investmentTransactions';

/**
 * Erro de domínio lançado quando uma operação de venda excede a posição em custódia.
 */
export class InsufficientPositionError extends Error {
  readonly assetId: string;
  readonly availableQuantity: number;
  readonly requestedQuantity: number;
  readonly transactionId?: string;

  constructor(
    assetId: string,
    availableQuantity: number,
    requestedQuantity: number,
    transactionId?: string
  ) {
    super(
      `Operação de venda inválida para o ativo "${assetId}": quantidade solicitada para venda (${requestedQuantity}) é maior que a posição disponível (${availableQuantity}).`
    );
    this.name = 'InsufficientPositionError';
    this.assetId = assetId;
    this.availableQuantity = availableQuantity;
    this.requestedQuantity = requestedQuantity;
    this.transactionId = transactionId;
  }
}

/**
 * Posição derivada de um ativo reconstruída a partir do histórico do ledger (Etapa 10.1).
 */
export interface DerivedInvestmentPosition {
  assetId: string;
  ticker?: string;

  // Posição remanescente atual
  quantity: number;
  totalCost: number;
  remainingCost: number; // alias para totalCost
  averagePrice: number;

  // Totais acumulados no histórico
  totalBought: number;         // volume financeiro total comprado (R$)
  totalBoughtQuantity: number; // quantidade total de cotas compradas
  totalSold: number;           // volume financeiro total vendido (R$)
  totalSoldQuantity: number;   // quantidade total de cotas vendidas
  soldQuantity: number;        // alias para totalSoldQuantity
  totalDividends: number;      // total acumulado em proventos/dividendos

  // Resultado realizado das vendas
  realizedProfitLoss: number;  // lucro ou prejuízo realizado acumulado
  realizedProfit: number;      // alias para realizedProfitLoss

  // Metadados
  transactionsCount: number;
  hasLedger?: boolean;
  isLegacyFallback?: boolean;
}

/**
 * Ordena as transações do ledger em ordem cronológica estrita e determinística.
 * Critério: date ASC -> createdAt ASC -> id ASC.
 * Trata o histórico como imutável sem efeitos colaterais no array original.
 */
export function sortInvestmentTransactionsChronologically(
  transactions: InvestmentTransaction[]
): InvestmentTransaction[] {
  return [...transactions].sort((a, b) => {
    // 1. Data da operação (YYYY-MM-DD)
    const dateA = a.date || '';
    const dateB = b.date || '';
    const dateComp = dateA.localeCompare(dateB);
    if (dateComp !== 0) return dateComp;

    // 2. Timestamp de criação (ISO string)
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    const createdComp = createdA.localeCompare(createdB);
    if (createdComp !== 0) return createdComp;

    // 3. Identificador único como critério de desempate final
    const idA = a.id || '';
    const idB = b.id || '';
    return idA.localeCompare(idB);
  });
}

/**
 * Extrai o valor financeiro total de uma transação de forma segura.
 */
function getTransactionTotal(tx: InvestmentTransaction): number {
  if (typeof tx.totalAmount === 'number' && !isNaN(tx.totalAmount) && tx.totalAmount > 0) {
    return tx.totalAmount;
  }
  return calculateTransactionTotal(tx.quantity, tx.price);
}

/**
 * Extrai o valor de dividendo/provento recebido.
 */
function getDividendAmount(tx: InvestmentTransaction): number {
  if (typeof tx.totalAmount === 'number' && !isNaN(tx.totalAmount) && tx.totalAmount > 0) {
    return tx.totalAmount;
  }
  if (typeof tx.price === 'number' && tx.price > 0 && typeof tx.quantity === 'number' && tx.quantity > 0) {
    return calculateTransactionTotal(tx.quantity, tx.price);
  }
  return 0;
}

/**
 * Motor de Posição de Investimentos baseado no Investment Ledger (Etapa 10.1).
 *
 * Função PURA:
 * - Não altera InvestmentAsset
 * - Não altera InvestmentTransaction
 * - Não acessa Firestore nem localStorage
 * - Não depende de estado do React
 * - Reconstrói deterministicamente a posição atual a partir do histórico imutável
 *
 * @param asset Ativo de investimento alvo
 * @param transactions Lista de transações do ledger
 * @returns Posição derivada com quantidade, preço médio, custos e resultado realizado
 */
export function calculateInvestmentPosition(
  asset: Pick<InvestmentAsset, 'id'> & Partial<Pick<InvestmentAsset, 'ticker'>>,
  transactions: InvestmentTransaction[]
): DerivedInvestmentPosition {
  if (!asset || !asset.id) {
    throw new Error('Ativo de investimento inválido para o cálculo de posição.');
  }

  // Filtra transações que pertençam a este ativo (ou que não tenham assetId explícito em mocks isolados)
  const relevantTxs = transactions.filter(t => !t.assetId || t.assetId === asset.id);

  // Ordenação determinística e cronológica sem mutação
  const sortedTxs = sortInvestmentTransactionsChronologically(relevantTxs);

  let currentQuantity = 0;
  let currentCostCents = 0;

  let totalBoughtCents = 0;
  let totalBoughtQuantity = 0;

  let totalSoldCents = 0;
  let totalSoldQuantity = 0;

  let totalDividendsCents = 0;
  let totalRealizedProfitCents = 0;

  for (const tx of sortedTxs) {
    const rawType = (tx.type || '').toString().toLowerCase().trim();

    if (rawType === 'buy') {
      const txQty = typeof tx.quantity === 'number' && !isNaN(tx.quantity) ? tx.quantity : 0;
      if (txQty <= 0) continue;

      const totalAmount = getTransactionTotal(tx);
      const txCostCents = toCents(totalAmount);

      currentQuantity += txQty;
      currentCostCents += txCostCents;

      totalBoughtCents += txCostCents;
      totalBoughtQuantity += txQty;
    } else if (rawType === 'sell') {
      const txQty = typeof tx.quantity === 'number' && !isNaN(tx.quantity) ? tx.quantity : 0;
      if (txQty <= 0) continue;

      // Validação estrita: não permitir venda maior que a posição disponível
      // Tolerância de ponto flutuante para frações (1e-9)
      if (txQty > currentQuantity + 1e-9) {
        throw new InsufficientPositionError(
          asset.id,
          currentQuantity,
          txQty,
          tx.id
        );
      }

      const totalAmount = getTransactionTotal(tx);
      const saleRevenueCents = toCents(totalAmount);

      // Verifica se é liquidação total da posição
      const isTotalSale = Math.abs(currentQuantity - txQty) < 1e-9;

      let costOfSoldCents: number;
      if (isTotalSale) {
        // Na liquidação total, todo o custo residual restante é baixado exatamente
        costOfSoldCents = currentCostCents;
      } else {
        // Reduz proporcionalmente o custo da posição com base no preço médio vigente
        costOfSoldCents = Math.round(currentCostCents * (txQty / currentQuantity));
      }

      // Resultado realizado = receita da venda - custo da parcela vendida
      const profitLossCents = saleRevenueCents - costOfSoldCents;
      totalRealizedProfitCents += profitLossCents;

      totalSoldCents += saleRevenueCents;
      totalSoldQuantity += txQty;

      if (isTotalSale) {
        currentQuantity = 0;
        currentCostCents = 0;
      } else {
        currentQuantity = currentQuantity - txQty;
        currentCostCents = Math.max(0, currentCostCents - costOfSoldCents);
      }
    } else if (rawType === 'dividend') {
      const divAmount = getDividendAmount(tx);
      totalDividendsCents += toCents(divAmount);
      // Dividendos NÃO alteram quantidade nem preço médio da custódia
    }
  }

  // Preço médio ponderado da posição remanescente
  // Se quantidade for 0, o preço médio é 0
  const averagePrice = currentQuantity > 0
    ? fromCents(Math.round(currentCostCents / currentQuantity))
    : 0;

  const totalCost = fromCents(currentCostCents);
  const totalBought = fromCents(totalBoughtCents);
  const totalSold = fromCents(totalSoldCents);
  const totalDividends = fromCents(totalDividendsCents);
  const realizedProfitLoss = fromCents(totalRealizedProfitCents);

  return {
    assetId: asset.id,
    ticker: asset.ticker,
    quantity: currentQuantity,
    totalCost,
    remainingCost: totalCost,
    averagePrice,
    totalBought,
    totalBoughtQuantity,
    totalSold,
    totalSoldQuantity,
    soldQuantity: totalSoldQuantity,
    totalDividends,
    realizedProfitLoss,
    realizedProfit: realizedProfitLoss,
    transactionsCount: sortedTxs.length,
    hasLedger: sortedTxs.length > 0,
    isLegacyFallback: false
  };
}

/**
 * Calcula em lote as posições derivadas para múltiplos ativos.
 */
export function calculateAllInvestmentPositions(
  assets: InvestmentAsset[],
  transactions: InvestmentTransaction[]
): Map<string, DerivedInvestmentPosition> {
  const result = new Map<string, DerivedInvestmentPosition>();

  for (const asset of assets) {
    const position = calculateInvestmentPosition(asset, transactions);
    result.set(asset.id, position);
  }

  return result;
}

/**
 * Resolve a posição efetiva do investimento:
 * - Se houver transações no ledger, a posição é estritamente derivada do histórico do ledger.
 * - Se NÃO houver transações (investimento legado), utiliza a posição cadastrada no ativo como fallback seguro.
 * Não inventa transações fictícias nem apaga posições existentes.
 */
export function resolveEffectiveInvestmentPosition(
  asset: InvestmentAsset,
  transactions: InvestmentTransaction[]
): DerivedInvestmentPosition {
  const derived = calculateInvestmentPosition(asset, transactions);

  // Se possui transações no ledger, o ledger é a fonte da verdade
  if (derived.transactionsCount > 0) {
    return {
      ...derived,
      hasLedger: true,
      isLegacyFallback: false
    };
  }

  // Fallback seguro para ativos legados sem histórico de transações
  if (asset.quantity > 0 || asset.averagePrice > 0) {
    const legacyCostCents = Math.round(asset.quantity * toCents(asset.averagePrice));
    const legacyCost = fromCents(legacyCostCents);

    return {
      assetId: asset.id,
      ticker: asset.ticker,
      quantity: asset.quantity,
      totalCost: legacyCost,
      remainingCost: legacyCost,
      averagePrice: asset.averagePrice,
      totalBought: legacyCost,
      totalBoughtQuantity: asset.quantity,
      totalSold: 0,
      totalSoldQuantity: 0,
      soldQuantity: 0,
      totalDividends: 0,
      realizedProfitLoss: 0,
      realizedProfit: 0,
      transactionsCount: 0,
      hasLedger: false,
      isLegacyFallback: true
    };
  }

  return {
    ...derived,
    hasLedger: false,
    isLegacyFallback: false
  };
}

/**
 * Mapeia a lista de InvestmentAsset garantindo que quantity e averagePrice
 * reflitam a posição derivada do Investment Ledger (ou fallback legado seguro).
 * Preserva intactos o currentPrice e todos os metadados cadastrais.
 */
export function resolveAllEffectiveInvestments(
  assets: InvestmentAsset[],
  transactions: InvestmentTransaction[]
): InvestmentAsset[] {
  return assets.map(asset => {
    const effectivePos = resolveEffectiveInvestmentPosition(asset, transactions);
    return {
      ...asset,
      quantity: effectivePos.quantity,
      averagePrice: effectivePos.averagePrice
    };
  });
}

/**
 * Calcula em lote as posições efetivas (com suporte a fallback legado) para múltiplos ativos.
 */
export function calculateAllEffectiveInvestmentPositions(
  assets: InvestmentAsset[],
  transactions: InvestmentTransaction[]
): Map<string, DerivedInvestmentPosition> {
  const result = new Map<string, DerivedInvestmentPosition>();

  for (const asset of assets) {
    const position = resolveEffectiveInvestmentPosition(asset, transactions);
    result.set(asset.id, position);
  }

  return result;
}

/**
 * Calcula o valor atual da posição no mercado usando a quantidade derivada do ledger
 * e a cotação de mercado atual do ativo (currentPrice).
 */
export function calculateEffectiveInvestmentValue(
  asset: Pick<InvestmentAsset, 'currentPrice'>,
  position: Pick<DerivedInvestmentPosition, 'quantity'>
): number {
  if (
    typeof position.quantity !== 'number' ||
    typeof asset.currentPrice !== 'number' ||
    isNaN(position.quantity) ||
    isNaN(asset.currentPrice) ||
    position.quantity <= 0 ||
    asset.currentPrice <= 0
  ) {
    return 0;
  }
  const priceCents = toCents(asset.currentPrice);
  const totalValueCents = Math.round(position.quantity * priceCents);
  return fromCents(totalValueCents);
}

export interface PositionDivergence {
  assetId: string;
  ticker?: string;
  hasDivergence: boolean;
  storedQuantity: number;
  derivedQuantity: number;
  storedAveragePrice: number;
  derivedAveragePrice: number;
  quantityDiff: number;
  averagePriceDiff: number;
  hasLedger: boolean;
  isLegacyFallback: boolean;
}

/**
 * Compara a posição armazenada no InvestmentAsset com a posição derivada do Investment Ledger.
 * Utilizado para auditoria e detecção de dados legados ou inconsistentes sem mutação destrutiva.
 */
export function compareAssetWithLedger(
  asset: InvestmentAsset,
  derivedPosition: DerivedInvestmentPosition
): PositionDivergence {
  const quantityDiff = Math.round((asset.quantity - derivedPosition.quantity) * 10000) / 10000;
  const averagePriceDiff = Math.round((asset.averagePrice - derivedPosition.averagePrice) * 100) / 100;
  const hasDivergence = Math.abs(quantityDiff) > 1e-6 || Math.abs(averagePriceDiff) > 0.009;

  return {
    assetId: asset.id,
    ticker: asset.ticker,
    hasDivergence,
    storedQuantity: asset.quantity,
    derivedQuantity: derivedPosition.quantity,
    storedAveragePrice: asset.averagePrice,
    derivedAveragePrice: derivedPosition.averagePrice,
    quantityDiff,
    averagePriceDiff,
    hasLedger: (derivedPosition.transactionsCount || 0) > 0,
    isLegacyFallback: !!derivedPosition.isLegacyFallback
  };
}
