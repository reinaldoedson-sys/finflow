import React, { useState, useEffect, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
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
import { SampleDataBanner } from './components/SampleDataBanner';
import { useTabHistory } from './hooks/useTabHistory';
import { tabFromHash } from './domain/tabRouting';
import { parseLaunchAction, removeLaunchParams, LaunchAction } from './domain/launchActions';

import { DashboardView } from './views/DashboardView';
import { TransactionsView } from './views/TransactionsView';
import { AccountsView } from './views/AccountsView';
import { InvestmentsView } from './views/InvestmentsView';
import { PortfolioMonitoringView } from './views/PortfolioMonitoringView';
import { BudgetsView } from './views/BudgetsView';
import { GoalsView } from './views/GoalsView';
import { InstallmentsView } from './views/InstallmentsView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';

const AnalyticsView = React.lazy(() => import('./views/AnalyticsView').then(m => ({ default: m.AnalyticsView })));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[40vh] py-16 animate-in fade-in duration-150">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-emerald-500 animate-spin" />
      <span className="text-xs text-slate-400 font-medium tracking-wide">Carregando...</span>
    </div>
  </div>
);

import { Transaction, Account, CreditCard, FinancialGoal, InvestmentAsset } from './types/finance';

const FinFlowApp: React.FC = () => {
  const { isLocked } = useSecurity();
  const {
    goals,
    isOwnershipConflict,
    confirmClearAndSwitchAccount,
    cancelConflictLogout
  } = useFinance();

  // Inicializa a aba diretamente pelo hash da URL para evitar piscar o Início
  const [currentTab, setCurrentTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return tabFromHash(window.location.hash);
    }
    return 'dashboard';
  });

  // Hook que sincroniza a navegação com a History API do navegador
  const navigateToTab = useTabHistory(currentTab, setCurrentTab);

  // Sidebar expanded / collapsed state (persisted)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('finflow_sidebar_expanded') !== 'false';
    } catch {
      return true;
    }
  });

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Ação de lançamento capturada na inicialização (ex.: atalhos do ícone PWA ?acao=nova-despesa)
  const [pendingLaunchAction, setPendingLaunchAction] = useState<LaunchAction | null>(() => {
    if (typeof window !== 'undefined') {
      const action = parseLaunchAction(window.location.search);
      if (action) {
        const cleanUrl = removeLaunchParams(
          window.location.pathname,
          window.location.search,
          window.location.hash
        );
        window.history.replaceState(window.history.state, '', cleanUrl);
        return action;
      }
    }
    return null;
  });

  // Tipo e campos iniciais ao abrir nova transação ('expense' ou 'income')
  const [txInitialType, setTxInitialType] = useState<'expense' | 'income'>('expense');
  const [txInitialDescription, setTxInitialDescription] = useState<string | undefined>(undefined);
  const [txInitialAmount, setTxInitialAmount] = useState<number | undefined>(undefined);
  const [txInitialDate, setTxInitialDate] = useState<string | undefined>(undefined);
  const [txInitialNotes, setTxInitialNotes] = useState<string | undefined>(undefined);

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

  // Executa ação pendente de inicialização assim que o app estiver liberado (sem PIN ou após desbloqueio)
  useEffect(() => {
    if (!isLocked && pendingLaunchAction) {
      if (pendingLaunchAction.kind === 'new-transaction') {
        setEditingTx(null);
        setTxInitialType(pendingLaunchAction.type);
        setTxInitialDescription(undefined);
        setTxInitialAmount(undefined);
        setTxInitialDate(undefined);
        setTxInitialNotes(undefined);
        setIsTxModalOpen(true);
      } else if (pendingLaunchAction.kind === 'shared-content') {
        setEditingTx(null);
        setTxInitialType(pendingLaunchAction.type);
        setTxInitialDescription(pendingLaunchAction.description);
        setTxInitialAmount(pendingLaunchAction.amount);
        setTxInitialDate(pendingLaunchAction.date);
        setTxInitialNotes(pendingLaunchAction.notes);
        setIsTxModalOpen(true);
      }
      setPendingLaunchAction(null);
    }
  }, [isLocked, pendingLaunchAction]);

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

  // Monitora se qualquer modal, gaveta mobile ou bloqueio está ativo
  const anyOverlayOpen = Boolean(
    isTxModalOpen ||
    isAccountModalOpen ||
    isGoalModalOpen ||
    isGoalDepositModalOpen ||
    isBudgetModalOpen ||
    isInstallmentModalOpen ||
    isInvestmentModalOpen ||
    isBackupModalOpen ||
    isOwnershipConflict ||
    isMobileNavOpen ||
    isLocked
  );

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
        setTxInitialType('expense');
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
  const handleOpenNewTransaction = (initialType: 'expense' | 'income' = 'expense') => {
    setEditingTx(null);
    setTxInitialType(initialType);
    setTxInitialDescription(undefined);
    setTxInitialAmount(undefined);
    setTxInitialDate(undefined);
    setTxInitialNotes(undefined);
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
        onTabChange={navigateToTab}
        onOpenNewTransaction={handleOpenNewTransaction}
        isExpanded={isSidebarExpanded}
        onToggleExpanded={() => setIsSidebarExpanded(prev => !prev)}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-clip">
        {/* Top Bar Navigation */}
        <Header
          currentTab={currentTab}
          onTabChange={navigateToTab}
          onOpenNewTransaction={handleOpenNewTransaction}
          onOpenSettings={() => navigateToTab('settings')}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          isSidebarExpanded={isSidebarExpanded}
          onToggleSidebar={() => setIsSidebarExpanded(prev => !prev)}
        />

        {/* Main View Area (com pb-24 no mobile para não sobrepor a barra de navegação inferior fixa) */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8 min-w-0 overflow-x-clip">
          <UpdateBanner />
          <PWAInstallBanner />
          <SampleDataBanner />
          <Suspense fallback={<ViewLoadingFallback />}>
            {currentTab === 'dashboard' && (
              <DashboardView
                onOpenNewTransaction={handleOpenNewTransaction}
                onOpenAccountModal={handleOpenNewAccount}
                onOpenBudgetModal={handleOpenBudgetModal}
                onOpenDepositModal={handleOpenDepositModal}
                onSelectTransactionToEdit={handleEditTransaction}
                onNavigateToTab={navigateToTab}
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
                onNavigateToInvestments={() => navigateToTab('investments')}
              />
            )}

            {currentTab === 'investments' && (
              <InvestmentsView
                onOpenNewInvestment={handleOpenNewInvestment}
                onEditInvestment={handleEditInvestment}
                onNavigateToPortfolio={() => navigateToTab('portfolio')}
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

            {currentTab === 'analytics' && (
              <AnalyticsView />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                onOpenBackupModal={() => setIsBackupModalOpen(true)}
              />
            )}
          </Suspense>
        </main>

        {/* Footer (oculto no mobile abaixo de md, visível apenas no desktop) */}
        <footer className="hidden md:block mt-auto border-t border-slate-900 bg-[#080c14] py-6 px-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src="/pwa-192x192.png" alt="OndeFoi?" className="w-4 h-4 rounded object-cover shadow-sm" />
              <span className="font-semibold text-slate-400">OndeFoi?</span>
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

      {/* Mobile Bottom Navigation Bar (md:hidden, desmontada quando qualquer modal ou gaveta estiver aberta) */}
      {!anyOverlayOpen && (
        <BottomNav
          currentTab={currentTab}
          onTabChange={navigateToTab}
          onOpenNewTransaction={handleOpenNewTransaction}
          onOpenMore={() => setIsMobileNavOpen(true)}
        />
      )}

      {/* Modals & Overlays */}
      <PinLockModal />

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        editTransaction={editingTx}
        initialType={txInitialType}
        initialDescription={txInitialDescription}
        initialAmount={txInitialAmount}
        initialDate={txInitialDate}
        initialNotes={txInitialNotes}
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
