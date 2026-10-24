import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { SecurityProvider } from './context/SecurityContext';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { PinLockModal } from './components/PinLockModal';
import { TransactionModal } from './components/TransactionModal';
import { AccountModal } from './components/AccountModal';
import { GoalModal } from './components/GoalModal';
import { GoalDepositModal } from './components/GoalDepositModal';
import { BudgetModal } from './components/BudgetModal';
import { BackupModal } from './components/BackupModal';
import { AccountConflictModal } from './components/AccountConflictModal';
import { InstallmentModal } from './components/InstallmentModal';
import { InvestmentModal } from './components/InvestmentModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { MobileBottomNav } from './components/MobileBottomNav';

import { DashboardView } from './views/DashboardView';
const TransactionsView = lazy(() => import('./views/TransactionsView').then(m => ({ default: m.TransactionsView })));
const AccountsView = lazy(() => import('./views/AccountsView').then(m => ({ default: m.AccountsView })));
const InvestmentsView = lazy(() => import('./views/InvestmentsView').then(m => ({ default: m.InvestmentsView })));
const PortfolioMonitoringView = lazy(() => import('./views/PortfolioMonitoringView').then(m => ({ default: m.PortfolioMonitoringView })));
const BudgetsView = lazy(() => import('./views/BudgetsView').then(m => ({ default: m.BudgetsView })));
const GoalsView = lazy(() => import('./views/GoalsView').then(m => ({ default: m.GoalsView })));
const InstallmentsView = lazy(() => import('./views/InstallmentsView').then(m => ({ default: m.InstallmentsView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[40vh] py-16 animate-in fade-in duration-150">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-emerald-500 animate-spin" />
      <span className="text-xs text-slate-400 font-medium tracking-wide">Carregando...</span>
    </div>
  </div>
);

import { Transaction, Account, CreditCard, FinancialGoal, InvestmentAsset } from './types/finance';
import { ShieldCheck } from 'lucide-react';

const FinFlowApp: React.FC = () => {
  const {
    goals,
    isOwnershipConflict,
    confirmClearAndSwitchAccount,
    cancelConflictLogout
  } = useFinance();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Sidebar expanded / collapsed state (persisted)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('finflow_sidebar_expanded') !== 'false';
    } catch {
      return true;
    }
  });

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('finflow_sidebar_expanded', String(isSidebarExpanded));
    } catch {
      // ignore
    }
  }, [isSidebarExpanded]);

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingCreditCard, setEditingCreditCard] = useState<CreditCard | null>(null);
  const [accountModalMode, setAccountModalMode] = useState<'account' | 'creditCard'>('account');

  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);

  const [isGoalDepositModalOpen, setIsGoalDepositModalOpen] = useState(false);
  const [selectedGoalForDeposit, setSelectedGoalForDeposit] = useState<FinancialGoal | null>(null);

  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);

  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<InvestmentAsset | null>(null);

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetCatId, setBudgetCatId] = useState<string | undefined>(undefined);
  const [budgetInitialAmount, setBudgetInitialAmount] = useState<number | undefined>(undefined);

  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setEditingTx(null);
        setIsTxModalOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarExpanded(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers
  const handleOpenNewTransaction = () => {
    setEditingTx(null);
    setIsTxModalOpen(true);
  };

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setIsTxModalOpen(true);
  };

  const handleOpenNewAccount = () => {
    setEditingAccount(null);
    setEditingCreditCard(null);
    setAccountModalMode('account');
    setIsAccountModalOpen(true);
  };

  const handleOpenNewCreditCard = () => {
    setEditingAccount(null);
    setEditingCreditCard(null);
    setAccountModalMode('creditCard');
    setIsAccountModalOpen(true);
  };

  const handleEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setEditingCreditCard(null);
    setAccountModalMode('account');
    setIsAccountModalOpen(true);
  };

  const handleEditCreditCard = (card: CreditCard) => {
    setEditingCreditCard(card);
    setEditingAccount(null);
    setAccountModalMode('creditCard');
    setIsAccountModalOpen(true);
  };

  const handleOpenNewGoal = () => {
    setEditingGoal(null);
    setIsGoalModalOpen(true);
  };

  const handleEditGoal = (goal: FinancialGoal) => {
    setEditingGoal(goal);
    setIsGoalModalOpen(true);
  };

  const handleOpenDepositModal = (goalId: string) => {
    const goal = goals.find(g => g.id === goalId);
    if (goal) {
      setSelectedGoalForDeposit(goal);
      setIsGoalDepositModalOpen(true);
    }
  };

  const handleOpenBudgetModal = (categoryId?: string, amount?: number) => {
    setBudgetCatId(categoryId);
    setBudgetInitialAmount(amount);
    setIsBudgetModalOpen(true);
  };

  const handleOpenNewInvestment = () => {
    setEditingAsset(null);
    setIsInvestmentModalOpen(true);
  };

  const handleEditInvestment = (asset: InvestmentAsset) => {
    setEditingAsset(asset);
    setIsInvestmentModalOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-[#0b0f17] text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Sidebar Expansível (Desktop persistent + Mobile off-canvas drawer) */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onOpenNewTransaction={handleOpenNewTransaction}
        isExpanded={isSidebarExpanded}
        onToggleExpanded={() => setIsSidebarExpanded(prev => !prev)}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Bar Navigation */}
        <Header
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          onOpenNewTransaction={handleOpenNewTransaction}
          onOpenSettings={() => setCurrentTab('settings')}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          isSidebarExpanded={isSidebarExpanded}
          onToggleSidebar={() => setIsSidebarExpanded(prev => !prev)}
        />

        {/* Main View Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 pb-24 md:pb-6">
          <UpdateBanner />
          <PWAInstallBanner />
          <Suspense fallback={<ViewLoadingFallback />}>
            {currentTab === 'dashboard' && (
              <DashboardView
                onOpenNewTransaction={handleOpenNewTransaction}
                onOpenAccountModal={handleOpenNewAccount}
                onOpenBudgetModal={handleOpenBudgetModal}
                onOpenDepositModal={handleOpenDepositModal}
                onSelectTransactionToEdit={handleEditTransaction}
                onNavigateToTab={setCurrentTab}
              />
            )}

            {currentTab === 'transactions' && (
              <TransactionsView
                onOpenNewTransaction={handleOpenNewTransaction}
                onEditTransaction={handleEditTransaction}
              />
            )}

            {currentTab === 'accounts' && (
              <AccountsView
                onOpenNewAccount={handleOpenNewAccount}
                onOpenNewCreditCard={handleOpenNewCreditCard}
                onEditAccount={handleEditAccount}
                onEditCreditCard={handleEditCreditCard}
              />
            )}

            {currentTab === 'portfolio' && (
              <PortfolioMonitoringView
                onOpenNewInvestment={handleOpenNewInvestment}
                onEditInvestment={handleEditInvestment}
                onNavigateToInvestments={() => setCurrentTab('investments')}
              />
            )}

            {currentTab === 'investments' && (
              <InvestmentsView
                onOpenNewInvestment={handleOpenNewInvestment}
                onEditInvestment={handleEditInvestment}
                onNavigateToPortfolio={() => setCurrentTab('portfolio')}
              />
            )}

            {currentTab === 'installments' && (
              <InstallmentsView
                onOpenNewInstallment={() => setIsInstallmentModalOpen(true)}
              />
            )}

            {currentTab === 'budgets' && (
              <BudgetsView
                onOpenBudgetModal={handleOpenBudgetModal}
              />
            )}

            {currentTab === 'goals' && (
              <GoalsView
                onOpenNewGoal={handleOpenNewGoal}
                onEditGoal={handleEditGoal}
                onOpenDepositModal={handleOpenDepositModal}
              />
            )}

            {currentTab === 'reports' && (
              <ReportsView />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                onOpenBackupModal={() => setIsBackupModalOpen(true)}
              />
            )}
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-slate-900 bg-[#080c14] py-6 px-4 pb-24 md:pb-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-slate-400">FinFlow</span>
              <span>· Gestão Financeira Pessoal com Dados Locais e Sincronização Opcional</span>
            </div>
            <div className="flex items-center gap-4 text-slate-500 text-[11px]">
              <span>100% Local no Navegador</span>
              <span>·</span>
              <span>Bloqueio por PIN</span>
              <span>·</span>
              <span>Zero Rastreamento</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Native Bottom Navigation */}
      <MobileBottomNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onOpenNewTransaction={handleOpenNewTransaction}
      />

      {/* Modals & Overlays */}
      <PinLockModal />

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        editTransaction={editingTx}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        editAccount={editingAccount}
        editCreditCard={editingCreditCard}
        initialMode={accountModalMode}
      />

      <GoalModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        editGoal={editingGoal}
      />

      <GoalDepositModal
        isOpen={isGoalDepositModalOpen}
        onClose={() => setIsGoalDepositModalOpen(false)}
        goal={selectedGoalForDeposit}
      />

      <BudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        categoryId={budgetCatId}
        initialAmount={budgetInitialAmount}
      />

      <InstallmentModal
        isOpen={isInstallmentModalOpen}
        onClose={() => setIsInstallmentModalOpen(false)}
      />

      <InvestmentModal
        isOpen={isInvestmentModalOpen}
        onClose={() => setIsInvestmentModalOpen(false)}
        editAsset={editingAsset}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />

      <AccountConflictModal
        isOpen={isOwnershipConflict}
        onOpenBackup={() => setIsBackupModalOpen(true)}
        onConfirmClearAndSwitch={confirmClearAndSwitchAccount}
        onCancelLogout={cancelConflictLogout}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <SecurityProvider>
        <FinanceProvider>
          <FinFlowApp />
        </FinanceProvider>
      </SecurityProvider>
    </AuthProvider>
  );
}
