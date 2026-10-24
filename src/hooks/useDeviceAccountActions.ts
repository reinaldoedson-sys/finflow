import { useCallback } from 'react';
import {
  executeClearAndSwitchAccount,
  executeSignOutAndWipeDevice,
} from '../services/deviceWipeService';
import {
  clearAllFinancialEntities,
  isIndexedDBAvailable,
  db,
} from '../storage/indexedDB';
import { savePendingQueueToStorage } from '../domain/sync';
import { setStoredLocalOwner } from '../domain/localOwnership';

export interface UseDeviceAccountActionsParams {
  currentUser?: { uid?: string } | null;
  logout: () => Promise<void>;
}

export interface UseDeviceAccountActionsReturn {
  confirmClearAndSwitchAccount: () => Promise<void>;
  cancelConflictLogout: () => Promise<void>;
  signOutAndWipeDevice: () => Promise<void>;
}

/**
 * Hook para gerenciar as ações de resolução de conflito de conta e limpeza local do aparelho.
 */
export function useDeviceAccountActions({
  currentUser,
  logout,
}: UseDeviceAccountActionsParams): UseDeviceAccountActionsReturn {
  const cancelConflictLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const confirmClearAndSwitchAccount = useCallback(async () => {
    if (!currentUser?.uid) return;
    await executeClearAndSwitchAccount({
      currentUserUid: currentUser.uid,
      allKeys: typeof window !== 'undefined' ? Object.keys(window.localStorage) : [],
      clearAllFinancialEntities,
      clearSyncQueue: async () => {
        if (isIndexedDBAvailable()) {
          await db.syncQueue.clear();
        }
      },
      saveEmptyPendingQueue: () => savePendingQueueToStorage([]),
      setStoredOwner: setStoredLocalOwner,
      reload: () => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      },
    });
  }, [currentUser]);

  const signOutAndWipeDevice = useCallback(async () => {
    await executeSignOutAndWipeDevice({
      logout,
      allKeys: typeof window !== 'undefined' ? Object.keys(window.localStorage) : [],
      clearAllFinancialEntities,
      clearSyncQueue: async () => {
        if (isIndexedDBAvailable()) {
          await db.syncQueue.clear();
        }
      },
      saveEmptyPendingQueue: () => savePendingQueueToStorage([]),
      reload: () => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      },
    });
  }, [logout]);

  return {
    confirmClearAndSwitchAccount,
    cancelConflictLogout,
    signOutAndWipeDevice,
  };
}
