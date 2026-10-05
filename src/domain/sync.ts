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
  | 'investments';

export type SyncOperationType = 'set' | 'update' | 'delete';

export interface PendingSyncOperation {
  id: string; // Identificador único estável da operação: `${collection}_${docId}`
  collection: SyncCollection;
  docId: string;
  type: SyncOperationType;
  payload?: any;
  timestamp: string;
  retries: number;
  lastError?: string;
}

export const STORAGE_PENDING_QUEUE_KEY = 'finflow_app_pending_sync_queue';

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
    payload?: any;
    lastError?: string;
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

    // Se foi criado localmente ('set') e agora atualizado ('update')
    if (existing.type === 'set' && newOp.type === 'update') {
      const updatedQueue = [...queue];
      updatedQueue[existingIndex] = {
        ...existing,
        payload: { ...existing.payload, ...newOp.payload },
        timestamp: now,
        lastError: newOp.lastError ?? existing.lastError
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
        lastError: newOp.lastError ?? existing.lastError
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
      lastError: newOp.lastError ?? existing.lastError
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
    lastError: newOp.lastError
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
export function mergeCloudWithPending<T extends { id: string }>(
  cloudItems: T[],
  pendingQueue: PendingSyncOperation[],
  collection: SyncCollection,
  localItems: T[]
): T[] {
  const relevantOps = pendingQueue.filter(op => op.collection === collection);
  if (relevantOps.length === 0) {
    return cloudItems;
  }

  const deleteIds = new Set(
    relevantOps.filter(op => op.type === 'delete').map(op => op.docId)
  );

  const updatesMap = new Map<string, any>(
    relevantOps.filter(op => op.type === 'update').map(op => [op.docId, op.payload])
  );

  const setIds = new Set(
    relevantOps.filter(op => op.type === 'set').map(op => op.docId)
  );

  // 1. Filtra itens que foram excluídos localmente
  const result: T[] = [];
  const seenIds = new Set<string>();

  for (const item of cloudItems) {
    if (deleteIds.has(item.id)) {
      continue;
    }
    const updatePayload = updatesMap.get(item.id);
    if (updatePayload) {
      result.push({ ...item, ...updatePayload });
    } else {
      result.push(item);
    }
    seenIds.add(item.id);
  }

  // 2. Preserva criações pendentes que ainda não existem na nuvem
  for (const localItem of localItems) {
    if (setIds.has(localItem.id) && !seenIds.has(localItem.id) && !deleteIds.has(localItem.id)) {
      result.push(localItem);
      seenIds.add(localItem.id);
    }
  }

  // 2b. Se houver operações 'set' com payload na fila que ainda não constavam no array local
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
