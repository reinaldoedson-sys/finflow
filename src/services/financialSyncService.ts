import type {
  SyncStatus,
  SyncEvent,
  SyncEventListener,
  SyncEntityName,
  TombstoneMetadata,
} from './syncTypes';
import type { SyncQueue } from './syncQueue';
import type { ConflictResolver } from './conflictResolver';
import type { CloudSyncProvider } from './providers/CloudSyncProvider';
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

export interface FinancialSyncServiceConfig {
  repositories: FinancialRepositories;
  syncQueue: SyncQueue;
  conflictResolver: ConflictResolver;
  cloudProvider: CloudSyncProvider;
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

  constructor(config: FinancialSyncServiceConfig) {
    this.repos = config.repositories;
    this.queue = config.syncQueue;
    this.conflictResolver = config.conflictResolver;
    this.cloud = config.cloudProvider;
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

  async saveTransaction(transaction: Transaction, opId?: string): Promise<void> {
    const operationId = opId || `op_tx_${transaction.id}_${Date.now()}`;

    // 1. Escrita Local Imediata (IndexedDB)
    await this.repos.transactions.save(transaction);

    // 2. Enfileiramento com idempotência
    await this.queue.enqueue({
      operationId,
      entityName: 'transactions',
      entityId: transaction.id,
      action: 'create',
      payload: transaction,
      revision: (transaction as any).revision || 1,
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

  async saveAccount(account: Account, opId?: string): Promise<void> {
    const operationId = opId || `op_acc_${account.id}_${Date.now()}`;
    await this.repos.accounts.save(account);

    await this.queue.enqueue({
      operationId,
      entityName: 'accounts',
      entityId: account.id,
      action: 'create',
      payload: account,
      revision: (account as any).revision || 1,
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

  async saveCreditCard(card: CreditCard, opId?: string): Promise<void> {
    const operationId = opId || `op_card_${card.id}_${Date.now()}`;
    await this.repos.creditCards.save(card);

    await this.queue.enqueue({
      operationId,
      entityName: 'creditCards',
      entityId: card.id,
      action: 'create',
      payload: card,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async saveCreditCardInvoiceSnapshot(id: string, invoiceSnapshot: number): Promise<void> {
    await this.repos.creditCards.saveInvoiceSnapshot(id, invoiceSnapshot);
  }

  // =========================================================================
  // Escrita Local-First: Investimentos (Ativos & Ledger)
  // =========================================================================

  async saveInvestmentAsset(asset: InvestmentAsset, opId?: string): Promise<void> {
    const operationId = opId || `op_ast_${asset.id}_${Date.now()}`;
    await this.repos.investments.saveAsset(asset);

    await this.queue.enqueue({
      operationId,
      entityName: 'investments',
      entityId: asset.id,
      action: 'create',
      payload: asset,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
  }

  async saveInvestmentTransaction(tx: InvestmentTransaction, opId?: string): Promise<void> {
    const operationId = opId || `op_invtx_${tx.id}_${Date.now()}`;
    await this.repos.investments.saveTransaction(tx);

    await this.queue.enqueue({
      operationId,
      entityName: 'investmentTransactions',
      entityId: tx.id,
      action: 'create',
      payload: tx,
    });

    this.setStatus('pending');
    this.triggerBackgroundProcessing();
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
      const batch = await this.queue.getNextEligibleBatch(20);

      if (batch.length === 0) {
        const totalPending = await this.queue.count();
        this.setStatus(totalPending > 0 ? 'pending' : 'synced');
        return;
      }

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
            } else {
              await this.queue.recordFailure(item.id, result.error || 'Erro ao sincronizar exclusão');
            }
          } else {
            const result = await this.cloud.push(item);
            if (result.success) {
              await this.queue.dequeue(item.id);
              this.notify({ type: 'item_synced', item, timestamp: Date.now() });
            } else {
              await this.queue.recordFailure(item.id, result.error || 'Erro ao enviar mutação');
            }
          }
        } catch (err: any) {
          await this.queue.recordFailure(item.id, err?.message || 'Erro inesperado');
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
