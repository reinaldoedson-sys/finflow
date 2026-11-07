import { useEffect, useCallback, useRef } from 'react';
import {
  tabFromHash,
  hashFromTab,
  getNavigationAction,
  TabId
} from '../domain/tabRouting';
import { triggerHaptic } from '../utils/haptics';

export interface FinFlowHistoryState {
  finflow: boolean;
  tab: string;
  dashboardBelow?: boolean;
}

export type NavigateToTabFn = (targetTab: string) => void;

export interface UseTabHistoryReturn extends NavigateToTabFn {
  navigateToTab: NavigateToTabFn;
}

/**
 * Hook que sincroniza a navegação por abas com a History API do navegador.
 * Permite que o botão Voltar do celular/navegador retorne da aba atual para a
 * aba Início (dashboard), em vez de fechar o app ou desorientar o usuário.
 *
 * @param currentTab Estado atual da aba
 * @param setCurrentTab Atualizador do estado da aba
 */
export function useTabHistory(
  currentTab: string,
  setCurrentTab: (tab: string) => void
): UseTabHistoryReturn {
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;

  const initializedRef = useRef(false);

  // 1. Ao montar: leitura do hash inicial e reconstrução do histórico
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialTab: TabId = tabFromHash(window.location.hash);

    if (initialTab !== 'dashboard') {
      // Reconstrói a pilha com dashboard na base para que o botão Voltar leve ao Início
      window.history.replaceState(
        { finflow: true, tab: 'dashboard' } satisfies FinFlowHistoryState,
        '',
        hashFromTab('dashboard')
      );
      window.history.pushState(
        { finflow: true, tab: initialTab, dashboardBelow: true } satisfies FinFlowHistoryState,
        '',
        hashFromTab(initialTab)
      );
    } else {
      // Estado inicial limpo para a dashboard
      window.history.replaceState(
        { finflow: true, tab: 'dashboard' } satisfies FinFlowHistoryState,
        '',
        hashFromTab('dashboard')
      );
    }
  }, []);

  // 2. Listener de popstate: responde ao botão Voltar / Avançar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as FinFlowHistoryState | null;
      const targetTab = (state && state.finflow && typeof state.tab === 'string')
        ? state.tab
        : tabFromHash(window.location.hash);

      setCurrentTab(targetTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [setCurrentTab]);

  // 3. Função de navegação orientada a ações
  const navigateToTab = useCallback<NavigateToTabFn>((targetTab: string) => {
    if (typeof window === 'undefined') {
      setCurrentTab(targetTab);
      return;
    }

    const activeTab = currentTabRef.current;
    const currentState = window.history.state as FinFlowHistoryState | null;
    const hasDashboardEntryBelow = Boolean(currentState && currentState.dashboardBelow);

    const action = getNavigationAction(activeTab, targetTab, hasDashboardEntryBelow);

    if (action !== 'none') {
      triggerHaptic('light');
    }

    switch (action) {
      case 'push': {
        const nextState: FinFlowHistoryState = {
          finflow: true,
          tab: targetTab,
          dashboardBelow: true,
        };
        window.history.pushState(nextState, '', hashFromTab(targetTab));
        setCurrentTab(targetTab);
        break;
      }

      case 'replace': {
        const nextState: FinFlowHistoryState = {
          finflow: true,
          tab: targetTab,
          dashboardBelow: targetTab === 'dashboard' ? false : hasDashboardEntryBelow,
        };
        window.history.replaceState(nextState, '', hashFromTab(targetTab));
        setCurrentTab(targetTab);
        break;
      }

      case 'back': {
        window.history.back();
        // O setTab será disparado pelo evento popstate
        break;
      }

      case 'none':
      default:
        break;
    }
  }, [setCurrentTab]);

  const returnFn = navigateToTab as UseTabHistoryReturn;
  returnFn.navigateToTab = navigateToTab;

  return returnFn;
}
