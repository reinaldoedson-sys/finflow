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
