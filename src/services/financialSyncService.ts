import type {
  SyncStatus,
  SyncEvent,
  SyncEventListener,
  SyncEntityName,
  TombstoneMetadata,
  SyncDependency,
  SyncMutationSource,
} from './syncTypes';
import type { SyncQueue } from './syncQueue';
import type { ConflictResolver, VersionedEntity } from './conflictResolver';
import type { CloudSyncProvider } from './providers/CloudSyncProvider';
import { db, FinFlowDatabase } from '../storage/indexedDB/database';
import type {
  TransactionRepository,
  AccountRepository,
  CreditCardRepository,
  InvestmentRepository,
  GoalRepository,
  BudgetRepository,
} from '../repositories/interfaces';
import type {
  Transaction,
  Account,
  CreditCard,
  InvestmentAsset,
  InvestmentTransaction,
  FinancialGoal,
  GoalMovement,
  Budget,
} from '../types/finance';

export interface FinancialRepositories {
  transactions: TransactionRepository;
  accounts: AccountRepository;
  creditCards: CreditCardRepository;
  investments: InvestmentRepository;
  goals: GoalRepository;
  budgets: BudgetRepository;
}

export interface SaveOptions {
  operationId?: string;
  correlationId?: string;
  mutationSource?: SyncMutationSource;
  dependsOn?: SyncDependency[];
}

export interface FinancialSyncServiceConfig {
  repositories: FinancialRepositories;
  syncQueue: SyncQueue;
  conflictResolver: ConflictResolver;
  cloudProvider: CloudSyncProvider;
  database?: FinFlowDatabase;
  autoProcessQueue?: boolean;
}

/**
 * Orquestrador Local-First de Persistência e Sincronização.
 * Totalmente desacoplado de React (zero hooks, zero componentes).
 * Garante latência zero na UI através de escrita local imediata com sincronização em background.
 */
export class FinancialSyncService {
  private status: SyncStatus = 'synced';
  private isOnline: boolean = true;
  private currentProcessingPromise: Promise<void> | null = null;
  private autoProcess: boolean;
  private listeners = new Set<SyncEventListener>();

  private repos: FinancialRepositories;
  private queue: SyncQueue;
  private conflictResolver: ConflictResolver;
  private cloud: CloudSyncProvider;
  private database: FinFlowDatabase;

  constructor(config: FinancialSyncServiceConfig) {
    this.repos = config.repositories;
    this.queue = config.syncQueue;
    this.conflictResolver = config.conflictResolver;
    this.cloud = config.cloudProvider;
    this.database = config.database || db;
    this.autoProcess = config.autoProcessQueue ?? false;

    // Detecta status de conexão nativo do browser sem React
    if (typeof window !== 'undefined' && typeof window.navigator !== 'undefined') {
      this.isOnline = window.navigator.onLine ?? true;
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }
  }

  // =========================================================================
  // Status & Eventos
  // =========================================================================

  getStatus(): SyncStatus {
    return this.status;
  }

  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[FinancialSyncService] Erro no listener:', err);
      }
    }
  }

  private setStatus(newStatus: SyncStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.notify({
        type: 'status_changed',
        status: newStatus,
        timestamp: Date.now(),
      });
    }
  }

  private handleNetworkChange(isOnline: boolean): void {
    this.isOnline = isOnline;
    if (!isOnline) {
      this.setStatus('offline');
    } else {
      this.setStatus('pending');
      this.processQueue().catch(console.error);
    }
  }

  // =========================================================================
  // Escrita Local-First: Transações (Ledger Principal)
  // =========================================================================

  async saveTransaction(transaction: Transaction, opIdOrOptions?: string | SaveOptions): Promise<void> {
    const options: SaveOptions =
      typeof opIdOrOptions === 'string'
        ? { operationId: opIdOrOptions }
        : opIdOrOptions || {};

    const operationId = options.operationId || `op_tx_${transaction.id}_${Date.now()}`;
    const mutationSource = options.mutationSource || 'LOCAL';

    // 1. Escrita Local Imediata (IndexedDB)
    await this.repos.transactions.save(transaction);

    // 2. Controle de Origem: mutações remotas nunca entram na SyncQueue (Anti-Echo)
    if (mutationSource === 'REMOTE') {
      return;
    }

    // 3. Inferência automática de dependências causais se não fornecidas explicitamente
    const dependsOn: SyncDependency[] = options.dependsOn ? [...options.dependsOn] : [];
    if (!options.dependsOn) {
      if (transaction.accountId) {
        dependsOn.push({ entityName: 'accounts', entityId: transaction.accountId });
      }
      if (transaction.creditCardId) {
        dependsOn.push({ entityName: 'creditCards', entityId: transaction.creditCardId });
      }
      if (transaction.targetAccountId) {
        dependsOn.push({ entityName: 'accounts', entityId: transaction.targetAccountId });
      }
    }

    // 4. Enfileiramento com causalidade, correlação e idempotência
    await this.queue.enqueue({
      operationId,
      correlationId: options.correlationId,
      mutationSource,
      entityName: 'transactions',
      entityId: transaction.id,
      action: 'create',
      payload: transaction,
      revision: (transaction as any).revision || 1,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async deleteTransaction(id: string, opId?: string): Promise<void> {
    const operationId = opId || `op_tx_del_${id}_${Date.now()}`;
    const now = new Date().toISOString();

    const existing = await this.repos.transactions.getById(id);
    const tombstoneRevision = ((existing as any)?.tombstoneRevision || 1) + 1;

    const tombstone: TombstoneMetadata = {
      deleted: true,
      deletedAt: now,
      tombstoneRevision,
    };

    // Soft delete / tombstone no repositório local sem exclusão física imediata
    if (existing) {
      await this.repos.transactions.save({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    } else {
      await this.repos.transactions.save({
        id,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    }

    // Enfileira com soft delete / tombstone
    await this.queue.enqueue({
      operationId,
      entityName: 'transactions',
      entityId: id,
      action: 'delete',
      tombstone,
      revision: tombstoneRevision,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  // =========================================================================
  // Escrita Local-First: Contas & Snapshots
  // =========================================================================

  async saveAccount(account: Account, opIdOrOptions?: string | SaveOptions): Promise<void> {
    const options: SaveOptions =
      typeof opIdOrOptions === 'string'
        ? { operationId: opIdOrOptions }
        : opIdOrOptions || {};

    const operationId = options.operationId || `op_acc_${account.id}_${Date.now()}`;
    const mutationSource = options.mutationSource || 'LOCAL';

    await this.repos.accounts.save(account);

    // Controle de Origem: mutações remotas não entram na SyncQueue (Anti-Echo)
    if (mutationSource === 'REMOTE') {
      return;
    }

    await this.queue.enqueue({
      operationId,
      correlationId: options.correlationId,
      mutationSource,
      entityName: 'accounts',
      entityId: account.id,
      action: 'create',
      payload: account,
      revision: (account as any).revision || 1,
      dependsOn: options.dependsOn,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async deleteAccount(id: string, opId?: string): Promise<void> {
    const operationId = opId || `op_acc_del_${id}_${Date.now()}`;
    const now = new Date().toISOString();

    const existing = await this.repos.accounts.getById(id, true);
    const tombstoneRevision = ((existing as any)?.tombstoneRevision || 1) + 1;

    const tombstone: TombstoneMetadata = {
      deleted: true,
      deletedAt: now,
      tombstoneRevision,
    };

    // Soft delete / tombstone no repositório local sem exclusão física imediata
    // Preserva integridade referencial para transações vinculadas à conta
    if (existing) {
      await this.repos.accounts.save({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    } else {
      await this.repos.accounts.save({
        id,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    }

    // Enfileira com soft delete / tombstone
    await this.queue.enqueue({
      operationId,
      entityName: 'accounts',
      entityId: id,
      action: 'delete',
      tombstone,
      revision: tombstoneRevision,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async saveAccountBalanceSnapshot(id: string, balanceSnapshot: number): Promise<void> {
    // Snapshots são aplicados diretamente no repositório local sem sujar a fila como mutação crítica
    await this.repos.accounts.saveBalanceSnapshot(id, balanceSnapshot);
  }

  // =========================================================================
  // Escrita Local-First: Cartões de Crédito
  // =========================================================================

  async saveCreditCard(card: CreditCard, opIdOrOptions?: string | SaveOptions): Promise<void> {
    const options: SaveOptions =
      typeof opIdOrOptions === 'string'
        ? { operationId: opIdOrOptions }
        : opIdOrOptions || {};

    const operationId = options.operationId || `op_card_${card.id}_${Date.now()}`;
    const mutationSource = options.mutationSource || 'LOCAL';

    await this.repos.creditCards.save(card);

    if (mutationSource === 'REMOTE') {
      return;
    }

    // Separar claramente campos sincronizados vs derivados:
    // Sincronizados: name, bankName, limit, closingDay, dueDay, color, brand, etc.
    // Derivados: currentInvoice NUNCA entra na SyncQueue nem é transmitido como fonte da verdade!
    const { currentInvoice, ...syncPayload } = card;

    await this.queue.enqueue({
      operationId,
      correlationId: options.correlationId,
      mutationSource,
      entityName: 'creditCards',
      entityId: card.id,
      action: 'create',
      payload: syncPayload,
      revision: (card as any).revision || 1,
      dependsOn: options.dependsOn,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async deleteCreditCard(id: string, opId?: string): Promise<void> {
    const operationId = opId || `op_card_del_${id}_${Date.now()}`;
    const now = new Date().toISOString();

    const existing = await this.repos.creditCards.getById(id, true);
    const tombstoneRevision = ((existing as any)?.tombstoneRevision || 1) + 1;

    const tombstone: TombstoneMetadata = {
      deleted: true,
      deletedAt: now,
      tombstoneRevision,
    };

    // Soft delete / tombstone no repositório local sem exclusão física imediata
    // Preserva integridade referencial para transações e parcelamentos vinculados ao cartão
    if (existing) {
      await this.repos.creditCards.save({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    } else {
      await this.repos.creditCards.save({
        id,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    }

    // Enfileira com soft delete / tombstone
    await this.queue.enqueue({
      operationId,
      entityName: 'creditCards',
      entityId: id,
      action: 'delete',
      tombstone,
      revision: tombstoneRevision,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async saveCreditCardInvoiceSnapshot(id: string, invoiceSnapshot: number): Promise<void> {
    // Snapshots derivados são apenas cache local e NUNCA entram na SyncQueue
    await this.repos.creditCards.saveInvoiceSnapshot(id, invoiceSnapshot);
  }

  // =========================================================================
  // Hidratação Inicial / Reativa Cloud → IndexedDB (Etapa 2.7 - Anti-Echo)
  // =========================================================================

  /**
   * Hidrata dados recebidos da nuvem persistindo diretamente no IndexedDB.
   * Aplica ConflictResolver, respeita tombstones locais, suporta transação Dexie
   * e NUNCA gera itens na SyncQueue (zero eco).
   */
  async hydrateFromCloud<T extends VersionedEntity>(
    entityName: SyncEntityName,
    remoteItems: T[]
  ): Promise<{ persisted: number; conflictsResolved: number; tombstonesRespected: number }> {
    if (!remoteItems || remoteItems.length === 0) {
      return { persisted: 0, conflictsResolved: 0, tombstonesRespected: 0 };
    }

    let persisted = 0;
    let conflictsResolved = 0;
    let tombstonesRespected = 0;

    const itemsToSave: any[] = [];

    for (const remoteItem of remoteItems) {
      let localItem: any = null;

      // Consulta estado local com suporte a tombstone
      switch (entityName) {
        case 'transactions':
          localItem = await this.repos.transactions.getById(remoteItem.id);
          break;
        case 'accounts':
          localItem = await this.repos.accounts.getById(remoteItem.id, true);
          break;
        case 'creditCards':
          localItem = await this.repos.creditCards.getById(remoteItem.id, true);
          break;
        case 'investments':
          localItem = await this.repos.investments.getAssetById(remoteItem.id, true);
          break;
        case 'investmentTransactions':
          localItem = await this.repos.investments.getTransactionById(remoteItem.id, true);
          break;
        case 'goals':
          localItem = await this.repos.goals.getGoalById(remoteItem.id);
          break;
        case 'goalMovements':
          localItem = await this.repos.goals.getMovementById(remoteItem.id);
          break;
        case 'budgets':
          localItem = await this.repos.budgets.getById(remoteItem.id);
          break;
      }

      // Aplica ConflictResolver
      const resolution = this.conflictResolver.resolve(entityName, localItem, remoteItem);

      if (resolution.divergenceDetected) {
        conflictsResolved++;
      }

      if (resolution.action === 'mark_deleted') {
        tombstonesRespected++;
        const tombstoneItem = {
          ...(localItem || remoteItem),
          deleted: true,
          deletedAt:
            (localItem as any)?.deletedAt ||
            (remoteItem as any)?.deletedAt ||
            new Date().toISOString(),
          tombstoneRevision: Math.max(
            (localItem as any)?.tombstoneRevision || 1,
            (remoteItem as any)?.tombstoneRevision || 1
          ),
        };
        itemsToSave.push(tombstoneItem);
      } else if (resolution.action === 'use_remote' || resolution.action === 'merge') {
        itemsToSave.push(resolution.resolvedItem || remoteItem);
      } else if (resolution.action === 'use_local') {
        // Preserva local (não sobrescreve)
      }
    }

    if (itemsToSave.length > 0) {
      const applyPersist = async () => {
        switch (entityName) {
          case 'transactions':
            await this.repos.transactions.saveBatch(itemsToSave);
            break;
          case 'accounts':
            await this.repos.accounts.saveBatch(itemsToSave);
            break;
          case 'creditCards':
            await this.repos.creditCards.saveBatch(itemsToSave);
            break;
          case 'investments':
            await this.repos.investments.saveAssetsBatch(itemsToSave);
            break;
          case 'investmentTransactions':
            await this.repos.investments.saveTransactionsBatch(itemsToSave);
            break;
          case 'goals':
            await this.repos.goals.saveGoalsBatch(itemsToSave);
            break;
          case 'goalMovements':
            await this.repos.goals.saveMovementsBatch(itemsToSave);
            break;
          case 'budgets':
            await this.repos.budgets.saveBatch(itemsToSave);
            break;
        }
      };

      // Usa transação Dexie se a database disponibilizar o método transaction
      if (this.database && typeof (this.database as any).transaction === 'function') {
        try {
          await (this.database as any).transaction(
            'rw',
            [
              (this.database as any).transactions,
              (this.database as any).accounts,
              (this.database as any).creditCards,
              (this.database as any).investments,
              (this.database as any).investmentTransactions,
              (this.database as any).goals,
              (this.database as any).goalMovements,
              (this.database as any).budgets,
            ].filter(Boolean),
            applyPersist
          );
        } catch {
          await applyPersist();
        }
      } else {
        await applyPersist();
      }

      persisted = itemsToSave.length;
    }

    // Regra Anti-Echo Estrita: a SyncQueue nunca é modificada aqui
    return { persisted, conflictsResolved, tombstonesRespected };
  }

  // =========================================================================
  // Operações Atômicas Coordenadas Multi-Entidade (Etapa 2.8)
  // =========================================================================

  /**
   * Executa uma operação atômica coordenada entre múltiplos domínios (ex: aporte de investimento).
   * 1. Executa a persistência local (IndexedDB) dentro de uma transação Dexie.
   *    Se falhar, faz rollback automático e propaga o erro sem tocar na SyncQueue.
   * 2. Após sucesso local confirmado, enfileira todas as operações na SyncQueue
   *    compartilhando o mesmo correlationId e suas dependências causais.
   * 3. Dispara o processamento em background da fila.
   */
  async executeAtomicOperation(options: {
    correlationId: string;
    operations: {
      entityName: SyncEntityName;
      entityId: string;
      action: 'create' | 'update' | 'delete';
      payload?: any;
      dependsOn?: SyncDependency[];
      tombstone?: TombstoneMetadata;
    }[];
    applyLocalPersist: () => Promise<void>;
  }): Promise<void> {
    const { correlationId, operations, applyLocalPersist } = options;

    if (!correlationId || correlationId.trim().length === 0) {
      throw new Error('executeAtomicOperation requer correlationId obrigatório');
    }

    // 1. Persistência local atômica via transação Dexie
    if (this.database && typeof (this.database as any).transaction === 'function') {
      await (this.database as any).transaction(
        'rw',
        [
          (this.database as any).transactions,
          (this.database as any).accounts,
          (this.database as any).creditCards,
          (this.database as any).investments,
          (this.database as any).investmentTransactions,
        ].filter(Boolean),
        applyLocalPersist
      );
    } else {
      await applyLocalPersist();
    }

    // 2. Enfileiramento coordenado na SyncQueue com correlationId compartilhado
    for (const op of operations) {
      const operationId = `op_atomic_${correlationId}_${op.entityName}_${op.entityId}_${Date.now()}`;
      await this.queue.enqueue({
        operationId,
        correlationId,
        mutationSource: 'LOCAL',
        entityName: op.entityName,
        entityId: op.entityId,
        action: op.action,
        payload: op.payload,
        tombstone: op.tombstone,
        dependsOn: op.dependsOn,
      });
    }

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  // =========================================================================
  // Escrita Local-First: Investimentos (Ativos & Ledger Imutável)
  // =========================================================================

  async saveInvestmentAsset(asset: InvestmentAsset, opIdOrOptions?: string | SaveOptions): Promise<void> {
    const options: SaveOptions =
      typeof opIdOrOptions === 'string'
        ? { operationId: opIdOrOptions }
        : opIdOrOptions || {};

    const operationId = options.operationId || `op_ast_${asset.id}_${Date.now()}`;
    const mutationSource = options.mutationSource || 'LOCAL';

    // Garante que campos derivados (currentValue, profit, profitability, performance)
    // NUNCA sejam persistidos nem transmitidos como fonte da verdade
    const {
      currentValue,
      profit,
      profitability,
      performance,
      ...cleanAsset
    } = asset as any;

    await this.repos.investments.saveAsset(cleanAsset);

    if (mutationSource === 'REMOTE') {
      return;
    }

    await this.queue.enqueue({
      operationId,
      correlationId: options.correlationId,
      mutationSource,
      entityName: 'investments',
      entityId: asset.id,
      action: 'create',
      payload: cleanAsset,
      dependsOn: options.dependsOn,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async deleteInvestmentAsset(id: string, opId?: string): Promise<void> {
    const operationId = opId || `op_ast_del_${id}_${Date.now()}`;
    const now = new Date().toISOString();

    const existing = await this.repos.investments.getAssetById(id, true);
    const tombstoneRevision = ((existing as any)?.tombstoneRevision || 1) + 1;

    const tombstone: TombstoneMetadata = {
      deleted: true,
      deletedAt: now,
      tombstoneRevision,
    };

    // Soft delete / tombstone preservando integridade referencial para o ledger
    if (existing) {
      await this.repos.investments.saveAsset({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    } else {
      await this.repos.investments.saveAsset({
        id,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    }

    await this.queue.enqueue({
      operationId,
      entityName: 'investments',
      entityId: id,
      action: 'delete',
      tombstone,
      revision: tombstoneRevision,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async saveInvestmentTransaction(tx: InvestmentTransaction, opIdOrOptions?: string | SaveOptions): Promise<void> {
    const options: SaveOptions =
      typeof opIdOrOptions === 'string'
        ? { operationId: opIdOrOptions }
        : opIdOrOptions || {};

    const operationId = options.operationId || `op_invtx_${tx.id}_${Date.now()}`;
    const mutationSource = options.mutationSource || 'LOCAL';

    // Gravação no ledger
    await this.repos.investments.saveTransaction(tx);

    if (mutationSource === 'REMOTE') {
      return;
    }

    // Inferência automática de dependência causal: o evento depende do ativo correspondente
    const dependsOn: SyncDependency[] = options.dependsOn ? [...options.dependsOn] : [];
    if (!options.dependsOn && tx.assetId) {
      dependsOn.push({ entityName: 'investments', entityId: tx.assetId });
    }

    await this.queue.enqueue({
      operationId,
      correlationId: options.correlationId,
      mutationSource,
      entityName: 'investmentTransactions',
      entityId: tx.id,
      action: 'create',
      payload: tx,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async deleteInvestmentTransaction(id: string, opId?: string, reason?: string): Promise<void> {
    const operationId = opId || `op_invtx_del_${id}_${Date.now()}`;
    const now = new Date().toISOString();

    const existing = await this.repos.investments.getTransactionById(id, true);
    const tombstoneRevision = ((existing as any)?.tombstoneRevision || 1) + 1;

    const tombstone: TombstoneMetadata = {
      deleted: true,
      deletedAt: now,
      tombstoneRevision,
      reason: reason || 'reversal',
    };

    // Ledger imutável: grava anulação contábil / tombstone sem deletar fisicamente o histórico
    if (existing) {
      await this.repos.investments.saveTransaction({
        ...existing,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    } else {
      await this.repos.investments.saveTransaction({
        id,
        deleted: true,
        deletedAt: now,
        tombstoneRevision,
      } as any);
    }

    await this.queue.enqueue({
      operationId,
      entityName: 'investmentTransactions',
      entityId: id,
      action: 'delete',
      tombstone,
      revision: tombstoneRevision,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  /**
   * Registra um ajuste contábil ou alteração no ledger imutável de investimentos.
   * Não sobrescreve o histórico destrutivamente; preserva a integridade contábil e gera mutação de update/adjustment.
   */
  async recordInvestmentAdjustment(
    id: string,
    updatedTx: InvestmentTransaction,
    opIdOrOptions?: string | SaveOptions
  ): Promise<void> {
    const options: SaveOptions =
      typeof opIdOrOptions === 'string'
        ? { operationId: opIdOrOptions }
        : opIdOrOptions || {};

    const operationId = options.operationId || `op_invtx_adj_${id}_${Date.now()}`;
    const mutationSource = options.mutationSource || 'LOCAL';

    await this.repos.investments.saveTransaction(updatedTx);

    if (mutationSource === 'REMOTE') {
      return;
    }

    const dependsOn: SyncDependency[] = options.dependsOn ? [...options.dependsOn] : [];
    if (!options.dependsOn && updatedTx.assetId) {
      dependsOn.push({ entityName: 'investments', entityId: updatedTx.assetId });
    }

    await this.queue.enqueue({
      operationId,
      correlationId: options.correlationId,
      mutationSource,
      entityName: 'investmentTransactions',
      entityId: id,
      action: 'update',
      payload: updatedTx,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  /**
   * Estorna uma operação do ledger imutável (Reversal Event).
   * Mantém o registro histórico preservado com soft-delete/tombstone e enfileira na SyncQueue.
   */
  async reverseInvestmentTransaction(id: string, reason = 'user_reversal', opId?: string): Promise<void> {
    await this.deleteInvestmentTransaction(id, opId, reason);
  }

  /**
   * Atualiza cotação de mercado de um ativo como cache externo (Market Quote).
   * Nunca gera itens na SyncQueue nem satura a esteira contábil.
   */
  async updateInvestmentMarketQuote(
    id: string,
    currentPrice: number,
    metadata?: { previousClose?: number; changePercent?: number; lastPriceUpdate?: string }
  ): Promise<void> {
    const existing = await this.repos.investments.getAssetById(id);
    if (existing) {
      await this.repos.investments.saveAsset({
        ...existing,
        currentPrice,
        ...(metadata || {}),
      });
    }
  }

  // =========================================================================
  // Escrita Local-First: Metas Financeiras (Metas & Ledger)
  // =========================================================================

  async saveGoal(goal: FinancialGoal, opId?: string): Promise<void> {
    const operationId = opId || `op_goal_${goal.id}_${Date.now()}`;
    await this.repos.goals.saveGoal(goal);

    await this.queue.enqueue({
      operationId,
      entityName: 'goals',
      entityId: goal.id,
      action: 'create',
      payload: goal,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async saveGoalMovement(movement: GoalMovement, opId?: string): Promise<void> {
    const operationId = opId || `op_gmov_${movement.id}_${Date.now()}`;
    await this.repos.goals.saveMovement(movement);

    await this.queue.enqueue({
      operationId,
      entityName: 'goalMovements',
      entityId: movement.id,
      action: 'create',
      payload: movement,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  // =========================================================================
  // Escrita Local-First: Orçamentos
  // =========================================================================

  async saveBudget(budget: Budget, opId?: string): Promise<void> {
    const operationId = opId || `op_bdg_${budget.id}_${Date.now()}`;
    await this.repos.budgets.save(budget);

    await this.queue.enqueue({
      operationId,
      entityName: 'budgets',
      entityId: budget.id,
      action: 'create',
      payload: budget,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  // =========================================================================
  // Processamento em Background da Fila de Sincronização
  // =========================================================================

  private triggerBackgroundProcessing(): void {
    if (!this.autoProcess || !this.isOnline) return;
    this.processQueue().catch(err => {
      console.error('[FinancialSyncService] Erro no processamento assíncrono da fila:', err);
    });
  }

  async processQueue(): Promise<void> {
    if (!this.isOnline) {
      this.setStatus('offline');
      return;
    }

    if (this.currentProcessingPromise) {
      return this.currentProcessingPromise;
    }

    this.currentProcessingPromise = this.executeProcessQueue().finally(() => {
      this.currentProcessingPromise = null;
    });

    return this.currentProcessingPromise;
  }

  private async executeProcessQueue(): Promise<void> {
    this.setStatus('syncing');

    try {
      while (true) {
        const batch = await this.queue.getNextEligibleBatch(20);

        if (batch.length === 0) {
          break;
        }

        let processedInBatch = 0;
        for (const item of batch) {
          try {
            if (item.action === 'delete') {
              const result = await this.cloud.delete(
                item.entityName,
                item.entityId,
                item.tombstone || {
                  deleted: true,
                  deletedAt: new Date().toISOString(),
                  tombstoneRevision: item.revision,
                }
              );

              if (result.success) {
                await this.queue.dequeue(item.id);
                this.notify({ type: 'item_synced', item, timestamp: Date.now() });
                processedInBatch++;
              } else {
                await this.queue.recordFailure(item.id, result.error || 'Erro ao sincronizar exclusão');
              }
            } else {
              const result = await this.cloud.push(item);
              if (result.success) {
                await this.queue.dequeue(item.id);
                this.notify({ type: 'item_synced', item, timestamp: Date.now() });
                processedInBatch++;
              } else {
                await this.queue.recordFailure(item.id, result.error || 'Erro ao enviar mutação');
              }
            }
          } catch (err: any) {
            await this.queue.recordFailure(item.id, err?.message || 'Erro inesperado');
          }
        }

        // Se nenhum item foi processado com sucesso (ex: falhas de rede), interrompe o loop
        if (processedInBatch === 0) {
          break;
        }
      }

      const remaining = await this.queue.count();
      this.setStatus(remaining > 0 ? 'pending' : 'synced');
    } catch (error: any) {
      console.error('[FinancialSyncService] Falha geral ao processar fila:', error);
      this.setStatus('error');
    }
  }
}
