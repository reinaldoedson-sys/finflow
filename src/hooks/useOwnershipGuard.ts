import { useState, useEffect } from 'react';
import {
  decideOwnership,
  getStoredLocalOwner,
  setStoredLocalOwner,
} from '../domain/localOwnership';

export interface UserLike {
  uid?: string;
}

export interface UseOwnershipGuardReturn {
  ownershipConflict: boolean;
  effectiveUserId: string | undefined;
}

/**
 * Hook para controle de posse dos dados locais do dispositivo e isolamento entre contas Google.
 * Avalia na autenticação se o aparelho possui dados de outra conta e desativa a sincronização
 * na nuvem até resolução explícita pelo usuário em caso de conflito.
 */
export function useOwnershipGuard(
  currentUser: UserLike | null | undefined,
  _isAuthReady?: boolean
): UseOwnershipGuardReturn {
  const [ownershipConflict, setOwnershipConflict] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid) {
      setOwnershipConflict(false);
      return;
    }

    const storedOwner = getStoredLocalOwner();
    const decision = decideOwnership(storedOwner, currentUser.uid);

    if (decision === 'claim') {
      // Cenário (a): Primeira conta entrando assume os dados locais anônimos prévios
      setStoredLocalOwner(currentUser.uid);
      setOwnershipConflict(false);
    } else if (decision === 'same') {
      setOwnershipConflict(false);
    } else if (decision === 'conflict') {
      // Cenários (c e d): Conta diferente tentando entrar em aparelho com dados de outra conta
      setOwnershipConflict(true);
    }
  }, [currentUser?.uid]);

  // Se houver conflito de propriedade, desativa a sincronização na nuvem até resolução explícita
  const effectiveUserId = (currentUser?.uid && !ownershipConflict) ? currentUser.uid : undefined;

  return {
    ownershipConflict,
    effectiveUserId,
  };
}
