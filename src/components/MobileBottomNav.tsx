import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  Wallet, 
  CreditCard, 
  SlidersHorizontal,
  Target,
  PiggyBank,
  BarChart3,
  Settings,
  LineChart,
  X
} from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenNewTransaction: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onTabChange,
  onOpenNewTransaction,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const mainTabs = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
    { id: 'transactions', label: 'Extrato', icon: ArrowLeftRight },
    { id: 'accounts', label: 'Contas', icon: Wallet },
    { id: 'installments', label: 'Parcelas', icon: CreditCard },
  ];

  const moreItems = [
    { id: 'investments', label: 'Investimentos & Cotações', icon: LineChart, desc: 'B3, FIIs, Cripto e Renda Fixa ao vivo' },
    { id: 'budgets', label: 'Orçamentos & Teto', icon: PiggyBank, desc: 'Limites mensais por categoria' },
    { id: 'goals', label: 'Metas & Cofrinhos', icon: Target, desc: 'Aportes e reservas financeiras' },
    { id: 'reports', label: 'Relatórios & Gráficos', icon: BarChart3, desc: 'Evolução e distribuição de despesas' },
    { id: 'settings', label: 'Configurações & Cofre', icon: Settings, desc: 'PIN, Moeda e Backup seguro' },
  ];

  const handleSelectMoreTab = (tabId: string) => {
    onTabChange(tabId);
    setShowMoreMenu(false);
  };

  const isMoreActive = ['investments', 'budgets', 'goals', 'reports', 'settings'].includes(currentTab);

  return (
    <>
      {/* More Options Bottom Sheet Modal */}
      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200">
          <div 
            className="fixed inset-0"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="relative z-10 bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-8 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Mais Recursos</span>
              <button
                onClick={() => setShowMoreMenu(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectMoreTab(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-white'
                        : 'bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Bar for Mobile (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#090d16]/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 safe-area-pb shadow-2xl">
        <div className="flex items-center justify-around">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'text-emerald-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className={`p-1 rounded-lg transition-transform ${isActive ? 'scale-110' : ''}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
              isMoreActive || showMoreMenu
                ? 'text-emerald-400 font-bold'
                : 'text-slate-400 hover:text-slate-200 font-medium'
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isMoreActive || showMoreMenu ? 'scale-110' : ''}`}>
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
};
