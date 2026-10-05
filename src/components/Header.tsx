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
  LogIn,
  Menu,
  X,
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  PiggyBank,
  Target,
  BarChart3,
  LineChart
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
  const { selectedMonth, goToPreviousMonth, goToNextMonth, isCloudSynced, syncStatus, pendingSyncCount, retrySync } = useFinance();
  const { currentUser, signInWithGoogle, logout } = useAuth();
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transações', icon: ArrowLeftRight },
    { id: 'accounts', label: 'Contas & Cartões', icon: Wallet },
    { id: 'investments', label: 'Investimentos', icon: LineChart },
    { id: 'installments', label: 'Parcelamentos', icon: CreditCard },
    { id: 'budgets', label: 'Orçamentos', icon: PiggyBank },
    { id: 'goals', label: 'Metas', icon: Target },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const handleSelectTab = (tabId: string) => {
    onTabChange(tabId);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#0d131f]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Brand & Mobile Hamburger */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Hamburger button for mobile (< md) */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Abrir menu de navegação lateral"
              className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>

            <button
              onClick={() => onTabChange('dashboard')}
              className="flex items-center gap-2 text-left group focus:outline-none cursor-pointer"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors shrink-0">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                FinFlow
              </span>
            </button>
          </div>

          {/* Desktop Navigation Links (>= md) */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navItems.filter(item => item.id !== 'settings').map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
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

          {/* Action buttons & Utilities */}
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

            {/* Privacy Toggle (Desktop only, available in side drawer on mobile) */}
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

            {/* Lock App Button (Desktop only, available in side drawer on mobile) */}
            {isPinEnabled && (
              <button
                onClick={lockApp}
                title="Bloquear aplicativo agora"
                className="hidden sm:flex p-2 rounded-lg border bg-slate-900/80 border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all text-xs items-center justify-center cursor-pointer"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            {/* Cloud Sync & Google Auth (Desktop only, available in side drawer on mobile) */}
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
                      className="w-5 h-5 rounded-full ring-1 ring-emerald-500/40"
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
                        <span>Configurações & Cofre</span>
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
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 transition-all text-xs whitespace-nowrap cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Entrar</span>
                </button>
              )}
            </div>

            {/* Settings button (Desktop only, available in side drawer on mobile) */}
            <button
              onClick={onOpenSettings}
              title="Configurações e Segurança"
              className={`hidden sm:flex p-2 rounded-lg border transition-all text-xs items-center justify-center cursor-pointer ${
                currentTab === 'settings'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Primary CTA: Nova Transação (Clean '+' on mobile, full text on desktop) */}
            <button
              onClick={onOpenNewTransaction}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm shadow-emerald-500/20 transition-all whitespace-nowrap active:scale-95 cursor-pointer shrink-0"
              title="Nova Transação"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Nova Transação</span>
            </button>
          </div>
        </div>
      </header>

      {/* Menu Lateral Expansível (Sidebar Drawer) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          />

          {/* Drawer Panel */}
          <div className="relative z-10 w-72 max-w-[85vw] h-full bg-[#0a0f1a] border-r border-slate-800 p-4 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-300 overflow-y-auto">
            <div className="space-y-4">
              {/* Drawer Top / Brand & Close */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-base font-extrabold text-white block leading-tight">FinFlow</span>
                    <span className="text-[10px] text-slate-400">Gestão & Segurança</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* User Account Strip */}
              {currentUser ? (
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentUser.photoURL || undefined}
                      alt={currentUser.displayName || 'Usuário'}
                      className="w-8 h-8 rounded-full ring-1 ring-emerald-500/40 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {currentUser.displayName}
                      </div>
                      <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <Cloud className="w-3 h-3" />
                        <span>{syncStatus === 'synced' ? 'Nuvem Ativa' : 'Sincronizando...'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => { setIsMobileMenuOpen(false); logout(); }}
                    title="Sair"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setIsMobileMenuOpen(false); signInWithGoogle(); }}
                  className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800/80 flex items-center justify-center gap-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-emerald-400" />
                  <span>Entrar com Conta Google</span>
                </button>
              )}

              {/* Nav Items List */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-2 block mb-1">
                  Navegação
                </span>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      <div className={`p-1 rounded-lg ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drawer Footer Utilities */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleHideValues}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    hideValues
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {hideValues ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{hideValues ? 'Mostrar' : 'Ocultar'}</span>
                </button>

                {isPinEnabled ? (
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); lockApp(); }}
                    className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Bloquear</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setIsMobileMenuOpen(false); onOpenSettings(); }}
                    className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Ajustes</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
