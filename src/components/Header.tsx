import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
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
  LogIn
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenNewTransaction: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  onOpenNewTransaction,
  onOpenSettings,
}) => {
  const { hideValues, toggleHideValues, isPinEnabled, lockApp } = useSecurity();
  const { selectedMonth, goToPreviousMonth, goToNextMonth, isCloudSynced } = useFinance();
  const { currentUser, signInWithGoogle, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Visão Geral' },
    { id: 'transactions', label: 'Transações' },
    { id: 'accounts', label: 'Contas & Cartões' },
    { id: 'installments', label: 'Parcelamentos' },
    { id: 'budgets', label: 'Orçamentos' },
    { id: 'goals', label: 'Metas' },
    { id: 'reports', label: 'Relatórios' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#0d131f]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Single text element Brand Zone */}
        <div className="flex items-center gap-6 shrink-0">
          <button
            onClick={() => onTabChange('dashboard')}
            className="flex items-center gap-2 text-left group focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
              FinFlow
            </span>
          </button>
        </div>

        {/* Zone 2: 4-6 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1-2 primary actions + quick utilities */}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0">
          {/* Month Selector Carousel */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs text-slate-300">
            <button
              onClick={goToPreviousMonth}
              title="Mês anterior"
              className="p-1.5 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-medium font-mono text-[11px] lg:text-xs text-slate-200 whitespace-nowrap min-w-[100px] text-center">
              {getMonthLabel(selectedMonth)}
            </span>
            <button
              onClick={goToNextMonth}
              title="Próximo mês"
              className="p-1.5 hover:text-white hover:bg-slate-800 rounded transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Privacy Toggle */}
          <button
            onClick={toggleHideValues}
            title={hideValues ? 'Exibir valores (P)' : 'Ocultar valores por privacidade (P)'}
            className={`p-2 rounded-lg border transition-all text-xs flex items-center justify-center ${
              hideValues
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {hideValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Lock App Button (if PIN enabled) */}
          {isPinEnabled && (
            <button
              onClick={lockApp}
              title="Bloquear aplicativo agora"
              className="p-2 rounded-lg border bg-slate-900/80 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all text-xs flex items-center justify-center"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}

          {/* Cloud Sync & Google Auth */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(prev => !prev)}
                title={`Conectado como ${currentUser.email || currentUser.displayName}`}
                className="flex items-center gap-1.5 p-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs"
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/30 text-[10px] font-bold flex items-center justify-center text-emerald-200">
                    {(currentUser.email?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <Cloud className="w-3.5 h-3.5 text-emerald-400 hidden sm:inline" />
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0e1422] border border-slate-800 shadow-xl py-2 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-slate-800/80">
                    <p className="font-semibold text-white truncate">{currentUser.displayName || 'Usuário'}</p>
                    <p className="text-[11px] text-slate-400 truncate">{currentUser.email}</p>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Sincronização em nuvem ativa</span>
                    </div>
                  </div>

                  <button
                    onClick={() => { setShowUserMenu(false); onOpenSettings(); }}
                    className="w-full text-left px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Configurações & Cofre</span>
                  </button>

                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 border-t border-slate-800/80"
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
              title="Entrar com Google para sincronizar seus dados no Firebase Firestore"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 transition-all text-xs whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Entrar</span>
            </button>
          )}

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            title="Configurações e Segurança"
            className={`p-2 rounded-lg border transition-all text-xs flex items-center justify-center ${
              currentTab === 'settings'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Primary CTA: Nova Transação */}
          <button
            onClick={onOpenNewTransaction}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm shadow-emerald-500/20 transition-all whitespace-nowrap active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Nova Transação</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation bar */}
      <div className="md:hidden flex items-center justify-between gap-1 overflow-x-auto pt-3 mt-2 border-t border-slate-800/60 no-scrollbar">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
