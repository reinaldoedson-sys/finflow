/**
 * Controle de propriedade e isolamento de dados locais entre contas Google (Local Ownership).
 * Impede a mesclagem indevida ou envio de dados privados entre contas diferentes no mesmo dispositivo.
 */

export const LOCAL_OWNER_STORAGE_KEY = 'finflow_local_owner';

export type OwnershipDecision = 'claim' | 'same' | 'conflict';

/**
 * Avalia a posse dos dados locais do aparelho ao autenticar um usuário:
 * - sem dono guardado (null ou vazio) -> 'claim' (primeira conta assume os dados anônimos)
 * - mesmo uid -> 'same' (usuário habitual retornando à sessão)
 * - uid diferente -> 'conflict' (outra conta Google tentando acessar dados de conta anterior)
 */
export function decideOwnership(storedOwner: string | null, uid: string): OwnershipDecision {
  if (!storedOwner) {
    return 'claim';
  }
  if (storedOwner === uid) {
    return 'same';
  }
  return 'conflict';
}

/**
 * Avalia se uma mutação da fila pode ser enviada com o UID autenticado atual:
 * - item sem dono (null, undefined ou vazio) -> true (preserva dados anônimos locais prévios)
 * - item com o mesmo uid do usuário atual -> true
 * - item pertencente explicitamente a outro uid -> false (impede contaminação cruzada)
 */
export function canPushItem(itemOwner: string | null | undefined, currentUid: string): boolean {
  if (!itemOwner) {
    return true;
  }
  return itemOwner === currentUid;
}

/**
 * Lê o dono atual dos dados locais com proteção para falhas de storage.
 */
export function getStoredLocalOwner(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    const targetStorage = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!targetStorage) return null;
    return targetStorage.getItem(LOCAL_OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persiste ou remove o dono atual dos dados locais com proteção contra falhas de storage.
 */
export function setStoredLocalOwner(
  uid: string | null,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>
): void {
  try {
    const targetStorage = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!targetStorage) return;
    if (uid) {
      targetStorage.setItem(LOCAL_OWNER_STORAGE_KEY, uid);
    } else {
      targetStorage.removeItem(LOCAL_OWNER_STORAGE_KEY);
    }
  } catch {
    // ignora falhas de storage
  }
}

export const APP_STORAGE_KEY_PREFIX = 'finflow_app_';
export const SECURITY_STORAGE_KEY = 'finflow_security_v1';
export const AUTH_HINT_STORAGE_KEY_NAME = 'finflow_auth_hint';

/**
 * Filtra e devolve as chaves do localStorage que devem ser apagadas
 * quando o usuário confirma a troca de conta ("Continuar e apagar dados locais").
 *
 * Apaga:
 * - Todas as chaves iniciadas por "finflow_app_" (entidades financeiras, flags de demo/init, etc.)
 * - Fila legada de sincronização ("finflow_pending_queue", "finflow_pending_sync_queue")
 * - Configuração de segurança local ("finflow_security_v1": PIN e bloqueio progressivo)
 *
 * Preserva:
 * - "finflow_auth_hint" (necessária para reidratação rápida da sessão da nova conta)
 * - "finflow_local_owner" (é regravada explicitamente com o novo UID)
 * - Chaves de outros apps ou terceiros não vinculadas ao FinFlow
 */
export function getLocalStorageKeysToClearOnAccountSwitch(allKeys: string[]): string[] {
  return allKeys.filter(key => {
    // Nunca apaga auth hint nem local owner
    if (key === AUTH_HINT_STORAGE_KEY_NAME || key === LOCAL_OWNER_STORAGE_KEY) {
      return false;
    }

    // Apaga todas as chaves de dados do app (finflow_app_*)
    if (key.startsWith(APP_STORAGE_KEY_PREFIX)) {
      return true;
    }

    // Apaga chaves legadas de fila de sincronização
    if (key === 'finflow_pending_queue' || key === 'finflow_pending_sync_queue') {
      return true;
    }

    // Apaga configuração de segurança (PIN e bloqueio)
    if (key === SECURITY_STORAGE_KEY) {
      return true;
    }

    return false;
  });
}

/**
 * Filtra e devolve as chaves do localStorage que devem ser apagadas
 * quando o usuário escolhe "Sair e apagar dados deste aparelho" (wipe total do dispositivo).
 *
 * Apaga:
 * - Todas as chaves devolvidas por getLocalStorageKeysToClearOnAccountSwitch
 * - "finflow_local_owner"
 * - "finflow_auth_hint"
 *
 * Preserva:
 * - Chaves alheias ao FinFlow (nunca são devolvidas)
 */
export function getLocalStorageKeysToClearOnWipe(allKeys: string[]): string[] {
  const switchKeys = new Set(getLocalStorageKeysToClearOnAccountSwitch(allKeys));

  return allKeys.filter(key => {
    if (switchKeys.has(key)) {
      return true;
    }
    if (key === LOCAL_OWNER_STORAGE_KEY || key === AUTH_HINT_STORAGE_KEY_NAME) {
      return true;
    }
    return false;
  });
}


