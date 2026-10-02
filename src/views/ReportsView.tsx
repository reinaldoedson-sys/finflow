import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { formatCurrency, getMonthLabel, getPreviousMonth } from '../utils/currency';
import { PieChart, BarChart3, TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight, Award } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';

export const ReportsView: React.FC = () => {
  const { transactions, categories, selectedMonth, currency, summary } = useFinance();
  const { hideValues } = useSecurity();

  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null);

  // Month transactions
  const monthExpenses = transactions.filter(t => t.type === 'expense' && t.date.startsWith(selectedMonth));
  const totalMonthExpense = monthExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Category breakdown
  const categoryStats = categories
    .map(cat => {
      const spent = monthExpenses
        .filter(t => t.categoryId === cat.id)
        .reduce((sum, t) => sum + t.amount, 0);
      const percentage = totalMonthExpense > 0 ? (spent / totalMonthExpense) * 100 : 0;
      return {
        category: cat,
        spent,
        percentage
      };
    })
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  // Top 5 highest single expenses
  const topExpenses = [...monthExpenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Compute 6-month historical cash flow
  const last6Months = React.useMemo(() => {
    const months: { month: string; label: string; income: number; expense: number }[] = [];
    let current = selectedMonth;
    for (let i = 0; i < 6; i++) {
      const inc = transactions
        .filter(t => t.type === 'income' && t.date.startsWith(current) && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0);
      const exp = transactions
        .filter(t => t.type === 'expense' && t.date.startsWith(current) && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0);

      const [y, m] = current.split('-').map(Number);
      const date = new Date(y, m - 1, 1);
      const label = date.toLocaleDateString('pt-BR', { month: 'short' });

      months.unshift({
        month: current,
        label: label.charAt(0).toUpperCase() + label.slice(1).replace('.', ''),
        income: inc,
        expense: exp
      });
      current = getPreviousMonth(current);
    }
    return months;
  }, [selectedMonth, transactions]);

  // Max value for scaling SVG bar charts
  const maxMonthValue = Math.max(
    ...last6Months.map(m => Math.max(m.income, m.expense)),
    1000
  );

  // Daily average calculation (days in month elapsed)
  const daysInCurrentMonth = 30;
  const dailyAverageExpense = totalMonthExpense / daysInCurrentMonth;

  // Donut chart SVG path calculations
  let accumulatedAngle = 0;
  const donutSlices = categoryStats.map((item, index) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = accumulatedAngle;
    accumulatedAngle += angle;

    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (accumulatedAngle - 90) * (Math.PI / 180);

    const x1 = 100 + 70 * Math.cos(startRad);
    const y1 = 100 + 70 * Math.sin(startRad);
    const x2 = 100 + 70 * Math.cos(endRad);
    const y2 = 100 + 70 * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;
    const path = `M 100 100 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      ...item,
      path,
      index
    };
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Relatórios & Inteligência Financeira
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Análise detalhada de gastos, evolução histórica e distribuição por categorias em {getMonthLabel(selectedMonth)}
        </p>
      </div>

      {/* 3 Executive Insight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Média Diária de Gastos</span>
            <span className="p-1 rounded bg-slate-800 text-slate-300">30 dias</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {formatCurrency(dailyAverageExpense, currency, hideValues)}
            <span className="text-xs text-slate-400 font-normal"> /dia</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Categoria Mais Relevante</span>
            <Award className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-base font-bold text-white truncate">
            {categoryStats.length > 0 ? categoryStats[0].category.name : 'Nenhuma'}
          </div>
          <div className="text-xs font-mono text-amber-400 mt-1">
            {categoryStats.length > 0 ? `${categoryStats[0].percentage.toFixed(1)}% das despesas totais` : '0%'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Taxa de Poupança</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {summary.savingsRate}%
          </div>
          <div className="text-xs text-slate-400 mt-1">
            do total das receitas guardadas
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Category Distribution (SVG Donut) */}
        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>Distribuição por Categoria</span>
            </h3>
            <span className="text-xs font-mono font-bold text-slate-200">
              Total: {formatCurrency(totalMonthExpense, currency, hideValues)}
            </span>
          </div>

          {categoryStats.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              Nenhuma despesa registrada neste mês.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
              {/* SVG Donut */}
              <div className="relative w-48 h-48 shrink-0">
                <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                  {donutSlices.map((slice) => (
                    <path
                      key={slice.category.id}
                      d={slice.path}
                      fill={slice.category.color}
                      className="transition-opacity duration-200 cursor-pointer hover:opacity-85"
                      opacity={activeCategoryIndex === null || activeCategoryIndex === slice.index ? 1 : 0.4}
                      onMouseEnter={() => setActiveCategoryIndex(slice.index)}
                      onMouseLeave={() => setActiveCategoryIndex(null)}
                    />
                  ))}
                  {/* Inner Cutout Hole */}
                  <circle cx="100" cy="100" r="45" fill="#0e1422" />
                </svg>
                {/* Center text in donut hole */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Total</span>
                  <span className="text-xs font-bold font-mono text-white">
                    {formatCurrency(totalMonthExpense, currency, hideValues)}
                  </span>
                </div>
              </div>

              {/* Legend List */}
              <div className="w-full space-y-2 max-h-52 overflow-y-auto pr-1">
                {categoryStats.map((item, index) => (
                  <div
                    key={item.category.id}
                    onMouseEnter={() => setActiveCategoryIndex(index)}
                    onMouseLeave={() => setActiveCategoryIndex(null)}
                    className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      activeCategoryIndex === index ? 'bg-slate-800' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.category.color }}
                      />
                      <span className="text-slate-200 truncate max-w-[120px]">{item.category.name}</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-slate-300 font-medium">
                        {formatCurrency(item.spent, currency, hideValues)}
                      </span>
                      <span className="text-slate-500 text-[10px] ml-1.5">
                        ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Historical 6-Month Cash Flow (SVG Bar Chart) */}
        <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span>Evolução de Fluxo (Últimos 6 Meses)</span>
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                Receitas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" />
                Despesas
              </span>
            </div>
          </div>

          <div className="pt-4">
            <div className="h-48 flex items-end justify-between gap-3 px-2 border-b border-slate-800 pb-2">
              {last6Months.map((item) => {
                const incomeHeight = maxMonthValue > 0 ? (item.income / maxMonthValue) * 100 : 0;
                const expenseHeight = maxMonthValue > 0 ? (item.expense / maxMonthValue) * 100 : 0;

                return (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1.5 h-full">
                      {/* Income Bar */}
                      <div
                        className="w-1/2 max-w-[20px] bg-emerald-400/80 hover:bg-emerald-400 rounded-t transition-all"
                        style={{ height: `${Math.max(incomeHeight, 4)}%` }}
                        title={`Receita em ${item.label}: ${formatCurrency(item.income, currency, hideValues)}`}
                      />
                      {/* Expense Bar */}
                      <div
                        className="w-1/2 max-w-[20px] bg-rose-400/80 hover:bg-rose-400 rounded-t transition-all"
                        style={{ height: `${Math.max(expenseHeight, 4)}%` }}
                        title={`Despesa em ${item.label}: ${formatCurrency(item.expense, currency, hideValues)}`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase mt-2">
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Single Expenses of the Month */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
        <h3 className="text-sm font-bold text-white mb-3">
          Maiores Gastos do Mês
        </h3>
        {topExpenses.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Nenhuma despesa para exibir.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {topExpenses.map((tx, idx) => {
              const cat = categories.find(c => c.id === tx.categoryId);
              return (
                <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-500 font-bold w-4">{idx + 1}</span>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cat?.color || '#64748b'}20` }}
                    >
                      <CategoryIcon name={cat?.icon || 'FileText'} color={cat?.color} className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-200 block">{tx.description}</span>
                      <span className="text-[10px] text-slate-400">{cat?.name || 'Geral'}</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-rose-400">
                    {formatCurrency(tx.amount, currency, hideValues)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
