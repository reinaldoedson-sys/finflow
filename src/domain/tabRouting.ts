export type TabId =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'investments'
  | 'portfolio'
  | 'installments'
  | 'budgets'
  | 'goals'
  | 'reports'
  | 'analytics'
  | 'settings';

export const TAB_SLUGS: Record<TabId, string> = {
  dashboard: '#/',
  transactions: '#/transacoes',
  accounts: '#/contas',
  investments: '#/investimentos',
  portfolio: '#/ativos',
  installments: '#/parcelamentos',
  budgets: '#/orcamentos',
  goals: '#/metas',
  reports: '#/relatorios',
  analytics: '#/analises',
  settings: '#/configuracoes',
} as const;

export type NavigationAction = 'none' | 'push' | 'replace' | 'back';

const SLUG_TO_TAB: Record<string, TabId> = {
  '#/': 'dashboard',
  '#/transacoes': 'transactions',
  '#/contas': 'accounts',
  '#/investimentos': 'investments',
  '#/ativos': 'portfolio',
  '#/parcelamentos': 'installments',
  '#/orcamentos': 'budgets',
  '#/metas': 'goals',
  '#/relatorios': 'reports',
  '#/analises': 'analytics',
  '#/configuracoes': 'settings',
};

/**
 * Converte um id de aba no seu hash correspondente.
 * Se a aba for desconhecida, vazia ou inválida, devolve o hash da dashboard '#/'.
 */
export function hashFromTab(tab: string | null | undefined): string {
  if (tab && Object.prototype.hasOwnProperty.call(TAB_SLUGS, tab)) {
    return TAB_SLUGS[tab as TabId];
  }
  return TAB_SLUGS.dashboard;
}

/**
 * Converte um hash no id de aba correspondente.
 * Hash desconhecido, vazio ou inválido (ex.: '#/xyz', '#/transacoes/extra') devolve 'dashboard'.
 */
export function tabFromHash(hash: string | null | undefined): TabId {
  if (!hash) {
    return 'dashboard';
  }

  if (Object.prototype.hasOwnProperty.call(SLUG_TO_TAB, hash)) {
    return SLUG_TO_TAB[hash];
  }

  return 'dashboard';
}

/**
 * Determina a ação da History API para navegação entre abas.
 * - 'none': mesma aba (currentTab === targetTab)
 * - 'push': de dashboard para outra aba
 * - 'replace': de outra aba para outra aba (com ou sem entrada de dashboard abaixo)
 * - 'back': de outra aba para dashboard quando há uma entrada de dashboard logo abaixo
 * - Se hasDashboardEntryBelow for false, de outra aba para dashboard devolve 'replace'
 */
export function getNavigationAction(
  currentTab: string,
  targetTab: string,
  hasDashboardEntryBelow: boolean
): NavigationAction {
  if (currentTab === targetTab) {
    return 'none';
  }

  if (currentTab === 'dashboard') {
    return 'push';
  }

  // currentTab !== 'dashboard'
  if (targetTab === 'dashboard') {
    return hasDashboardEntryBelow ? 'back' : 'replace';
  }

  // currentTab !== 'dashboard' && targetTab !== 'dashboard'
  return 'replace';
}
