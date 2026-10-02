import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { FinancialGoal } from '../types/finance';
import { X, PlusCircle, MinusCircle } from 'lucide-react';
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
  const { addGoalDeposit } = useFinance();
  const [amountStr, setAmountStr] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [error, setError] = useState('');

  if (!isOpen || !goal) return null;

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

    addGoalDeposit(goal.id, delta);

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
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              {mode === 'deposit' ? 'Aporte na Meta' : 'Resgate da Meta'}
            </h3>
            <p className="text-xs text-slate-400 truncate max-w-[240px]">{goal.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl mb-4 border border-slate-800">
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
          <div className="mb-3 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
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
        </form>
      </div>
    </div>
  );
};
