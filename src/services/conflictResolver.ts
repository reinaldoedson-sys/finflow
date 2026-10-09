import type { SyncEntityName, TombstoneMetadata } from './syncTypes';

export type ConflictResolutionAction =
  | 'use_local'
  | 'use_remote'
  | 'merge'
  | 'preserve_both'
  | 'mark_deleted';

export interface ConflictResolutionResult<T = any> {
  action: ConflictResolutionAction;
  resolvedItem?: T;
  divergenceDetected: boolean;
  reason: string;
}

export interface VersionedEntity {
  id: string;
  revision?: number;
  updatedAt?: string;
  createdAt?: string;
  deleted?: boolean;
  deletedAt?: string;
  [key: string]: any;
}

/**
 * Motor de Resolução de Conflitos Granular por Domínio.
 * Aplica regras específicas para Ledgers Financeiros (invioláveis),
 * Snapshots de Saldo/Fatura (LWW permitida) e Entidades Gerais (LWW com revisão).
 */
export class ConflictResolver {
  /**
   * Resolve conflito entre versão local e versão remota de uma entidade.
   */
  resolve<T extends VersionedEntity>(
    entityName: SyncEntityName,
    localItem: T | null,
    remoteItem: T | null,
    pendingTombstone?: TombstoneMetadata
  ): ConflictResolutionResult<T> {
    // 1. Proteção de Tombstone / Soft Delete
    if (pendingTombstone?.deleted) {
      return {
        action: 'mark_deleted',
        divergenceDetected: false,
        reason: 'Entidade possui tombstone pendente local. Não ressuscitar da nuvem.',
      };
    }

    if (localItem?.deleted) {
      const localRev = (localItem as any).tombstoneRevision || localItem.revision || 1;
      const remoteRev = remoteItem?.revision ?? 0;
      if (localRev >= remoteRev) {
        return {
          action: 'mark_deleted',
          divergenceDetected: false,
          reason: 'Entidade possui tombstone local com revisão igual ou superior à nuvem. Não ressuscitar.',
        };
      }
    }

    if (remoteItem?.deleted) {
      const localRev = localItem?.revision ?? 0;
      const remoteRev = remoteItem?.revision ?? 0;
      if (remoteRev >= localRev) {
        return {
          action: 'mark_deleted',
          divergenceDetected: false,
          reason: 'Entidade marcada como soft-delete na nuvem com revisão igual ou superior.',
        };
      }
    }

    // Se um dos lados não existe
    if (!localItem && remoteItem) {
      return {
        action: 'use_remote',
        resolvedItem: remoteItem,
        divergenceDetected: false,
        reason: 'Item recebido da nuvem sem correspondente local.',
      };
    }

    if (localItem && !remoteItem) {
      return {
        action: 'use_local',
        resolvedItem: localItem,
        divergenceDetected: false,
        reason: 'Item existente localmente pendente de sincronização com a nuvem.',
      };
    }

    if (!localItem && !remoteItem) {
      return {
        action: 'use_local',
        divergenceDetected: false,
        reason: 'Nenhum item presente em ambos os lados.',
      };
    }

    // Ambos existem — despachar para a estratégia do domínio específico
    const local = localItem!;
    const remote = remoteItem!;

    switch (entityName) {
      case 'transactions':
        return this.resolveTransactionLedgerConflict(local, remote);

      case 'investmentTransactions':
      case 'goalMovements':
        return this.resolveEventLedgerConflict(entityName, local, remote);

      default:
        return this.resolveGeneralConflict(local, remote);
    }
  }

  /**
   * Estratégia para o Ledger Principal de Transações:
   * Trata como ledger financeiro, evita sobrescrita silenciosa e preserva lançamentos.
   */
  private resolveTransactionLedgerConflict<T extends VersionedEntity>(
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localRev = local.revision ?? 1;
    const remoteRev = remote.revision ?? 1;

    // Se valores financeiros fundamentais (amount, type, date) divergem
    const financialMismatch =
      local.amount !== remote.amount ||
      local.type !== remote.type ||
      local.date !== remote.date ||
      local.accountId !== remote.accountId;

    if (financialMismatch) {
      if (localRev > remoteRev) {
        return {
          action: 'use_local',
          resolvedItem: local,
          divergenceDetected: true,
          reason: 'Conflito financeiro detectado: versão local possui revisão mais recente.',
        };
      } else if (remoteRev > localRev) {
        return {
          action: 'use_remote',
          resolvedItem: remote,
          divergenceDetected: true,
          reason: 'Conflito financeiro detectado: versão remota possui revisão mais recente.',
        };
      } else {
        // Mesma revisão mas valores divergem: preservar o evento local para não sobrescrever silenciosamente
        return {
          action: 'use_local',
          resolvedItem: local,
          divergenceDetected: true,
          reason: 'Divergência financeira com mesma revisão: preservando versão local do ledger.',
        };
      }
    }

    // Se valores financeiros são idênticos e apenas metadados (categoria, descrição) mudaram
    if (localRev >= remoteRev) {
      return {
        action: 'use_local',
        resolvedItem: local,
        divergenceDetected: false,
        reason: 'Transação com revisão local superior ou igual.',
      };
    }

    return {
      action: 'use_remote',
      resolvedItem: remote,
      divergenceDetected: false,
      reason: 'Transação com revisão remota superior.',
    };
  }

  /**
   * Estratégia para Ledgers de Eventos (Investimentos e Metas):
   * Preservação estrita do histórico de eventos sem perda de registros.
   */
  private resolveEventLedgerConflict<T extends VersionedEntity>(
    entityName: string,
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localRev = local.revision ?? 1;
    const remoteRev = remote.revision ?? 1;

    if (localRev >= remoteRev) {
      return {
        action: 'use_local',
        resolvedItem: local,
        divergenceDetected: localRev === remoteRev && local.amount !== remote.amount,
        reason: `Histórico em ${entityName} preservado pela versão local.`,
      };
    }

    return {
      action: 'use_remote',
      resolvedItem: remote,
      divergenceDetected: local.amount !== remote.amount,
      reason: `Histórico em ${entityName} atualizado pela revisão remota.`,
    };
  }

  /**
   * Estratégia para Snapshots e Entidades Gerais:
   * Permite LWW com base em revision e timestamp para manter cache sincronizado.
   */
  resolveSnapshotConflict<T extends VersionedEntity>(
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
    const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();

    // Snapshots: valor mais recente no tempo vence (LWW)
    if (remoteTime > localTime) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: false,
        reason: 'Snapshot remoto mais recente aplicado via LWW.',
      };
    }

    return {
      action: 'use_local',
      resolvedItem: local,
      divergenceDetected: false,
      reason: 'Snapshot local mais recente ou igual preservado.',
    };
  }

  /**
   * Estratégia Geral: LWW baseado em revision e timestamp ISO.
   */
  private resolveGeneralConflict<T extends VersionedEntity>(
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localRev = local.revision ?? 1;
    const remoteRev = remote.revision ?? 1;

    if (localRev > remoteRev) {
      return {
        action: 'use_local',
        resolvedItem: local,
        divergenceDetected: false,
        reason: 'Revisão local maior.',
      };
    }

    if (remoteRev > localRev) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: false,
        reason: 'Revisão remota maior.',
      };
    }

    // Revisões iguais: desempata pelo timestamp
    const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
    const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();

    if (remoteTime > localTime) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: false,
        reason: 'Revisões iguais: timestamp remoto mais recente (LWW).',
      };
    }

    return {
      action: 'use_local',
      resolvedItem: local,
      divergenceDetected: false,
      reason: 'Revisões iguais: timestamp local mais recente ou idêntico.',
    };
  }
}
