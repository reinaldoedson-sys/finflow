export type BottomNavActiveId = 'dashboard' | 'transactions' | 'installments' | 'more';

/**
 * Função pura que resolve o identificador do item ativo na Bottom Navigation Bar.
 * - 'dashboard' -> 'dashboard'
 * - 'transactions' -> 'transactions'
 * - 'installments' -> 'installments'
 * - Qualquer outra aba ('accounts', 'portfolio', 'investments', 'budgets', 'goals', 'reports', 'settings' ou desconhecida) -> 'more'
 */
export function getBottomNavActiveId(currentTab: string | null | undefined): BottomNavActiveId {
  if (currentTab === 'dashboard') return 'dashboard';
  if (currentTab === 'transactions') return 'transactions';
  if (currentTab === 'installments') return 'installments';
  return 'more';
}
