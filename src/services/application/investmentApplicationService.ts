import { generateId } from '../../domain/id';
import {
  createInvestmentTransaction,
  validateInvestmentTransaction,
  calculateTransactionTotal,
} from '../../domain/investmentTransactions';
import {
  validateAporteParams,
  prepareAportePlan,
  checkAporteIdempotency,
  type PreparedAportePlan as AporteExecutionPlan,
  type IdempotencyCheckResult,
} from '../../domain/investmentAporte';
import type { FinancialSyncService } from '../financialSyncService';
import type {
  InvestmentAsset,
  InvestmentTransaction,
  Account,
  Category,
  Transaction,
} from '../../types/finance';

export type CreateAssetDTO = Omit<InvestmentAsset, 'id' | 'createdAt'>;
export type UpdateAssetDTO = Partial<InvestmentAsset>;
export type CreateInvestmentTxDTO = Omit<InvestmentTransaction, 'id' | 'createdAt'>;
export type UpdateInvestmentTxDTO = Partial<InvestmentTransaction>;

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

export interface ExecuteAporteResult {
  transactionId: string;
  debitTransactionId?: string;
  plan: AporteExecutionPlan;
  idempotency: ReturnType<typeof checkAporteIdempotency>;
}

/**
 * Application Service responsável pelos casos de uso de Investimentos:
 * - Cadastro e atualização de Ativos (InvestmentAsset)
 * - Exclusão com soft delete / tombstone
 * - Registro de Operações Contábeis no Ledger (InvestmentTransaction: Buy, Sell, Dividend)
 * - Ajuste contábil e reversão
 * - Execução atômica e coordenada de Aportes Financeiros (Aporte + Débito em Conta + Atualização de Ativo)
 *
 * Desacoplado de React, Firestore direto ou IndexedDB direto.
 */
export class InvestmentApplicationService {
  constructor(private syncService: FinancialSyncService) {}

  /**
   * Cria um novo ativo de investimento na carteira.
   */
  async createAsset(data: CreateAssetDTO): Promise<InvestmentAsset> {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('O nome do ativo é obrigatório.');
    }
    if (!data.ticker || data.ticker.trim().length === 0) {
      throw new Error('O ticker do ativo é obrigatório.');
    }

    const newId = generateId('inv');
    const createdAt = new Date().toISOString();
    const newAsset: InvestmentAsset = {
      ...data,
      id: newId,
      createdAt,
    };

    // Persistência Local-First no IndexedDB e SyncQueue
    await this.syncService.saveInvestmentAsset(newAsset);

    return newAsset;
  }

  /**
   * Atualiza os dados de um ativo de investimento existente.
   */
  async updateAsset(
    id: string,
    updates: UpdateAssetDTO,
    currentAsset?: InvestmentAsset
  ): Promise<InvestmentAsset> {
    if (!id) {
      throw new Error('ID do ativo é obrigatório para atualização.');
    }

    const merged = currentAsset ? { ...currentAsset, ...updates } : ({ id, ...updates } as InvestmentAsset);

    // Persistência Local-First no IndexedDB e SyncQueue
    await this.syncService.saveInvestmentAsset(merged);

    return merged;
  }

  /**
   * Exclui um ativo de investimento com soft delete / tombstone.
   */
  async deleteAsset(id: string, linkedTxs: InvestmentTransaction[] = []): Promise<void> {
    if (!id) {
      throw new Error('ID do ativo é obrigatório para exclusão.');
    }

    const activeLinked = linkedTxs.filter(t => t.assetId === id && !t.deleted);
    if (activeLinked.length > 0) {
      console.warn(
        `[InvestmentApplicationService] Ativo ${id} possui ${activeLinked.length} transações vinculadas. ` +
        `Preservando histórico contábil e aplicando soft delete.`
      );
    }

    await this.syncService.deleteInvestmentAsset(id);
  }

  /**
   * Registra uma nova operação contábil no ledger de investimentos com causalidade estrita.
   */
  async createTransaction(
    tx: CreateInvestmentTxDTO,
    existingAssets: InvestmentAsset[]
  ): Promise<InvestmentTransaction> {
    const assetExists = existingAssets.some(a => a.id === tx.assetId);
    if (!assetExists) {
      throw new Error(`Ativo de investimento com ID "${tx.assetId}" não encontrado na carteira.`);
    }

    const validatedTx = createInvestmentTransaction(tx, existingAssets);

    // Persistência Local-First no IndexedDB e SyncQueue com dependência causal
    await this.syncService.saveInvestmentTransaction(validatedTx, {
      dependsOn: [{ entityName: 'investments', entityId: validatedTx.assetId }],
    });

    return validatedTx;
  }

  /**
   * Atualiza uma operação no ledger de investimentos registrando ajuste contábil Local-First.
   */
  async updateTransaction(
    id: string,
    updates: UpdateInvestmentTxDTO,
    currentTx?: InvestmentTransaction,
    existingAssets: InvestmentAsset[] = []
  ): Promise<InvestmentTransaction> {
    if (!currentTx) {
      throw new Error(`Operação de investimento com ID "${id}" não encontrada.`);
    }

    const merged: InvestmentTransaction = {
      ...currentTx,
      ...updates,
      id: currentTx.id,
      createdAt: currentTx.createdAt,
    };

    if (
      updates.totalAmount === undefined &&
      (updates.quantity !== undefined || updates.price !== undefined) &&
      (merged.type === 'buy' || merged.type === 'sell')
    ) {
      merged.totalAmount = calculateTransactionTotal(merged.quantity, merged.price);
    }

    const validation = validateInvestmentTransaction(merged, existingAssets);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Dados da operação inválidos.');
    }

    // Ledger imutável: registra ajuste contábil Local-First
    await this.syncService.recordInvestmentAdjustment(id, merged);

    return merged;
  }

  /**
   * Anula/reverte uma operação no ledger de investimentos com tombstone.
   */
  async deleteTransaction(id: string): Promise<void> {
    if (!id) {
      throw new Error('ID da operação é obrigatório para exclusão.');
    }

    await this.syncService.deleteInvestmentTransaction(id, undefined, 'user_reversal');
  }

  /**
   * Executa um aporte financeiro em ativo de investimento (Operação Atômica Local-First):
   * 1. Validação estrita
   * 2. Preparação de plano determinístico
   * 3. Verificação de idempotência
   * 4. Enfileiramento com causalidade (Asset + Ledger + Débito em Conta)
   */
  async executeAporte(
    params: ExecuteAporteParams,
    context: {
      investments: InvestmentAsset[];
      accounts: Account[];
      categories: Category[];
      investmentTransactions: InvestmentTransaction[];
      transactions: Transaction[];
      applyLocalPersist: (plan: AporteExecutionPlan, idempotency: IdempotencyCheckResult) => Promise<void>;
    }
  ): Promise<ExecuteAporteResult> {
    const { investments, accounts, categories, investmentTransactions, transactions, applyLocalPersist } = context;

    // 1. Pré-validação
    const validation = validateAporteParams(params, investments, accounts);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Parâmetros de aporte inválidos.');
    }

    const targetAsset = investments.find(a => a.id === params.assetId)!;
    const investCat = categories.find(c =>
      c.id === 'cat-invest' || c.name.toLowerCase().includes('invest')
    );
    const categoryId = investCat ? investCat.id : 'cat-outros';

    // 2. Prepara o plano
    const plan = prepareAportePlan(params, targetAsset, categoryId);

    // 3. Verificação de idempotência
    const idempotency = checkAporteIdempotency(
      plan.itxId,
      plan.debitTxId,
      targetAsset.id,
      plan.newQuantity,
      investmentTransactions,
      transactions,
      investments
    );

    if (idempotency.alreadyFullyExecuted) {
      return {
        transactionId: plan.itxId,
        debitTransactionId: plan.debitTxId,
        plan,
        idempotency,
      };
    }

    const correlationId = params.idempotencyKey || `aporte_${plan.itxId}`;
    const operations: Parameters<FinancialSyncService['executeAtomicOperation']>[0]['operations'] = [];

    if (!idempotency.assetAlreadyUpdated) {
      operations.push({
        entityName: 'investments' as const,
        entityId: targetAsset.id,
        action: 'update' as const,
        payload: plan.updatedAsset,
      });
    }

    if (!idempotency.itxExists) {
      operations.push({
        entityName: 'investmentTransactions' as const,
        entityId: plan.itxId,
        action: 'create' as const,
        payload: plan.newInvestmentTransaction,
        dependsOn: [{ entityName: 'investments' as const, entityId: targetAsset.id }],
      });
    }

    if (plan.newDebitTransaction && !idempotency.debitExists && params.sourceAccountId) {
      operations.push({
        entityName: 'transactions' as const,
        entityId: plan.debitTxId!,
        action: 'create' as const,
        payload: plan.newDebitTransaction,
        dependsOn: [{ entityName: 'accounts' as const, entityId: params.sourceAccountId }],
      });
    }

    // 4. Execução atômica no FinancialSyncService
    await this.syncService.executeAtomicOperation({
      correlationId,
      operations,
      applyLocalPersist: async () => {
        await applyLocalPersist(plan, idempotency);
      },
    });

    return {
      transactionId: plan.itxId,
      debitTransactionId: plan.debitTxId,
      plan,
      idempotency,
    };
  }
}

export default InvestmentApplicationService;
