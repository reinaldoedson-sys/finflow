import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { X } from 'lucide-react';

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId?: string;
  initialAmount?: number;
}

export const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  categoryId: initialCatId,
  initialAmount
}) => {
  const { categories, setBudget } = useFinance();
  const [categoryId, setCategoryId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [error, setError] = useState('');

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both');

  useEffect(() => {
    if (initialCatId) {
      setCategoryId(initialCatId);
    } else if (expenseCategories.length > 0) {
      setCategoryId(expenseCategories[0].id);
    }
    setAmountStr(initialAmount ? String(initialAmount) : '');
    setError('');
  }, [initialCatId, initialAmount, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(amountStr.replace(',', '.'));

    if (!categoryId) {
      setError('Selecione uma categoria.');
      return;
    }

    if (isNaN(limit) || limit <= 0) {
      setError('Informe um teto de gastos válido maior que zero.');
      return;
    }

    setBudget(categoryId, limit);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-sm bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Definir Orçamento Mensal
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
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
              Categoria de Despesa
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {expenseCategories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Limite Mensal (Teto)
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
                placeholder="1500,00"
                autoFocus
                className="w-full pl-11 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-lg font-bold font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Você receberá avisos visuais se os gastos ultrapassarem 80% ou 100% deste limite.
            </p>
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
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all"
            >
              Salvar Limite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
