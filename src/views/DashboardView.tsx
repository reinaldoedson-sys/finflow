import React from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { formatCurrency, formatDateShort, calculatePercentage } from '../utils/currency';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  CreditCard as CardIcon, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Plus,
  ArrowRight,
  ShieldCheck,
  Target
} from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { Transaction } from '../types/finance';

interface DashboardViewProps {
  onOpenNewTransaction: () => void;
  onOpenAccountModal: () => void;
  onOpenBudgetModal: (categoryId?: string, amount?: number) => void;
  onOpenDepositModal: (goalId: string) => void;
  onSelectTransactionToEdit: (tx: Transaction) => void;
  onNavigateToTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenNewTransaction,
  onOpenAccountModal,
  onOpenBudgetModal,
  onOpenDepositModal,
  onSelectTransactionToEdit,
  onNavigateToTab,
}) => {
  const { 
    summary, 
    accounts, 
    creditCards, 
    transactions, 
    categories, 
    budgets, 
    goals, 
    currency, 
    selectedMonth,
    toggleTransactionStatus 
  } = useFinance();
  const { hideValues } = useSecurity();

  // Transactions filtered for current selected month
  const monthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth));

  // Upcoming payables (pending expenses ordered by date)
  const upcomingPayables = transactions
    .filter(t => t.type === 'expense' && t.status === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  // Recent transactions
  const recentTransactions = transactions.slice(0, 5);

  // Month category expenses
  const categoryExpenses = categories.map(cat => {
    const total = monthTransactions
      .filter(t => t.categoryId === cat.id && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const budget = budgets.find(b => b.categoryId === cat.id && b.month === selectedMonth);
    return {
      category: cat,
      spent: total,
      limit: budget?.limitAmount || 0,
      percentage: budget?.limitAmount ? calculatePercentage(total, budget.limitAmount) : 0
    };
  }).filter(c => c.spent > 0 || c.limit > 0)
    .sort((a, b) => b.spent - a.spent);

  return (
    <div className="space-y-6">
      {/* 4 Top KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Patrimônio Líquido */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Patrimônio Líquido</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {formatCurrency(summary.totalNetWorth, currency, hideValues)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Contas: {formatCurrency(summary.totalAccountsBalance, currency, hideValues)}</span>
            <span aria-hidden="true">·</span>
            <span className="text-rose-400/90">Faturas: -{formatCurrency(summary.totalCreditCardDebt, currency, hideValues)}</span>
          </div>
        </div>

        {/* KPI 2: Entradas do Mês */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Receitas do Mês</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
            +{formatCurrency(summary.monthRealizedIncome, currency, hideValues)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Previsto total: {formatCurrency(summary.monthExpectedIncome, currency, hideValues)}</span>
          </div>
        </div>

        {/* KPI 3: Despesas do Mês */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Despesas do Mês</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 tracking-tight">
            -{formatCurrency(summary.monthRealizedExpense, currency, hideValues)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pendente a pagar: {formatCurrency(summary.monthExpectedExpense - summary.monthRealizedExpense, currency, hideValues)}</span>
          </div>
        </div>

        {/* KPI 4: Economia / Saldo Líquido */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Resultado Mensal</span>
            <span className="text-[11px] font-mono font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              {summary.savingsRate}% poupado
            </span>
          </div>
          <div className={`text-2xl font-bold font-mono tracking-tight ${
            summary.monthNetBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {summary.monthNetBalance >= 0 ? '+' : ''}
            {formatCurrency(summary.monthNetBalance, currency, hideValues)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {summary.monthNetBalance >= 0 ? 'Superávit no período' : 'Déficit no período'}
          </div>
        </div>
      </div>

      {/* Accounts & Credit Cards Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span>Contas Bancárias & Cartões</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateToTab('accounts')}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
            >
              <span>Gerenciar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpenAccountModal}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Accounts */}
          {accounts.map(acc => (
            <div
              key={acc.id}
              className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: acc.color }}
                  />
                  <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                    {acc.name}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  {acc.type === 'checking' ? 'Corrente' : acc.type === 'investment' ? 'Invest.' : acc.type === 'cash' ? 'Espécie' : 'Poupança'}
                </span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {formatCurrency(acc.currentBalance, currency, hideValues)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">{acc.bankName}</p>
            </div>
          ))}

          {/* Credit Cards */}
          {creditCards.map(card => {
            const usagePercent = calculatePercentage(card.currentInvoice, card.limit);
            return (
              <div
                key={card.id}
                className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CardIcon className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                      {card.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-purple-400 font-mono">
                    Vence dia {card.dueDay}
                  </span>
                </div>
                <div className="text-lg font-bold font-mono text-rose-400">
                  {formatCurrency(card.currentInvoice, currency, hideValues)}
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>Limite: {formatCurrency(card.limit, currency, hideValues)}</span>
                    <span className="font-mono">{usagePercent}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercent > 80 ? 'bg-rose-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Left (Transactions & Bills) & Right (Budgets & Goals) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming Bills Alert Section */}
          {upcomingPayables.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Próximos Vencimentos
                  </h3>
                </div>
                <span className="text-xs text-amber-400 font-medium">
                  {upcomingPayables.length} a pagar
                </span>
              </div>

              <div className="space-y-2">
                {upcomingPayables.map((tx) => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cat?.color || '#6366f1'}20` }}
                        >
                          <CategoryIcon name={cat?.icon || 'FileText'} color={cat?.color} className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-100">{tx.description}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <span>Vence {formatDateShort(tx.date)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{cat?.name || 'Despesa'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold font-mono text-rose-400">
                          {formatCurrency(tx.amount, currency, hideValues)}
                        </span>
                        <button
                          onClick={() => toggleTransactionStatus(tx.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md transition-all whitespace-nowrap"
                        >
                          Marcar Pago
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Transactions List */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Últimos Lançamentos
              </h3>
              <button
                onClick={() => onNavigateToTab('transactions')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
              >
                <span>Ver Extrato Completo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhuma transação registrada ainda.{' '}
                <button
                  onClick={onOpenNewTransaction}
                  className="text-emerald-400 underline font-medium ml-1"
                >
                  Registrar primeira
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {recentTransactions.map((tx) => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  const acc = accounts.find(a => a.id === tx.accountId);
                  const isIncome = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';

                  return (
                    <div
                      key={tx.id}
                      onClick={() => onSelectTransactionToEdit(tx)}
                      className="py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 px-2 rounded-lg transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isIncome
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : isTransfer
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {isIncome ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : isTransfer ? (
                            <ArrowRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
                            {tx.description}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <span>{formatDateShort(tx.date)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{cat?.name || 'Geral'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{acc?.name || 'Conta'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs font-bold font-mono ${
                            isIncome
                              ? 'text-emerald-400'
                              : isTransfer
                              ? 'text-blue-400'
                              : 'text-slate-100'
                          }`}
                        >
                          {isIncome ? '+' : isTransfer ? '' : '-'}
                          {formatCurrency(tx.amount, currency, hideValues)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {tx.status === 'completed' ? (
                            <span className="text-emerald-400/80">Concluído</span>
                          ) : (
                            <span className="text-amber-400/80">Pendente</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Budgets & Goals (1 Col wide) */}
        <div className="space-y-6">
          {/* Monthly Budgets Progress */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Orçamentos do Mês
              </h3>
              <button
                onClick={() => onNavigateToTab('budgets')}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              >
                <span>Ver todos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {categoryExpenses.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum orçamento configurado ainda.
              </p>
            ) : (
              <div className="space-y-3.5">
                {categoryExpenses.slice(0, 4).map(({ category, spent, limit, percentage }) => {
                  const isOver = limit > 0 && spent > limit;
                  const isWarning = limit > 0 && percentage >= 80 && !isOver;

                  return (
                    <div key={category.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <CategoryIcon name={category.icon} color={category.color} className="w-3.5 h-3.5" />
                          <span className="text-slate-200 font-medium text-xs">{category.name}</span>
                        </div>
                        <div className="text-right font-mono text-[11px]">
                          <span className={isOver ? 'text-rose-400 font-bold' : 'text-slate-200 font-medium'}>
                            {formatCurrency(spent, currency, hideValues)}
                          </span>
                          {limit > 0 && (
                            <span className="text-slate-500 font-normal"> / {formatCurrency(limit, currency, hideValues)}</span>
                          )}
                        </div>
                      </div>

                      {limit > 0 && (
                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOver ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Goals & Reserves Preview */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Metas Financeiras
                </h3>
              </div>
              <button
                onClick={() => onNavigateToTab('goals')}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
              >
                <span>Ver metas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {goals.slice(0, 3).map((goal) => {
                const percent = calculatePercentage(goal.currentAmount, goal.targetAmount);
                return (
                  <div
                    key={goal.id}
                    className="p-3 rounded-lg bg-slate-800/40 border border-slate-800/80 hover:border-slate-700/80 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-200 truncate max-w-[150px]">{goal.name}</span>
                      <span className="font-mono text-emerald-400 font-bold">{percent}%</span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{formatCurrency(goal.currentAmount, currency, hideValues)} de {formatCurrency(goal.targetAmount, currency, hideValues)}</span>
                      <button
                        onClick={() => onOpenDepositModal(goal.id)}
                        className="text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        + Aporte
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
