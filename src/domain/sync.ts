/**
 * Sistema de consistência e fila de sincronização offline/local-first do FinFlow.
 * Garante que falhas no Firestore não sejam silenciosamente ignoradas
 * e que dados locais não sejam sobrescritos ou perdidos em caso de queda de rede.
 */

export type SyncStatus = 'synced' | 'pending' | 'error';

export type SyncCollection =
  | 'transactions'
  | 'accounts'
  | 'creditCards'
  | 'categories'
  | 'budgets'
  | 'goals'
  | 'goalMovements'
  | 'installmentPlans'
  | 'investments'
  | 'investmentTransactions';

export type SyncOperationType = 'set' | 'update' | 'delete';

export type SyncPayload = Record<string, unknown> | object;

export interface PendingSyncOperation {
  id: string; // Identificador único estável da operação: `${collection}_${docId}`
  collection: SyncCollection;
  docId: string;
  type: SyncOperationType;
  payload?: SyncPayload;
  timestamp: string;
  retries: number;
  lastError?: string;
  ownerUid?: string | null;
}

export const STORAGE_PENDING_QUEUE_KEY = 'finflow_app_pending_sync_queue';

export const ALL_SYNC_SUBCOLLECTIONS: readonly SyncCollection[] = [
  'transactions',
  'accounts',
  'creditCards',
  'categories',
  'budgets',
  'goals',
  'goalMovements',
  'installmentPlans',
  'investments',
  'investmentTransactions'
] as const;

import {
  SAMPLE_ACCOUNT_IDS,
  SAMPLE_CARD_IDS,
  SAMPLE_BUDGET_IDS,
  SAMPLE_GOAL_IDS,
  SAMPLE_GOAL_MOVEMENT_IDS,
  SAMPLE_PLAN_IDS,
  SAMPLE_TRANSACTION_IDS,
  SAMPLE_INVESTMENT_IDS,
  SAMPLE_INVESTMENT_TX_IDS
} from '../utils/mockData';

/**
 * Determina se um ID de documento pertence ao conjunto inicial/padrão de demonstração.
 */
export function isSampleDataDocument(collection: string, docId: string): boolean {
  switch (collection) {
    case 'accounts': return SAMPLE_ACCOUNT_IDS.has(docId);
    case 'creditCards': return SAMPLE_CARD_IDS.has(docId);
    case 'budgets': return SAMPLE_BUDGET_IDS.has(docId);
    case 'goals': return SAMPLE_GOAL_IDS.has(docId);
    case 'goalMovements': return SAMPLE_GOAL_MOVEMENT_IDS.has(docId);
    case 'installmentPlans': return SAMPLE_PLAN_IDS.has(docId);
    case 'transactions': return SAMPLE_TRANSACTION_IDS.has(docId);
    case 'investments': return SAMPLE_INVESTMENT_IDS.has(docId);
    case 'investmentTransactions': return SAMPLE_INVESTMENT_TX_IDS.has(docId);
    case 'categories': return false; // Categorias são canônicas/permanentes
    default: return false;
  }
}

/**
 * Filtra uma coleção em memória para remover apenas os itens de demonstração,
 * preservando integralmente os itens criados pelo usuário.
 */
export function filterOutSampleData<T extends { id: string }>(collection: SyncCollection, items: T[]): T[] {
  return items.filter(item => !isSampleDataDocument(collection, item.id));
}

/**
 * Gera um ID estável para a operação na fila baseado na coleção e docId.
 * Isso garante que múltiplas tentativas de retry para o mesmo documento não se dupliquem.
 */
export function getOperationId(collection: SyncCollection, docId: string): string {
  return `${collection}_${docId}`;
}

/**
 * Enfileira ou atualiza uma operação pendente na fila de sincronização.
 * Possui lógica de consolidação idempotente:
 * - Se um item foi criado (set) e depois excluído (delete) antes de ir ao Firestore,
 *   a operação é simplesmente descartada (pois o servidor nunca soube da existência).
 * - Se um item foi criado (set) e depois atualizado (update), a operação continua como 'set' com payload fundido.
 * - Se um item já tinha 'update' e recebe outro 'update', os payloads são fundidos.
 */
export function enqueueOperation(
  queue: PendingSyncOperation[],
  newOp: {
    collection: SyncCollection;
    docId: string;
    type: SyncOperationType;
    payload?: SyncPayload;
    lastError?: string;
    ownerUid?: string | null;
  }
): PendingSyncOperation[] {
  const opId = getOperationId(newOp.collection, newOp.docId);
  const existingIndex = queue.findIndex(op => op.id === opId);
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = queue[existingIndex];

    // Se foi criado localmente ('set') e agora foi excluído ('delete')
    if (existing.type === 'set' && newOp.type === 'delete') {
      return queue.filter((_, idx) => idx !== existingIndex);
    }

    const effectiveOwner = newOp.ownerUid !== undefined ? newOp.ownerUid : existing.ownerUid;

    // Se foi criado localmente ('set') e agora atualizado ('update')
    if (existing.type === 'set' && newOp.type === 'update') {
      const updatedQueue = [...queue];
      updatedQueue[existingIndex] = {
        ...existing,
        payload: { ...existing.payload, ...newOp.payload },
        timestamp: now,
        lastError: newOp.lastError ?? existing.lastError,
        ownerUid: effectiveOwner,
      };
      return updatedQueue;
    }

    // Se já era 'update' e agora recebe outro 'update'
    if (existing.type === 'update' && newOp.type === 'update') {
      const updatedQueue = [...queue];
      updatedQueue[existingIndex] = {
        ...existing,
        payload: { ...existing.payload, ...newOp.payload },
        timestamp: now,
        lastError: newOp.lastError ?? existing.lastError,
        ownerUid: effectiveOwner,
      };
      return updatedQueue;
    }

    // Caso padrão de substituição (ex: update seguido de delete)
    const updatedQueue = [...queue];
    updatedQueue[existingIndex] = {
      id: opId,
      collection: newOp.collection,
      docId: newOp.docId,
      type: newOp.type,
      payload: newOp.payload,
      timestamp: now,
      retries: existing.retries,
      lastError: newOp.lastError ?? existing.lastError,
      ownerUid: effectiveOwner,
    };
    return updatedQueue;
  }

  // Novo item na fila
  const item: PendingSyncOperation = {
    id: opId,
    collection: newOp.collection,
    docId: newOp.docId,
    type: newOp.type,
    payload: newOp.payload,
    timestamp: now,
    retries: 0,
    lastError: newOp.lastError,
    ownerUid: newOp.ownerUid ?? null,
  };

  return [...queue, item];
}

/**
 * Remove uma operação que foi concluída com sucesso da fila.
 */
export function dequeueOperation(
  queue: PendingSyncOperation[],
  collection: SyncCollection,
  docId: string
): PendingSyncOperation[] {
  const opId = getOperationId(collection, docId);
  return queue.filter(op => op.id !== opId);
}

/**
 * Mescla dados recebidos do Firestore (snapshot) com o estado pendente local,
 * garantindo que:
 * 1. Documentos com exclusão pendente local não ressuscitem na UI.
 * 2. Documentos com criação pendente local ('set') não desapareçam quando o Firestore responder com a lista do servidor.
 * 3. Documentos com 'update' pendente local mantenham as edições locais mais recentes.
 */
interface SyncableRecord {
  id: string;
  deleted?: boolean;
  currentPrice?: number;
  previousClose?: number;
  changePercent?: number;
  lastPriceUpdate?: string;
  [key: string]: unknown;
}

export function mergeCloudWithPending<T extends { id: string }>(
  cloudItems: T[],
  pendingQueue: PendingSyncOperation[],
  collection: SyncCollection,
  localItems: T[] = []
): T[] {
  const relevantOps = (pendingQueue || []).filter(op => op.collection === collection);

  const deleteIds = new Set(
    relevantOps.filter(op => op.type === 'delete').map(op => op.docId)
  );

  const updatesMap = new Map<string, SyncPayload | undefined>(
    relevantOps.filter(op => op.type === 'update').map(op => [op.docId, op.payload])
  );

  const result: T[] = [];
  const seenIds = new Set<string>();
  const localItemsMap = new Map<string, T>(
    (localItems || []).map(item => [item.id, item])
  );

  // 1. Processa itens da nuvem (ignorando itens deletados localmente ou marcados com tombstone)
  for (const item of (cloudItems || [])) {
    const cloudRecord = item as unknown as SyncableRecord;
    if (deleteIds.has(item.id) || Boolean(cloudRecord.deleted)) {
      continue;
    }
    const updatePayload = updatesMap.get(item.id);
    let mergedItem = updatePayload ? { ...item, ...updatePayload } : { ...item };

    // Para investimentos: se o item local contiver cotação de mercado mais recente, preserva a cotação
    // Evita que snapshots remotos com preço de compra original sobrescrevam a cotação ao navegar entre telas
    if (collection === 'investments') {
      const localMatch = localItemsMap.get(item.id) as unknown as SyncableRecord | undefined;
      if (localMatch && typeof localMatch.currentPrice === 'number') {
        const localTime = localMatch.lastPriceUpdate ? new Date(localMatch.lastPriceUpdate).getTime() : 0;
        const mergedRecord = mergedItem as unknown as SyncableRecord;
        const remoteTime = mergedRecord.lastPriceUpdate ? new Date(mergedRecord.lastPriceUpdate).getTime() : 0;
        if (localTime >= remoteTime || !remoteTime) {
          mergedItem = {
            ...mergedItem,
            currentPrice: localMatch.currentPrice,
            previousClose: (localMatch.previousClose ?? mergedRecord.previousClose) as typeof mergedItem[keyof typeof mergedItem],
            changePercent: (localMatch.changePercent ?? mergedRecord.changePercent) as typeof mergedItem[keyof typeof mergedItem],
            lastPriceUpdate: (localMatch.lastPriceUpdate || mergedRecord.lastPriceUpdate) as typeof mergedItem[keyof typeof mergedItem],
          };
        }
      }
    }

    result.push(mergedItem);
    seenIds.add(item.id);
  }

  // 2. Preserva criações e registros locais válidos que ainda não constam na nuvem
  // Garante Local-First absoluto: entidades locais não são descartadas por snapshots remotos incompletos
  for (const localItem of (localItems || [])) {
    const localRecord = localItem as unknown as SyncableRecord;
    if (!deleteIds.has(localItem.id) && !localRecord.deleted && !seenIds.has(localItem.id)) {
      const updatePayload = updatesMap.get(localItem.id);
      if (updatePayload) {
        result.push({ ...localItem, ...updatePayload });
      } else {
        result.push(localItem);
      }
      seenIds.add(localItem.id);
    }
  }

  // 3. Se houver operações 'set' com payload na fila que ainda não constavam no array local nem na nuvem
  for (const op of relevantOps) {
    if (op.type === 'set' && op.payload && !seenIds.has(op.docId) && !deleteIds.has(op.docId)) {
      result.push({ id: op.docId, ...op.payload } as T);
      seenIds.add(op.docId);
    }
  }

  return result;
}

/**
 * Carrega a fila de operações pendentes do localStorage.
 */
export function loadPendingQueueFromStorage(): PendingSyncOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Falha ao ler fila de sincronização do localStorage:', err);
    return [];
  }
}

/**
 * Salva a fila de operações pendentes no localStorage.
 */
export function savePendingQueueToStorage(queue: PendingSyncOperation[]): void {
  try {
    localStorage.setItem(STORAGE_PENDING_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Falha ao salvar fila de sincronização no localStorage:', err);
  }
}
