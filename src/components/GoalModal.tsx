import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { FinancialGoal } from '../types/finance';
import { X } from 'lucide-react';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  editGoal?: FinancialGoal | null;
}

export const GoalModal: React.FC<GoalModalProps> = ({
  isOpen,
  onClose,
  editGoal
}) => {
  const { addGoal, updateGoal } = useFinance();

  const [name, setName] = useState('');
  const [targetAmountStr, setTargetAmountStr] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#10b981');
  const [error, setError] = useState('');

  useEffect(() => {
    if (editGoal) {
      setName(editGoal.name);
      setTargetAmountStr(String(editGoal.targetAmount));
      setTargetDate(editGoal.targetDate);
      setNotes(editGoal.notes || '');
      setColor(editGoal.color || '#10b981');
    } else {
      setName('');
      setTargetAmountStr('');
      const defaultDate = new Date();
      defaultDate.setMonth(defaultDate.getMonth() + 6);
      setTargetDate(defaultDate.toISOString().split('T')[0]);
      setNotes('');
      setColor('#10b981');
    }
    setError('');
  }, [editGoal, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(targetAmountStr.replace(',', '.'));

    if (!name.trim()) {
      setError('Por favor, informe o nome do objetivo/meta.');
      return;
    }

    if (isNaN(target) || target <= 0) {
      setError('Informe um valor alvo válido.');
      return;
    }

    if (!targetDate) {
      setError('Informe a data estimada para atingir o objetivo.');
      return;
    }

    if (editGoal) {
      updateGoal(editGoal.id, {
        name: name.trim(),
        targetAmount: target,
        targetDate,
        color,
        notes: notes.trim() || undefined
      });
    } else {
      addGoal({
        name: name.trim(),
        targetAmount: target,
        targetDate,
        color,
        icon: 'Target',
        notes: notes.trim() || undefined
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <h3 className="text-base font-bold text-white tracking-tight">
            {editGoal ? 'Editar Meta Financeira' : 'Nova Meta / Cofrinho'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Nome da Meta
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Reserva de Emergência, Viagem Japão..."
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Valor Alvo (Objetivo)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={targetAmountStr}
                onChange={(e) => setTargetAmountStr(e.target.value)}
                placeholder="20000,00"
                className="w-full pl-10 pr-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Data Limite Prevista
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Observações ou Estratégia
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Guardar R$ 500 todos os meses no CDB 100%"
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all"
            >
              Salvar Meta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
