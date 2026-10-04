import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { FinancialGoal } from '../types/finance';
import { formatCurrency, formatDateShort } from '../utils/currency';
import { X, PlusCircle, MinusCircle, History, Trash2, Calendar, FileText } from 'lucide-react';
import confetti from 'canvas-confetti';

interface GoalDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: FinancialGoal | null;
}

export const GoalDepositModal: React.FC<GoalDepositModalProps> = ({
  isOpen,
  onClose,
  goal
}) => {
  const { addGoalDeposit, goalMovements, deleteGoalMovement, currency } = useFinance();
  const { hideValues } = useSecurity();
  const [amountStr, setAmountStr] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !goal) return null;

  const relevantMovements = goalMovements
    .filter(m => m.goalId === goal.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const initialBalance = typeof goal.initialAmount === 'number'
    ? goal.initialAmount
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amountStr.replace(',', '.'));

    if (isNaN(amount) || amount <= 0) {
      setError('Informe um valor válido.');
      return;
    }

    if (mode === 'withdraw' && amount > goal.currentAmount) {
      setError('Valor de resgate maior que o saldo acumulado na meta.');
      return;
    }

    const delta = mode === 'deposit' ? amount : -amount;
    const newTotal = goal.currentAmount + delta;

    addGoalDeposit(
      goal.id,
      delta,
      notes.trim() || (mode === 'deposit' ? 'Aporte na meta' : 'Resgate da meta'),
      date
    );

    // If goal reached 100% with this deposit, shoot confetti!
    if (newTotal >= goal.targetAmount && goal.currentAmount < goal.targetAmount) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {
        // ignore
      }
    }

    setAmountStr('');
    setNotes('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              {mode === 'deposit' ? 'Aporte na Meta' : 'Resgate da Meta'}
            </h3>
            <p className="text-xs text-slate-400 truncate max-w-[260px]">{goal.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-4 pr-1">
          {/* Saldo Atual & Inicial */}
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Saldo Atual</span>
              <span className="text-base font-bold font-mono text-emerald-400">
                {formatCurrency(goal.currentAmount, currency, hideValues)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">Saldo Inicial / Alvo</span>
              <span className="text-xs font-mono text-slate-400">
                {formatCurrency(initialBalance, currency, hideValues)} / {formatCurrency(goal.targetAmount, currency, hideValues)}
              </span>
            </div>
          </div>

          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setMode('deposit')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'deposit'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Guardar / Aporte</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('withdraw')}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'withdraw'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MinusCircle className="w-3.5 h-3.5" />
              <span>Resgatar</span>
            </button>
          </div>

          {error && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Valor do {mode === 'deposit' ? 'Aporte' : 'Resgate'}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="500,00"
                  autoFocus
                  className="w-full pl-11 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-lg font-bold font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span>Data</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-500" />
                  <span>Nota / Descrição (opcional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={mode === 'deposit' ? 'Ex: Sobra do décimo terceiro' : 'Ex: Pagamento imprevisto'}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowHistory(prev => !prev)}
                className="text-xs font-medium text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                <span>{showHistory ? 'Ocultar Histórico' : `Ver Histórico (${relevantMovements.length})`}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all ${
                    mode === 'deposit'
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                      : 'bg-rose-500 hover:bg-rose-400 text-white'
                  }`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </form>

          {/* Histórico do Ledger */}
          {showHistory && (
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                <span>Movimentações Registradas</span>
                <span>Saldo Inicial: {formatCurrency(initialBalance, currency, hideValues)}</span>
              </div>

              {relevantMovements.length === 0 ? (
                <div className="p-3 text-center rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                  Nenhum aporte ou resgate registrado ainda. Saldo atual provém do valor inicial.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
                  {relevantMovements.map((mov) => {
                    const isDep = mov.type === 'deposit';
                    return (
                      <div
                        key={mov.id}
                        className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${isDep ? 'bg-emerald-400' : 'bg-rose-400'}`}
                          />
                          <div>
                            <span className="font-semibold text-slate-200 block text-[11px]">
                              {mov.notes || (isDep ? 'Aporte na meta' : 'Resgate da meta')}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {formatDateShort(mov.date)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold ${isDep ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isDep ? '+' : '-'}{formatCurrency(mov.amount, currency, hideValues)}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteGoalMovement(mov.id)}
                            title="Excluir movimentação"
                            className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
