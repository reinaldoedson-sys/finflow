import type { SyncEntityName } from '../services/syncTypes';

export const RESOLVED_CONFLICTS_STORAGE_KEY = 'finflow_app_resolved_conflicts';

export interface ConflictEntitySnapshot {
  description?: string;
  amount?: number;
  type?: string;
  date?: string;
  accountId?: string;
  categoryId?: string;
  quantity?: number;
  price?: number;
  totalAmount?: number;
  assetId?: string;
  notes?: string;
  name?: string;
}

export interface ResolvedConflictEntry {
  id: string;
  entityName: SyncEntityName;
  entityId: string;
  description?: string;
  resolvedAt: string;
  action: string;
  reason: string;
  kept?: ConflictEntitySnapshot;
  discarded?: ConflictEntitySnapshot;
}

/**
 * Filtra e extrai APENAS os campos visíveis ao usuário permitidos para cada tipo de entidade,
 * truncando textos em no máximo 120 caracteres e ignorando estritamente campos internos/sensíveis.
 */
export function extractVisibleEntityFields(
  entityName: SyncEntityName,
  raw: unknown
): ConflictEntitySnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = raw as Record<string, unknown>;

  const truncate = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    return val.length > 120 ? val.slice(0, 120) : val;
  };

  const getNumber = (val: unknown): number | undefined => {
    return typeof val === 'number' && !isNaN(val) ? val : undefined;
  };

  const snapshot: ConflictEntitySnapshot = {};

  if (entityName === 'transactions') {
    // transactions: description, amount, type, date, accountId, categoryId
    if (item.description !== undefined) snapshot.description = truncate(item.description);
    if (item.amount !== undefined) snapshot.amount = getNumber(item.amount);
    if (item.type !== undefined) snapshot.type = truncate(item.type);
    if (item.date !== undefined) snapshot.date = truncate(item.date);
    if (item.accountId !== undefined) snapshot.accountId = truncate(item.accountId);
    if (item.categoryId !== undefined) snapshot.categoryId = truncate(item.categoryId);
  } else if (entityName === 'investmentTransactions') {
    // investmentTransactions: type, date, quantity, price, totalAmount, assetId, notes
    if (item.type !== undefined) snapshot.type = truncate(item.type);
    if (item.date !== undefined) snapshot.date = truncate(item.date);
    if (item.quantity !== undefined) snapshot.quantity = getNumber(item.quantity);
    if (item.price !== undefined) snapshot.price = getNumber(item.price);
    if (item.totalAmount !== undefined) snapshot.totalAmount = getNumber(item.totalAmount);
    if (item.assetId !== undefined) snapshot.assetId = truncate(item.assetId);
    if (item.notes !== undefined) snapshot.notes = truncate(item.notes);
  } else if (entityName === 'goalMovements') {
    // goalMovements: type, amount, date, notes
    if (item.type !== undefined) snapshot.type = truncate(item.type);
    if (item.amount !== undefined) snapshot.amount = getNumber(item.amount);
    if (item.date !== undefined) snapshot.date = truncate(item.date);
    if (item.notes !== undefined) snapshot.notes = truncate(item.notes);
  } else {
    // demais entidades: name ou description, se existir
    if (item.name !== undefined) snapshot.name = truncate(item.name);
    if (item.description !== undefined) snapshot.description = truncate(item.description);
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

export interface BuildConflictLogOptions {
  entityId?: string;
  action?: string;
  reason?: string;
  description?: string;
}

/**
 * Função pura que monta a entrada do log de conflito garantindo que apenas campos
 * visíveis e autorizados de kept e discarded sejam persistidos.
 */
export function buildConflictLogEntry(
  entityName: SyncEntityName,
  kept: unknown,
  discarded: unknown,
  options?: BuildConflictLogOptions
): Omit<ResolvedConflictEntry, 'id' | 'resolvedAt'> {
  const keptSnapshot = extractVisibleEntityFields(entityName, kept);
  const discardedSnapshot = extractVisibleEntityFields(entityName, discarded);

  const fallbackId = (kept as Record<string, unknown>)?.id || (discarded as Record<string, unknown>)?.id || 'unknown';
  const entityId = options?.entityId || String(fallbackId);

  const fallbackDesc =
    keptSnapshot?.description ||
    discardedSnapshot?.description ||
    keptSnapshot?.name ||
    discardedSnapshot?.name;

  return {
    entityName,
    entityId,
    action: options?.action || 'use_remote',
    reason: options?.reason || 'Divergência de edição resolvida automaticamente',
    description: options?.description || fallbackDesc,
    kept: keptSnapshot,
    discarded: discardedSnapshot,
  };
}

/**
 * Lê os conflitos resolvidos do localStorage. Entradas legadas sem 'kept'/'discarded'
 * continuam sendo lidas normalmente sem erro.
 */
export function getResolvedConflictEntries(storage?: Pick<Storage, 'getItem'>): ResolvedConflictEntry[] {
  try {
    const s = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return [];
    const raw = s.getItem(RESOLVED_CONFLICTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Registra um conflito resolvido mantendo no máximo 20 eventos mais recentes.
 */
export function recordResolvedConflictEntry(
  entry: Omit<ResolvedConflictEntry, 'id' | 'resolvedAt'>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): void {
  try {
    const s = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return;
    const existing = getResolvedConflictEntries(s);
    const newEntry: ResolvedConflictEntry = {
      id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      resolvedAt: new Date().toISOString(),
      ...entry,
    };
    const updated = [newEntry, ...existing].slice(0, 20);
    s.setItem(RESOLVED_CONFLICTS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignora falhas de storage
  }
}

/**
 * Limpa o histórico de conflitos resolvidos.
 */
export function clearResolvedConflictEntries(storage?: Pick<Storage, 'removeItem'>): void {
  try {
    const s = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return;
    s.removeItem(RESOLVED_CONFLICTS_STORAGE_KEY);
  } catch {
    // ignora falhas de storage
  }
}

/**
 * Formata um snapshot de conflito para exibição amigável ao usuário.
 */
export function formatConflictSnapshotText(
  entityName: string,
  snapshot: ConflictEntitySnapshot | undefined,
  currency: string = 'BRL'
): string {
  if (!snapshot) return '';

  const formatDate = (d?: string): string => {
    if (!d) return '';
    const dateStr = d.includes('T') ? d.split('T')[0] : d;
    if (dateStr.includes('-')) {
      const [y, m, day] = dateStr.split('-');
      if (y && m && day) return `${day}/${m}/${y}`;
    }
    return d;
  };

  const formatAmount = (val?: number): string => {
    if (typeof val !== 'number') return '';
    try {
      return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : currency === 'EUR' ? 'de-DE' : 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val);
    } catch {
      return `R$ ${val.toFixed(2)}`;
    }
  };

  const parts: string[] = [];

  if (entityName === 'transactions') {
    if (snapshot.description) parts.push(snapshot.description);
    if (typeof snapshot.amount === 'number') parts.push(formatAmount(snapshot.amount));
    if (snapshot.date) parts.push(formatDate(snapshot.date));
    if (snapshot.type) {
      parts.push(snapshot.type === 'expense' ? 'Despesa' : snapshot.type === 'income' ? 'Receita' : snapshot.type);
    }
  } else if (entityName === 'investmentTransactions') {
    if (snapshot.type) {
      parts.push(
        snapshot.type === 'buy' ? 'Compra' : snapshot.type === 'sell' ? 'Venda' : snapshot.type === 'dividend' ? 'Provento' : snapshot.type
      );
    }
    if (typeof snapshot.quantity === 'number') parts.push(`${snapshot.quantity} cotas`);
    if (typeof snapshot.price === 'number') parts.push(`Preço: ${formatAmount(snapshot.price)}`);
    if (typeof snapshot.totalAmount === 'number') parts.push(`Total: ${formatAmount(snapshot.totalAmount)}`);
    if (snapshot.date) parts.push(formatDate(snapshot.date));
    if (snapshot.notes) parts.push(`(${snapshot.notes})`);
  } else if (entityName === 'goalMovements') {
    if (snapshot.type) {
      parts.push(snapshot.type === 'deposit' ? 'Depósito' : snapshot.type === 'withdraw' ? 'Resgate' : snapshot.type);
    }
    if (typeof snapshot.amount === 'number') parts.push(formatAmount(snapshot.amount));
    if (snapshot.date) parts.push(formatDate(snapshot.date));
    if (snapshot.notes) parts.push(`(${snapshot.notes})`);
  } else {
    if (snapshot.name) parts.push(snapshot.name);
    if (snapshot.description) parts.push(snapshot.description);
  }

  return parts.join(' • ');
}
