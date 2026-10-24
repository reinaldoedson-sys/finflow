import React from 'react';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  Wallet, 
  CreditCard, 
  PiggyBank, 
  Target, 
  BarChart3, 
  LineChart, 
  Activity, 
  Settings, 
  ShieldCheck, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Plus, 
  X,
  Eye,
  EyeOff,
  Lock,
  Cloud,
  LogIn,
  LogOut
} from 'lucide-react';
import { useSecurity } from '../context/SecurityContext';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { preloadFirebase } from '../firebaseLoader';

export interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenNewTransaction: () => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Geral',
    items: [
      { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
      { id: 'transactions', label: 'Transações', icon: ArrowLeftRight },
      { id: 'accounts', label: 'Contas & Cartões', icon: Wallet },
    ],
  },
  {
    title: 'Investimentos',
    items: [
      { id: 'investments', label: 'Investimentos', icon: LineChart },
      { id: 'portfolio', label: 'Monitor de Ativos', icon: Activity },
    ],
  },
  {
    title: 'Planejamento',
    items: [
      { id: 'installments', label: 'Parcelamentos', icon: CreditCard },
      { id: 'budgets', label: 'Orçamentos', icon: PiggyBank },
      { id: 'goals', label: 'Metas Financeiras', icon: Target },
    ],
  },
  {
    title: 'Análise',
    items: [
      { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { id: 'settings', label: 'Configurações', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  onOpenNewTransaction,
  isExpanded,
  onToggleExpanded,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { hideValues, toggleHideValues, isPinEnabled, lockApp } = useSecurity();
  const { syncStatus } = useFinance();
  const { currentUser, signInWithGoogle, logout } = useAuth();

  const handleItemClick = (tabId: string) => {
    onTabChange(tabId);
    onCloseMobile();
  };

  const renderContent = (isMobile = false) => {
    const showExpanded = isMobile || isExpanded;

    return (
      <div className="flex flex-col h-full select-none">
        {/* Sidebar Header: Logo & Toggle */}
        <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-800/80 shrink-0">
          <button
            onClick={() => handleItemClick('dashboard')}
            className={`flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer overflow-hidden ${
              showExpanded ? 'flex-1' : 'justify-center w-full'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            {showExpanded && (
              <div className="flex flex-col truncate animate-in fade-in duration-200">
                <span className="text-base font-extrabold tracking-tight text-white group-hover:text-emerald-300 transition-colors leading-tight">
                  FinFlow
                </span>
                <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">
                  Finanças Pessoais
                </span>
              </div>
            )}
          </button>

          {isMobile ? (
            <button
              onClick={onCloseMobile}
              aria-label="Fechar menu"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            showExpanded && (
              <button
                onClick={onToggleExpanded}
                title="Recolher menu lateral"
                aria-label="Recolher menu lateral"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-1"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        {/* Quick Action: Nova Transação */}
        <div className="p-3 shrink-0">
          {showExpanded ? (
            <button
              onClick={() => {
                onOpenNewTransaction();
                if (isMobile) onCloseMobile();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs transition-all shadow-sm shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Nova Transação</span>
              </div>
              <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] font-mono bg-emerald-500/30 text-emerald-950 rounded">
                N
              </kbd>
            </button>
          ) : (
            <button
              onClick={onOpenNewTransaction}
              title="Nova Transação (N)"
              aria-label="Nova Transação"
              className="w-full flex items-center justify-center p-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold transition-all shadow-sm shadow-emerald-500/20 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-1 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
          {navSections.map((section, sIdx) => (
            <div key={section.title || sIdx} className="space-y-0.5">
              {showExpanded ? (
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2.5 py-1">
                  {section.title}
                </div>
              ) : (
                sIdx > 0 && <div className="h-px bg-slate-800/60 my-2 mx-1" />
              )}

              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                if (!showExpanded) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      title={item.label}
                      aria-label={item.label}
                      className={`w-full flex items-center justify-center p-2.5 rounded-lg text-xs transition-all cursor-pointer relative group ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {/* Tooltip on hover */}
                      <span className="absolute left-full ml-2.5 px-2 py-1 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                        {item.label}
                      </span>
                    </button>
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer group text-left ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 font-semibold border-l-2 border-emerald-400 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`} />
                    <span className="truncate flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer: Quick Utility Toggles & User Session */}
        <div className="border-t border-slate-800/80 p-2.5 bg-slate-950/40 shrink-0 space-y-2">
          {/* Quick utility icons (Privacy & PIN Lock) */}
          <div className={`flex items-center ${showExpanded ? 'justify-between px-1' : 'flex-col gap-1.5'}`}>
            <button
              onClick={toggleHideValues}
              title={hideValues ? 'Exibir valores (P)' : 'Ocultar valores por privacidade (P)'}
              aria-label={hideValues ? 'Exibir valores' : 'Ocultar valores'}
              className={`p-1.5 rounded-lg border transition-all text-xs flex items-center justify-center cursor-pointer ${
                hideValues
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {hideValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {isPinEnabled && (
              <button
                onClick={lockApp}
                title="Bloquear aplicativo agora"
                aria-label="Bloquear aplicativo"
                className="p-1.5 rounded-lg border bg-slate-900/80 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all text-xs flex items-center justify-center cursor-pointer"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            {!isMobile && !showExpanded && (
              <button
                onClick={onToggleExpanded}
                title="Expandir menu lateral"
                aria-label="Expandir menu lateral"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            {showExpanded && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                <Cloud className={`w-3 h-3 ${syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span>{syncStatus === 'synced' ? 'Online' : 'Sinc...'}</span>
              </div>
            )}
          </div>

          {/* User Account Card */}
          {currentUser ? (
            <div className={`p-2 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-2 ${
              showExpanded ? 'justify-between' : 'justify-center'
            }`}>
              <div className="flex items-center gap-2 overflow-hidden">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0">
                    {(currentUser.email?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                {showExpanded && (
                  <div className="truncate">
                    <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
                      {currentUser.displayName || 'Usuário'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {currentUser.email}
                    </p>
                  </div>
                )}
              </div>

              {showExpanded && (
                <button
                  onClick={logout}
                  title="Desconectar da conta Google"
                  aria-label="Desconectar"
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            showExpanded ? (
              <button
                onClick={signInWithGoogle}
                onMouseEnter={() => { void preloadFirebase(); }}
                onFocus={() => { void preloadFirebase(); }}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 transition-all text-xs font-medium cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                <span>Conectar Google</span>
              </button>
            ) : (
              <button
                onClick={signInWithGoogle}
                onMouseEnter={() => { void preloadFirebase(); }}
                onFocus={() => { void preloadFirebase(); }}
                title="Conectar Google"
                aria-label="Conectar Google"
                className="w-full flex items-center justify-center p-2 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-emerald-400" />
              </button>
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-[#0c121d] border-r border-slate-800/80 sticky top-0 h-screen transition-[width] duration-200 ease-in-out z-30 ${
          isExpanded ? 'w-64' : 'w-18'
        }`}
      >
        {renderContent(false)}
      </aside>

      {/* Mobile Off-canvas Slide-over Drawer */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          />

          {/* Drawer container */}
          <aside className="relative w-72 max-w-[85vw] h-full bg-[#0c121d] border-r border-slate-800/80 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-250">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
