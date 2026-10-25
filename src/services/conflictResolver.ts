import type { SyncEntityName, TombstoneMetadata } from './syncTypes';
import type { SyncMetadata } from '../types/finance';

export type ConflictResolutionAction =
  | 'use_local'
  | 'use_remote'
  | 'merge'
  | 'preserve_both'
  | 'mark_deleted';

export interface ConflictResolutionResult<T = unknown> {
  action: ConflictResolutionAction;
  resolvedItem?: T;
  divergenceDetected: boolean;
  reason: string;
}

export interface VersionedEntity extends SyncMetadata {
  id: string;
  createdAt?: string;
  amount?: number;
  type?: string;
  date?: string;
  accountId?: string;
}

/**
 * Serializa uma entidade de forma canônica e determinística para desempate
 * em casos de mesma revisão, excluindo carimbos de tempo, contadores de revisão
 * e metadados de sincronização locais para garantir convergência idêntica e independente de relógio.
 */
export function canonicalizeEntityForTieBreak(item: Record<string, unknown> | null | undefined): string {
  if (!item || typeof item !== 'object') return '';
  const ignoredKeys = new Set([
    'updatedAt',
    'createdAt',
    'revision',
    'tombstoneRevision',
    'deletedAt',
    'pendingSync',
    'lastPriceUpdate',
    'userId',
    'ownerUid',
    'syncStatus',
    'lastError',
  ]);

  const sortedKeys = Object.keys(item)
    .filter(k => !ignoredKeys.has(k) && item[k] !== undefined)
    .sort();

  const normalized: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    normalized[k] = item[k];
  }
  return JSON.stringify(normalized);
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
      const localRev = localItem.tombstoneRevision || localItem.revision || 1;
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
   * Trata como ledger financeiro, evita sobrescrita silenciosa e garante convergência entre aparelhos.
   */
  private resolveTransactionLedgerConflict<T extends VersionedEntity>(
    local: T,
    remote: T
  ): ConflictResolutionResult<T> {
    const localRev = local.revision ?? 1;
    const remoteRev = remote.revision ?? 1;

    // Se valores financeiros fundamentais (amount, type, date, accountId) divergem
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
        // Mesma revisão com divergência financeira: desempate determinístico canônico independente de relógio
        const canonicalLocal = canonicalizeEntityForTieBreak(local as unknown as Record<string, unknown>);
        const canonicalRemote = canonicalizeEntityForTieBreak(remote as unknown as Record<string, unknown>);

        if (canonicalRemote > canonicalLocal) {
          return {
            action: 'use_remote',
            resolvedItem: remote,
            divergenceDetected: true,
            reason: 'Divergência financeira com mesma revisão: versão remota venceu por desempate canônico determinístico.',
          };
        }

        return {
          action: 'use_local',
          resolvedItem: local,
          divergenceDetected: true,
          reason: 'Divergência financeira com mesma revisão: versão local venceu por desempate canônico determinístico.',
        };
      }
    }

    // Se valores financeiros são idênticos e apenas metadados (categoria, descrição) mudaram
    if (localRev > remoteRev) {
      return {
        action: 'use_local',
        resolvedItem: local,
        divergenceDetected: false,
        reason: 'Transação com revisão local superior.',
      };
    }

    if (remoteRev > localRev) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: false,
        reason: 'Transação com revisão remota superior.',
      };
    }

    // Mesma revisão sem divergência financeira: desempate determinístico canônico
    const canonicalLocal = canonicalizeEntityForTieBreak(local as unknown as Record<string, unknown>);
    const canonicalRemote = canonicalizeEntityForTieBreak(remote as unknown as Record<string, unknown>);

    if (canonicalRemote > canonicalLocal) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: false,
        reason: 'Transação com mesma revisão: versão remota venceu por desempate canônico determinístico.',
      };
    }

    return {
      action: 'use_local',
      resolvedItem: local,
      divergenceDetected: false,
      reason: 'Transação com mesma revisão: versão local venceu por desempate canônico determinístico.',
    };
  }

  /**
   * Estratégia para Ledgers de Eventos (Investimentos e Metas):
   * Preservação estrita do histórico de eventos sem perda de registros com convergência determinística.
   */
  private resolveEventLedgerConflict<T extends VersionedEntity>(
    entityName: string,
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
        reason: `Histórico em ${entityName} preservado pela versão local com revisão superior.`,
      };
    }

    if (remoteRev > localRev) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: false,
        reason: `Histórico em ${entityName} atualizado pela revisão remota superior.`,
      };
    }

    // Mesma revisão (localRev === remoteRev): desempate determinístico canônico
    const canonicalLocal = canonicalizeEntityForTieBreak(local as unknown as Record<string, unknown>);
    const canonicalRemote = canonicalizeEntityForTieBreak(remote as unknown as Record<string, unknown>);
    const isDivergent = canonicalLocal !== canonicalRemote;

    if (canonicalRemote > canonicalLocal) {
      return {
        action: 'use_remote',
        resolvedItem: remote,
        divergenceDetected: isDivergent,
        reason: `Histórico em ${entityName} com mesma revisão: versão remota venceu por desempate canônico determinístico.`,
      };
    }

    return {
      action: 'use_local',
      resolvedItem: local,
      divergenceDetected: isDivergent,
      reason: `Histórico em ${entityName} com mesma revisão: versão local venceu por desempate canônico determinístico.`,
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
