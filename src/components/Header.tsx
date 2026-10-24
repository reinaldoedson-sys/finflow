import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { preloadFirebase } from '../firebaseLoader';
import { getMonthLabel } from '../utils/currency';
import { 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Lock, 
  Plus, 
  Settings, 
  ShieldCheck, 
  Cloud, 
  LogOut, 
  LogIn,
  Menu,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenNewTransaction: () => void;
  onOpenSettings: () => void;
  onOpenMobileNav: () => void;
  isSidebarExpanded: boolean;
  onToggleSidebar: () => void;
}

const tabTitles: Record<string, string> = {
  dashboard: 'Visão Geral',
  transactions: 'Transações',
  accounts: 'Contas & Cartões',
  portfolio: 'Monitor de Ativos',
  investments: 'Investimentos',
  installments: 'Parcelamentos',
  budgets: 'Orçamentos',
  goals: 'Metas Financeiras',
  reports: 'Relatórios',
  settings: 'Configurações',
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange: _onTabChange,
  onOpenNewTransaction,
  onOpenSettings,
  onOpenMobileNav,
  isSidebarExpanded,
  onToggleSidebar,
}) => {
  const { hideValues, toggleHideValues, isPinEnabled, lockApp } = useSecurity();
  const { selectedMonth, goToPreviousMonth, goToNextMonth, syncStatus } = useFinance();
  const { currentUser, signInWithGoogle, logout } = useAuth();
  
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-[#0d131f]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 shrink-0">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left Section: Mobile Hamburger or Desktop Sidebar Toggle + Page Title */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Hamburger button for mobile (< md) */}
          <button
            onClick={onOpenMobileNav}
            aria-label="Abrir menu de navegação lateral"
            className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Mobile Brand (visible only < md) */}
          <div className="flex md:hidden items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-white">
              FinFlow
            </span>
          </div>

          {/* Desktop Sidebar Toggle Button & Current Page Title (>= md) */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              onClick={onToggleSidebar}
              title={isSidebarExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              aria-label={isSidebarExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isSidebarExpanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            <span className="text-sm font-semibold text-slate-200">
              {tabTitles[currentTab] || 'Visão Geral'}
            </span>
          </div>
        </div>

        {/* Right Section: Month Selector, Privacy, PIN Lock, Auth & Quick CTA */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
          {/* Month Selector Carousel */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs text-slate-300">
            <button
              onClick={goToPreviousMonth}
              title="Mês anterior"
              className="p-1 sm:p-1.5 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 sm:px-2 font-medium font-mono text-[11px] lg:text-xs text-slate-200 whitespace-nowrap min-w-[75px] sm:min-w-[100px] text-center truncate">
              {getMonthLabel(selectedMonth)}
            </span>
            <button
              onClick={goToNextMonth}
              title="Próximo mês"
              className="p-1 sm:p-1.5 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Privacy Toggle */}
          <button
            onClick={toggleHideValues}
            title={hideValues ? 'Exibir valores (P)' : 'Ocultar valores por privacidade (P)'}
            className={`hidden sm:flex p-2 rounded-lg border transition-all text-xs items-center justify-center cursor-pointer ${
              hideValues
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {hideValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Lock App Button */}
          {isPinEnabled && (
            <button
              onClick={lockApp}
              title="Bloquear aplicativo agora"
              className="hidden sm:flex p-2 rounded-lg border bg-slate-900/80 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all text-xs items-center justify-center cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}

          {/* Cloud Sync & Google Auth */}
          <div className="hidden sm:block">
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(prev => !prev)}
                  className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs transition-all cursor-pointer"
                >
                  <img
                    src={currentUser.photoURL || undefined}
                    alt={currentUser.displayName || 'Usuário'}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full ring-1 ring-emerald-500/40 object-cover"
                  />
                  <span className="hidden lg:inline text-xs font-medium max-w-[100px] truncate text-slate-200">
                    {currentUser.displayName?.split(' ')[0]}
                  </span>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-slate-800/80">
                      <div className="font-semibold text-slate-200 truncate">{currentUser.displayName}</div>
                      <div className="text-[11px] text-slate-400 truncate">{currentUser.email}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-400">
                        <Cloud className="w-3 h-3" />
                        <span>{syncStatus === 'synced' ? 'Nuvem sincronizada' : 'Sincronizando...'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => { setShowUserMenu(false); onOpenSettings(); }}
                      className="w-full text-left px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>Configurações</span>
                    </button>

                    <button
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 border-t border-slate-800/80 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair da conta Google</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                onMouseEnter={() => { void preloadFirebase(); }}
                onFocus={() => { void preloadFirebase(); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 transition-all text-xs whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                <span>Entrar</span>
              </button>
            )}
          </div>

          {/* Quick CTA: Nova Transação */}
          <button
            onClick={onOpenNewTransaction}
            className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm shadow-emerald-500/20 transition-all whitespace-nowrap active:scale-95 cursor-pointer shrink-0"
            title="Nova Transação (N)"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Nova Transação</span>
          </button>
        </div>
      </div>
    </header>
  );
};
