import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Account, CreditCard } from '../types/finance';
import { X, Building2, CreditCard as CardIcon } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  editAccount?: Account | null;
  editCreditCard?: CreditCard | null;
  initialMode?: 'account' | 'creditCard';
}

const PRESET_COLORS = [
  '#820ad1', // Nubank purple
  '#ea580c', // Itaú orange
  '#dc2626', // Santander red
  '#2563eb', // Caixa / BB blue
  '#10b981', // Emerald green
  '#0f172a', // Slate black
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
];

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  editAccount,
  editCreditCard,
  initialMode = 'account'
}) => {
  const { addAccount, updateAccount, addCreditCard, updateCreditCard } = useFinance();

  const [mode, setMode] = useState<'account' | 'creditCard'>(initialMode);
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [type, setType] = useState<Account['type']>('checking');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [initialBalanceStr, setInitialBalanceStr] = useState('');
  const [limitStr, setLimitStr] = useState('');
  const [closingDay, setClosingDay] = useState(25);
  const [dueDay, setDueDay] = useState(2);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editCreditCard) {
      setMode('creditCard');
      setName(editCreditCard.name);
      setBankName(editCreditCard.bankName);
      setColor(editCreditCard.color);
      setLimitStr(String(editCreditCard.limit));
      setClosingDay(editCreditCard.closingDay);
      setDueDay(editCreditCard.dueDay);
    } else if (editAccount) {
      setMode('account');
      setName(editAccount.name);
      setBankName(editAccount.bankName);
      setType(editAccount.type);
      setColor(editAccount.color);
      setInitialBalanceStr(String(editAccount.initialBalance));
    } else {
      setMode(initialMode);
      setName('');
      setBankName('');
      setType('checking');
      setColor(PRESET_COLORS[0]);
      setInitialBalanceStr('');
      setLimitStr('');
      setClosingDay(25);
      setDueDay(2);
    }
    setError('');
  }, [editAccount, editCreditCard, initialMode, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Por favor, digite o nome da conta ou cartão.');
      return;
    }

    if (mode === 'account') {
      const balance = parseFloat(initialBalanceStr.replace(',', '.')) || 0;
      if (editAccount) {
        updateAccount(editAccount.id, {
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          type,
          color,
          initialBalance: balance
        });
      } else {
        addAccount({
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          type,
          color,
          initialBalance: balance,
          icon: type === 'cash' ? 'Coins' : type === 'investment' ? 'LineChart' : 'Building2'
        });
      }
    } else {
      const limit = parseFloat(limitStr.replace(',', '.')) || 0;
      if (limit <= 0) {
        setError('Por favor, informe o limite do cartão.');
        return;
      }

      if (editCreditCard) {
        updateCreditCard(editCreditCard.id, {
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          color,
          limit,
          closingDay,
          dueDay
        });
      } else {
        addCreditCard({
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          color,
          limit,
          closingDay,
          dueDay
        });
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <h3 className="text-base font-bold text-white tracking-tight">
            {editCreditCard ? 'Editar Cartão' : editAccount ? 'Editar Conta' : 'Nova Conta / Cartão'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode selector if creating new */}
        {!editAccount && !editCreditCard && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl mb-5 border border-slate-800">
            <button
              type="button"
              onClick={() => setMode('account')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'account'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Conta Bancária</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('creditCard')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'creditCard'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CardIcon className="w-3.5 h-3.5" />
              <span>Cartão de Crédito</span>
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Nome de Identificação
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'account' ? 'Ex: Nubank Principal, Itaú Salário...' : 'Ex: Nubank Ultravioleta, Black...'}
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Instituição / Banco
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Ex: Nubank, Itaú, XP, Inter..."
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {mode === 'account' ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Tipo de Conta
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as Account['type'])}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="checking">Conta Corrente</option>
                  <option value="savings">Poupança / Reserva</option>
                  <option value="investment">Investimentos / Corretora</option>
                  <option value="cash">Dinheiro em Espécie</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Saldo Inicial
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={initialBalanceStr}
                    onChange={(e) => setInitialBalanceStr(e.target.value)}
                    placeholder="0,00"
                    className="w-full pl-10 pr-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Limite Total do Cartão
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={limitStr}
                    onChange={(e) => setLimitStr(e.target.value)}
                    placeholder="10000,00"
                    className="w-full pl-10 pr-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Dia Fechamento
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={closingDay}
                    onChange={(e) => setClosingDay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Dia Vencimento
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Color tag */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Cor do Card
            </label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
