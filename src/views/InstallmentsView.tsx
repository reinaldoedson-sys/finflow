import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { InstallmentPlan, Transaction } from '../types/finance';
import { formatCurrency, calculatePercentage, formatDateShort } from '../utils/currency';
import { 
  CreditCard as CardIcon, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  TrendingDown, 
  AlertCircle,
  ShoppingBag,
  ArrowRight
} from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';

interface InstallmentsViewProps {
  onOpenNewInstallment: () => void;
}

export const InstallmentsView: React.FC<InstallmentsViewProps> = ({ onOpenNewInstallment }) => {
  const { 
    installmentPlans, 
    transactions, 
    categories, 
    accounts, 
    creditCards, 
    currency, 
    deleteInstallmentPlan,
    toggleTransactionStatus,
    selectedMonth 
  } = useFinance();
  const { hideValues } = useSecurity();

  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Compute analytics per plan
  const plansWithProgress = useMemo(() => {
    return installmentPlans.map(plan => {
      // Find all transactions linked to this plan
      const planTxs = transactions.filter(t => t.installmentPlanId === plan.id);
      
      const paidCount = planTxs.filter(t => t.status === 'completed').length;
      const totalCount = plan.totalInstallments;
      const progressPercent = calculatePercentage(paidCount, totalCount);

      const paidAmount = planTxs
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0);

      const remainingAmount = Math.max(0, plan.totalAmount - paidAmount);
      const remainingCount = Math.max(0, totalCount - paidCount);

      // Current month installment if any
      const monthTx = planTxs.find(t => t.date.startsWith(selectedMonth));

      // Calculate last installment date (approx or from tx)
      const sortedTxs = [...planTxs].sort((a, b) => a.date.localeCompare(b.date));
      const lastTx = sortedTxs[sortedTxs.length - 1];

      return {
        plan,
        transactions: sortedTxs,
        paidCount,
        totalCount,
        progressPercent,
        paidAmount,
        remainingAmount,
        remainingCount,
        monthTx,
        endDate: lastTx ? lastTx.date : plan.startDate,
        isCompleted: remainingCount === 0 && paidCount > 0
      };
    });
  }, [installmentPlans, transactions, selectedMonth]);

  // Global KPIs
  const totalRemainingDebt = plansWithProgress.reduce((sum, p) => sum + p.remainingAmount, 0);
  const totalCurrentMonthInstallments = plansWithProgress
    .filter(p => p.monthTx)
    .reduce((sum, p) => sum + (p.monthTx?.amount || 0), 0);
  const activePlansCount = plansWithProgress.filter(p => !p.isCompleted).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Primary Action */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Controle de Compras Futuras
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Gestão de Parcelamentos & Carnês
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Visualize suas compras parceladas no cartão de crédito, saldo devedor restante e estimativa de quitação
            </p>
          </div>

          <button
            onClick={onOpenNewInstallment}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center gap-1.5 self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Parcelamento</span>
          </button>
        </div>

        {/* 3 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Saldo Devedor Restante
            </span>
            <div className="text-xl font-bold font-mono text-rose-400">
              {formatCurrency(totalRemainingDebt, currency, hideValues)}
            </div>
            <span className="text-[11px] text-slate-500">Comprometido em compras parceladas</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Parcelas no Mês Atual
            </span>
            <div className="text-xl font-bold font-mono text-white">
              {formatCurrency(totalCurrentMonthInstallments, currency, hideValues)}
            </div>
            <span className="text-[11px] text-slate-500">Impacto na fatura deste mês</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Parcelamentos Ativos
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {activePlansCount} compras ativas
            </div>
            <span className="text-[11px] text-slate-500">Em processo de quitação mensal</span>
          </div>
        </div>
      </div>

      {/* Installment Plans List */}
      {plansWithProgress.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80">
          <CardIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-200 mb-1">Nenhum parcelamento cadastrado</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Cadastre compras parceladas no cartão de crédito ou boletos para planejar suas despesas dos próximos meses.
          </p>
          <button
            onClick={onOpenNewInstallment}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all"
          >
            Cadastrar primeiro parcelamento
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {plansWithProgress.map(({ plan, transactions: planTxs, paidCount, totalCount, progressPercent, paidAmount, remainingAmount, remainingCount, monthTx, endDate, isCompleted }) => {
            const cat = categories.find(c => c.id === plan.categoryId);
            const card = creditCards.find(c => c.id === plan.creditCardId);
            const acc = accounts.find(a => a.id === plan.accountId);
            const isExpanded = expandedPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all group"
              >
                {/* Plan Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cat?.color || '#3b82f6'}20`, color: cat?.color || '#3b82f6' }}
                    >
                      <CategoryIcon name={cat?.icon || 'ShoppingBag'} color={cat?.color} className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {plan.description}
                      </h3>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{cat?.name || 'Compras'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{card ? card.name : acc?.name || 'Conta'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Iniciado em {formatDateShort(plan.startDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-white">
                        {plan.totalInstallments}x de {formatCurrency(plan.installmentAmount, currency, hideValues)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Total: {formatCurrency(plan.totalAmount, currency, hideValues)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Ver todas as parcelas"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {confirmDeleteId === plan.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-950/40 border border-rose-500/30 p-1 rounded-lg text-xs">
                          <button
                            onClick={() => deleteInstallmentPlan(plan.id, true)}
                            className="px-2 py-0.5 font-bold text-rose-300 hover:text-white rounded bg-rose-600 hover:bg-rose-500"
                          >
                            Excluir Tudo
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 text-slate-400 hover:text-white"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(plan.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Excluir parcelamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Stats */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400">{progressPercent}% pago</span>
                      <span className="text-slate-400 text-[11px]">
                        ({paidCount} de {totalCount} parcelas pagas)
                      </span>
                    </div>

                    <div className="text-right text-[11px] font-mono text-slate-400">
                      {isCompleted ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Quitado com sucesso!
                        </span>
                      ) : (
                        <span>Resta {formatCurrency(remainingAmount, currency, hideValues)} ({remainingCount} parcelas)</span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted ? 'bg-gradient-to-r from-emerald-400 to-teal-300' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Footer status & next installment */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Previsão de término: <strong className="text-slate-300 font-mono">{formatDateShort(endDate)}</strong></span>
                  </div>

                  {monthTx && (
                    <div className="flex items-center gap-2">
                      <span>Parcela deste mês:</span>
                      <span className="font-mono font-bold text-white">{formatCurrency(monthTx.amount, currency, hideValues)}</span>
                      <button
                        onClick={() => toggleTransactionStatus(monthTx.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          monthTx.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-emerald-500/10 hover:text-emerald-300'
                        }`}
                      >
                        {monthTx.status === 'completed' ? 'Paga ✓' : 'Marcar como Paga'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Installments Schedule */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                      Detalhamento das Parcelas ({planTxs.length})
                    </span>
                    <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto pr-1">
                      {planTxs.map((tx, idx) => (
                        <div key={tx.id} className="py-2 flex items-center justify-between text-xs hover:bg-slate-800/30 px-2 rounded">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-slate-500 w-5 text-center">#{idx + 1}</span>
                            <span className="font-mono text-slate-300 text-[11px]">{formatDateShort(tx.date)}</span>
                            <span className="text-slate-200 truncate max-w-xs">{tx.description}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-white">
                              {formatCurrency(tx.amount, currency, hideValues)}
                            </span>
                            <button
                              onClick={() => toggleTransactionStatus(tx.id)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                tx.status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-emerald-500/10 hover:text-emerald-300'
                              }`}
                            >
                              {tx.status === 'completed' ? 'Paga ✓' : 'Pendente'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
