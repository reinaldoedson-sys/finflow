import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { SecurityProvider } from './context/SecurityContext';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { Header } from './components/Header';
import { PinLockModal } from './components/PinLockModal';
import { TransactionModal } from './components/TransactionModal';
import { AccountModal } from './components/AccountModal';
import { GoalModal } from './components/GoalModal';
import { GoalDepositModal } from './components/GoalDepositModal';
import { BudgetModal } from './components/BudgetModal';
import { BackupModal } from './components/BackupModal';
import { InstallmentModal } from './components/InstallmentModal';

import { DashboardView } from './views/DashboardView';
import { TransactionsView } from './views/TransactionsView';
import { AccountsView } from './views/AccountsView';
import { BudgetsView } from './views/BudgetsView';
import { GoalsView } from './views/GoalsView';
import { InstallmentsView } from './views/InstallmentsView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';

import { Transaction, Account, CreditCard, FinancialGoal } from './types/finance';
import { ShieldCheck } from 'lucide-react';

const FinFlowApp: React.FC = () => {
  const { goals } = useFinance();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');

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

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f17] text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Bar Navigation */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onOpenNewTransaction={handleOpenNewTransaction}
        onOpenSettings={() => setCurrentTab('settings')}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
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
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-[#080c14] py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-400">FinFlow</span>
            <span>· Gestão Financeira Pessoal com Simplicidade & Segurança Máxima</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
            <span>100% Local no Navegador</span>
            <span>·</span>
            <span>Criptografia AES-256</span>
            <span>·</span>
            <span>Zero Rastreamento</span>
          </div>
        </div>
      </footer>

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

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
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
