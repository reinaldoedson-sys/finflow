import {
  getLocalStorageKeysToClearOnAccountSwitch,
  getLocalStorageKeysToClearOnWipe,
} from '../domain/localOwnership';

export interface WipeStorageDependencies {
  clearAllFinancialEntities: () => Promise<unknown>;
  clearSyncQueue: () => Promise<unknown>;
  storage?: Pick<Storage, 'removeItem'>;
  saveEmptyPendingQueue: () => void;
}

/**
 * Executa a limpeza física do armazenamento local financeiro na ordem exata:
 * 1. Limpa entidades financeiras no IndexedDB
 * 2. Limpa a fila de sincronização do IndexedDB (Dexie)
 * 3. Remove chaves selecionadas do storage (com isolamento contra falhas pontuais)
 * 4. Zera a fila pendente de sincronização legada
 */
export async function wipeLocalFinancialStorage(
  keysToRemove: string[],
  deps: WipeStorageDependencies
): Promise<void> {
  // 1. Limpa IndexedDB financeiro
  await deps.clearAllFinancialEntities();

  // 2. Limpa fila de sincronização do IndexedDB
  await deps.clearSyncQueue();

  // 3. Limpa localStorage das chaves selecionadas
  const storage = deps.storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (storage) {
    for (const k of keysToRemove) {
      try {
        storage.removeItem(k);
      } catch (err) {
        console.warn(`[deviceWipeService] Falha ao remover chave "${k}" do storage:`, err);
      }
    }
  }

  // 4. Zera fila pendente legada
  deps.saveEmptyPendingQueue();
}

export interface SwitchAccountDependencies extends WipeStorageDependencies {
  currentUserUid?: string;
  allKeys: string[];
  setStoredOwner: (uid: string) => void;
  reload: () => void;
}

/**
 * Confirma a troca de conta, apaga os dados locais da conta anterior e grava o novo proprietário.
 */
export async function executeClearAndSwitchAccount(
  deps: SwitchAccountDependencies
): Promise<void> {
  if (!deps.currentUserUid) return;
  const newUid = deps.currentUserUid;

  try {
    const keysToRemove = getLocalStorageKeysToClearOnAccountSwitch(deps.allKeys);
    await wipeLocalFinancialStorage(keysToRemove, deps);
    deps.setStoredOwner(newUid);
    deps.reload();
  } catch (err) {
    console.error('[deviceWipeService] Erro ao limpar dados locais para troca de conta:', err);
    deps.setStoredOwner(newUid);
    deps.reload();
  }
}

export interface SignOutAndWipeDependencies extends WipeStorageDependencies {
  logout: () => Promise<void>;
  allKeys: string[];
  reload: () => void;
}

/**
 * Efetua logout e apaga todos os dados do dispositivo (wipe total).
 */
export async function executeSignOutAndWipeDevice(
  deps: SignOutAndWipeDependencies
): Promise<void> {
  try {
    await deps.logout();
    const keysToRemove = getLocalStorageKeysToClearOnWipe(deps.allKeys);
    await wipeLocalFinancialStorage(keysToRemove, deps);
    deps.reload();
  } catch (err) {
    console.error('[deviceWipeService] Erro ao sair e apagar dados deste aparelho:', err);
    const keysToRemove = getLocalStorageKeysToClearOnWipe(deps.allKeys);
    await wipeLocalFinancialStorage(keysToRemove, deps);
    deps.reload();
  }
}
