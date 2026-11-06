import React from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Plus,
  CreditCard,
  Menu,
  LucideIcon
} from 'lucide-react';
import { getBottomNavActiveId } from '../domain/bottomNav';

export interface BottomNavItemConfig {
  readonly id: 'dashboard' | 'transactions' | 'new' | 'installments' | 'more';
  readonly label: string;
  readonly ariaLabel: string;
  readonly icon: LucideIcon;
  readonly type: 'tab' | 'action';
  readonly tabId?: string;
}

export const BOTTOM_NAV_ITEMS: readonly BottomNavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Início',
    ariaLabel: 'Ir para Início (Visão Geral)',
    icon: LayoutDashboard,
    type: 'tab',
    tabId: 'dashboard',
  },
  {
    id: 'transactions',
    label: 'Transações',
    ariaLabel: 'Ir para Transações',
    icon: ArrowLeftRight,
    type: 'tab',
    tabId: 'transactions',
  },
  {
    id: 'new',
    label: 'Nova',
    ariaLabel: 'Nova transação',
    icon: Plus,
    type: 'action',
  },
  {
    id: 'installments',
    label: 'Parcelas',
    ariaLabel: 'Ir para Parcelamentos',
    icon: CreditCard,
    type: 'tab',
    tabId: 'installments',
  },
  {
    id: 'more',
    label: 'Mais',
    ariaLabel: 'Mais opções e menu lateral',
    icon: Menu,
    type: 'action',
  },
] as const;

export interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenNewTransaction: () => void;
  onOpenMore: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  onOpenNewTransaction,
  onOpenMore,
}) => {
  const activeId = getBottomNavActiveId(currentTab);

  return (
    <nav
      aria-label="Navegação inferior mobile"
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-[#0d131f]/95 backdrop-blur-md border-t border-slate-800/80 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))' }}
    >
      <div className="grid grid-cols-5 items-end max-w-md mx-auto">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          // Central CTA (+) button: elevated emerald circle with dedicated tap area
          if (item.id === 'new') {
            return (
              <div key={item.id} className="flex flex-col items-center justify-center -translate-y-2.5">
                <button
                  type="button"
                  onClick={onOpenNewTransaction}
                  aria-label={item.ariaLabel}
                  className="w-12 h-12 min-w-12 min-h-12 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/30 active:scale-95 transition-all border-2 border-[#0d131f] cursor-pointer"
                >
                  <Icon className="w-6 h-6 stroke-[2.75]" />
                </button>
                <span className="text-[10px] font-medium text-slate-300 tracking-tight mt-0.5">
                  {item.label}
                </span>
              </div>
            );
          }

          // Regular navigation item or "Mais" drawer trigger
          const isActive = activeId === item.id;

          const handleClick = () => {
            if (item.id === 'more') {
              onOpenMore();
            } else if (item.tabId) {
              onTabChange(item.tabId);
            }
          };

          return (
            <button
              key={item.id}
              type="button"
              onClick={handleClick}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
              className={`min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 active:text-slate-100 font-normal'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? 'scale-110 stroke-[2.25]' : 'stroke-[1.75]'
                }`}
              />
              <span className="text-[10px] tracking-tight truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
