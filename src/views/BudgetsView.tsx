import React from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { formatCurrency, calculatePercentage, getMonthLabel } from '../utils/currency';
import { Plus, Edit2, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';

interface BudgetsViewProps {
  onOpenBudgetModal: (categoryId?: string, amount?: number) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onOpenBudgetModal }) => {
  const { categories, budgets, transactions, currency, selectedMonth } = useFinance();
  const { hideValues } = useSecurity();

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both');

  // Compute stats for each category for the selected month
  const categoryBudgets = expenseCategories.map(cat => {
    const budget = budgets.find(b => b.categoryId === cat.id && b.month === selectedMonth);
    const spent = transactions
      .filter(t => t.categoryId === cat.id && t.type === 'expense' && t.date.startsWith(selectedMonth))
      .reduce((sum, t) => sum + t.amount, 0);

    const limit = budget?.limitAmount || 0;
    const remaining = limit > 0 ? limit - spent : 0;
    const percentage = limit > 0 ? calculatePercentage(spent, limit) : 0;
    const isOver = limit > 0 && spent > limit;
    const isWarning = limit > 0 && percentage >= 80 && !isOver;

    return {
      category: cat,
      budgetId: budget?.id,
      spent,
      limit,
      remaining,
      percentage,
      isOver,
      isWarning,
      hasBudget: limit > 0
    };
  });

  const totalBudgeted = categoryBudgets.reduce((sum, c) => sum + c.limit, 0);
  const totalSpentInBudgeted = categoryBudgets
    .filter(c => c.hasBudget)
    .reduce((sum, c) => sum + c.spent, 0);

  const overallPercent = totalBudgeted > 0 ? calculatePercentage(totalSpentInBudgeted, totalBudgeted) : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner Overview */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              {getMonthLabel(selectedMonth)}
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Planejamento & Teto de Gastos
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Monitore seus limites por categoria para manter suas finanças sob controle
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenBudgetModal()}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Limite</span>
            </button>
          </div>
        </div>

        {totalBudgeted > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>
                Total gasto no orçamento:{' '}
                <strong className="text-white font-mono">{formatCurrency(totalSpentInBudgeted, currency, hideValues)}</strong>
              </span>
              <span>
                Teto global planejado:{' '}
                <strong className="text-white font-mono">{formatCurrency(totalBudgeted, currency, hideValues)}</strong>
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  overallPercent > 100 ? 'bg-rose-500' : overallPercent > 80 ? 'bg-amber-500' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.min(overallPercent, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Grid of category budgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoryBudgets.map(({ category, spent, limit, remaining, percentage, isOver, isWarning, hasBudget }) => (
          <div
            key={category.id}
            className={`p-4 rounded-xl border transition-all ${
              isOver 
                ? 'bg-rose-950/20 border-rose-500/30' 
                : isWarning
                ? 'bg-amber-950/20 border-amber-500/30'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${category.color}25` }}
                >
                  <CategoryIcon name={category.icon} color={category.color} className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-100">{category.name}</h3>
              </div>

              <button
                onClick={() => onOpenBudgetModal(category.id, limit)}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Configurar teto desta categoria"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {hasBudget ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-bold font-mono text-white">
                    {formatCurrency(spent, currency, hideValues)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    de {formatCurrency(limit, currency, hideValues)}
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOver ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="font-mono text-slate-400">{percentage}% utilizado</span>
                  {isOver ? (
                    <span className="text-rose-400 font-semibold flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Excedido em {formatCurrency(Math.abs(remaining), currency, hideValues)}
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1 font-mono">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Resta {formatCurrency(remaining, currency, hideValues)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-3 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  Total gasto: <strong className="text-slate-200 font-mono">{formatCurrency(spent, currency, hideValues)}</strong>
                </p>
                <button
                  onClick={() => onOpenBudgetModal(category.id, 500)}
                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300 underline"
                >
                  Definir teto de gastos
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
