import React from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { FinancialGoal } from '../types/finance';
import { formatCurrency, calculatePercentage, formatDateShort } from '../utils/currency';
import { Plus, Target, CheckCircle2, Calendar, Edit3, Trash2, TrendingUp, Sparkles } from 'lucide-react';

interface GoalsViewProps {
  onOpenNewGoal: () => void;
  onEditGoal: (goal: FinancialGoal) => void;
  onOpenDepositModal: (goalId: string) => void;
}

export const GoalsView: React.FC<GoalsViewProps> = ({
  onOpenNewGoal,
  onEditGoal,
  onOpenDepositModal,
}) => {
  const { goals, currency, deleteGoal } = useFinance();
  const { hideValues } = useSecurity();

  const totalSavedInGoals = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTargetInGoals = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const overallGoalsPercent = totalTargetInGoals > 0 ? calculatePercentage(totalSavedInGoals, totalTargetInGoals) : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Objetivos & Sonhos
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Metas Financeiras & Cofrinhos
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Guarde dinheiro com propósito e acompanhe o progresso de cada conquista
            </p>
          </div>

          <button
            onClick={onOpenNewGoal}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center gap-1.5 self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Meta</span>
          </button>
        </div>

        {goals.length > 0 && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>
                Total acumulado nas metas:{' '}
                <strong className="text-white font-mono">{formatCurrency(totalSavedInGoals, currency, hideValues)}</strong>
                {' '}de {formatCurrency(totalTargetInGoals, currency, hideValues)}
              </span>
            </div>
            <div className="text-emerald-400 font-mono font-bold">
              {overallGoalsPercent}% do objetivo total
            </div>
          </div>
        )}
      </div>

      {/* Grid of Goals */}
      {goals.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80">
          <Target className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-200 mb-1">Nenhuma meta cadastrada</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Defina uma reserva de emergência, uma viagem de férias ou a compra de um bem para começar a poupar com clareza.
          </p>
          <button
            onClick={onOpenNewGoal}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all"
          >
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {goals.map((goal) => {
            const percent = calculatePercentage(goal.currentAmount, goal.targetAmount);
            const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
            const isCompleted = goal.currentAmount >= goal.targetAmount;

            return (
              <div
                key={goal.id}
                className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: goal.color }}
                      >
                        {isCompleted ? (
                          <Sparkles className="w-4 h-4" />
                        ) : (
                          <Target className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                          {goal.name}
                        </h3>
                        {goal.notes && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{goal.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEditGoal(goal)}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="my-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xl font-bold font-mono text-white">
                        {formatCurrency(goal.currentAmount, currency, hideValues)}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        Alvo: {formatCurrency(goal.targetAmount, currency, hideValues)}
                      </span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isCompleted ? 'bg-gradient-to-r from-emerald-400 to-teal-300' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="font-mono font-bold text-emerald-400">{percent}% atingido</span>
                      {isCompleted ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Conquistada!
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">
                          Falta {formatCurrency(remaining, currency, hideValues)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Meta: {formatDateShort(goal.targetDate)}</span>
                  </div>

                  <button
                    onClick={() => onOpenDepositModal(goal.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all"
                  >
                    + Aporte / Resgate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
