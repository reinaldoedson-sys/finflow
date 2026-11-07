import React, { useState, useMemo } from 'react';
import { 
  PieChart as PieChartIcon, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingDown, 
  TrendingUp, 
  Inbox 
} from 'lucide-react';
import { Transaction, Category, Account, CreditCard, CurrencyCode } from '../../types/finance';
import { formatCurrency } from '../../utils/currency';
import { CategoryIcon } from '../CategoryIcon';
import { DonutChart, DonutSegment } from '../charts/DonutChart';
import { 
  computeCategoryBreakdown, 
  getTopTransactions, 
  CategoryBreakdownItem, 
  TopTransactionItem 
} from '../../domain/analytics';

interface CategoryBreakdownSectionProps {
  transactions: Transaction[];
  categories: Category[];
  accounts?: Account[];
  creditCards?: CreditCard[];
  year: number;
  month: number | null;
  currency?: CurrencyCode;
  hideValues?: boolean;
}

export const CategoryBreakdownSection: React.FC<CategoryBreakdownSectionProps> = ({
  transactions,
  categories,
  accounts = [],
  creditCards = [],
  year,
  month,
  currency,
  hideValues = false
}) => {
  // Alterna entre 'expense' (despesas) e 'income' (receitas)
  const [breakdownType, setBreakdownType] = useState<'expense' | 'income'>('expense');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Calcula os dados da distribuição
  const breakdownItems = useMemo<CategoryBreakdownItem[]>(() => {
    return computeCategoryBreakdown(transactions, year, month, breakdownType, categories);
  }, [transactions, year, month, breakdownType, categories]);

  // Calcula os maiores lançamentos individuais (Top 5)
  const topTransactions = useMemo<TopTransactionItem[]>(() => {
    return getTopTransactions(transactions, year, month, breakdownType, categories, 5);
  }, [transactions, year, month, breakdownType, categories]);

  // Mapeia para os segmentos do gráfico Donut
  const donutSegments = useMemo<DonutSegment[]>(() => {
    return breakdownItems.map(item => ({
      id: item.categoryId,
      label: item.name,
      value: item.amount,
      color: item.color,
      percentage: item.percentage,
      count: item.transactionCount,
    }));
  }, [breakdownItems]);

  // Helper para nome da conta ou cartão
  const getAccountOrCardName = (tx: TopTransactionItem) => {
    if (tx.creditCardId) {
      const card = creditCards.find(c => c.id === tx.creditCardId);
      if (card) return card.name;
    }
    if (tx.accountId) {
      const acc = accounts.find(a => a.id === tx.accountId);
      if (acc) return acc.name;
    }
    return null;
  };

  const isExpense = breakdownType === 'expense';

  return (
    <div className="space-y-4">
      {/* Cabeçalho da Seção com Seletor Despesas / Receitas */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-400" />
              <span>Detalhamento por Categorias</span>
              <span className="text-xs text-slate-400 font-normal">
                {isExpense ? '(Despesas)' : '(Receitas)'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isExpense
                ? 'Distribuição percentual e ranking das maiores despesas do período filtrado.'
                : 'Distribuição percentual e fontes de receita do período filtrado.'}
            </p>
          </div>

          {/* Alternador Despesas / Receitas */}
          <div 
            className="flex items-center p-0.5 rounded-lg bg-slate-950/80 border border-slate-800 self-start sm:self-auto shrink-0"
            role="group"
            aria-label="Tipo de detalhamento por categoria"
          >
            <button
              type="button"
              onClick={() => {
                setBreakdownType('expense');
                setSelectedCategoryId(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                breakdownType === 'expense'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>Despesas</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBreakdownType('income');
                setSelectedCategoryId(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                breakdownType === 'income'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Receitas</span>
            </button>
          </div>
        </div>

        {/* Se não houver dados no período */}
        {breakdownItems.length === 0 ? (
          <div className="py-12 px-4 text-center rounded-lg border border-dashed border-slate-800 bg-slate-950/30">
            <Inbox className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-300">
              Nenhuma {isExpense ? 'despesa' : 'receita'} registrada no período selecionado
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Alterne o mês ou o ano nos filtros acima para visualizar a distribuição histórica.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-2">
            {/* Coluna 1: Gráfico de Rosca SVG Interativo */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <DonutChart
                segments={donutSegments}
                currency={currency}
                hideValues={hideValues}
                activeSegmentId={selectedCategoryId}
                onSelectSegment={(id) => setSelectedCategoryId(id)}
                title={isExpense ? 'Total Gasto' : 'Total Recebido'}
                emptyLabel={isExpense ? 'Sem despesas' : 'Sem receitas'}
                ariaLabel={`Gráfico de rosca da distribuição de ${isExpense ? 'despesas' : 'receitas'} por categoria`}
              />
              <span className="text-[11px] text-slate-500 mt-2 text-center">
                Passe o cursor ou toque em uma fatia para ver os detalhes
              </span>
            </div>

            {/* Coluna 2: Ranking e Lista de Categorias */}
            <div className="lg:col-span-7 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider pb-1 border-b border-slate-800/80">
                <span>Categoria</span>
                <span>Valor / Participação</span>
              </div>

              <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
                {breakdownItems.map(item => {
                  const isSelected = selectedCategoryId === item.categoryId;
                  return (
                    <button
                      key={item.categoryId}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(prev => prev === item.categoryId ? null : item.categoryId);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/90 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-900/40 hover:bg-slate-800/50 border-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Ícone e Nome */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div 
                            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border"
                            style={{ 
                              backgroundColor: `${item.color}20`,
                              borderColor: `${item.color}40`,
                              color: item.color
                            }}
                          >
                            <CategoryIcon name={item.icon} className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-slate-200 block truncate">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {item.transactionCount} {item.transactionCount === 1 ? 'lançamento' : 'lançamentos'}
                            </span>
                          </div>
                        </div>

                        {/* Valor e Percentual */}
                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold font-mono text-slate-100 block">
                            {formatCurrency(item.amount, currency, hideValues)}
                          </span>
                          <span 
                            className="text-[11px] font-semibold font-mono inline-block px-1.5 py-0.2 rounded"
                            style={{
                              backgroundColor: `${item.color}15`,
                              color: item.color
                            }}
                          >
                            {item.percentage}%
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso Proporcional */}
                      <div className="w-full bg-slate-800/80 rounded-full h-1 mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(1, item.percentage))}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top 5 Maiores Gastos / Entradas Pontuais do Período */}
      {topTransactions.length > 0 && (
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${isExpense ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {isExpense ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  {isExpense ? 'Maiores despesas pontuais do período' : 'Maiores receitas pontuais do período'}
                </h3>
                <span className="text-[11px] text-slate-500">
                  Top {topTransactions.length} lançamentos individuais mais expressivos
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {topTransactions.map((tx, idx) => {
              const originName = getAccountOrCardName(tx);
              const formattedDate = tx.date ? tx.date.split('-').reverse().slice(0, 2).join('/') : '';

              return (
                <div
                  key={tx.id}
                  className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-slate-500 w-4 text-center shrink-0">
                      #{idx + 1}
                    </span>
                    <div 
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border"
                      style={{ 
                        backgroundColor: `${tx.categoryColor}15`,
                        borderColor: `${tx.categoryColor}30`,
                        color: tx.categoryColor
                      }}
                    >
                      <CategoryIcon name={tx.categoryIcon} className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-slate-200 block truncate" title={tx.description}>
                        {tx.description}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        <span>{formattedDate}</span>
                        {originName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[100px]">{originName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`text-xs font-bold font-mono ${isExpense ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isExpense ? '-' : '+'}{formatCurrency(tx.amount, currency, hideValues)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
