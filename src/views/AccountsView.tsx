import React from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { Account, CreditCard } from '../types/finance';
import { formatCurrency, calculatePercentage } from '../utils/currency';
import { 
  Building2, 
  CreditCard as CardIcon, 
  Plus, 
  Edit3, 
  Trash2, 
  Wallet, 
  LineChart, 
  Coins, 
  Calendar,
  AlertCircle
} from 'lucide-react';

interface AccountsViewProps {
  onOpenNewAccount: () => void;
  onOpenNewCreditCard: () => void;
  onEditAccount: (acc: Account) => void;
  onEditCreditCard: (card: CreditCard) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  onOpenNewAccount,
  onOpenNewCreditCard,
  onEditAccount,
  onEditCreditCard,
}) => {
  const { 
    accounts, 
    creditCards, 
    currency, 
    deleteAccount, 
    deleteCreditCard, 
    summary 
  } = useFinance();
  const { hideValues } = useSecurity();

  // Split account types
  const checkingTotal = accounts
    .filter(a => a.type === 'checking' || a.type === 'cash')
    .reduce((sum, a) => sum + a.currentBalance, 0);

  const investmentTotal = accounts
    .filter(a => a.type === 'investment' || a.type === 'savings')
    .reduce((sum, a) => sum + a.currentBalance, 0);

  return (
    <div className="space-y-6">
      {/* Consolidated Balance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Liquidez Imediata (Corrente & Espécie)</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {formatCurrency(checkingTotal, currency, hideValues)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <LineChart className="w-3.5 h-3.5 text-blue-400" />
            <span>Reservas & Investimentos</span>
          </div>
          <div className="text-xl font-bold font-mono text-blue-400">
            {formatCurrency(investmentTotal, currency, hideValues)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <CardIcon className="w-3.5 h-3.5 text-purple-400" />
            <span>Faturas de Cartão em Aberto</span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-400">
            {formatCurrency(summary.totalCreditCardDebt, currency, hideValues)}
          </div>
        </div>
      </div>

      {/* Bank Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Contas & Carteiras
            </h2>
            <p className="text-xs text-slate-400">Saldos atuais calculados automaticamente a partir dos lançamentos</p>
          </div>
          <button
            onClick={onOpenNewAccount}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Conta</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div
              key={acc.id}
              className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${acc.color}25`, color: acc.color }}
                  >
                    {acc.type === 'investment' ? (
                      <LineChart className="w-4 h-4" />
                    ) : acc.type === 'cash' ? (
                      <Coins className="w-4 h-4" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                      {acc.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">{acc.bankName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEditAccount(acc)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteAccount(acc.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-baseline justify-between">
                <span className="text-[11px] text-slate-400">Saldo Atual:</span>
                <span className="text-lg font-bold font-mono text-white">
                  {formatCurrency(acc.currentBalance, currency, hideValues)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Credit Cards Section */}
      <div className="space-y-4 pt-4 border-t border-slate-800/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Cartões de Crédito
            </h2>
            <p className="text-xs text-slate-400">Controle de faturas, limites e datas de fechamento/vencimento</p>
          </div>
          <button
            onClick={onOpenNewCreditCard}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Cartão</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {creditCards.map(card => {
            const usagePercent = calculatePercentage(card.currentInvoice, card.limit);
            const availableLimit = Math.max(0, card.limit - card.currentInvoice);

            return (
              <div
                key={card.id}
                className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: card.color }}
                    >
                      <CardIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{card.name}</h3>
                      <p className="text-xs text-slate-400">{card.bankName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEditCreditCard(card)}
                      className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteCreditCard(card.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                      Fatura Atual
                    </span>
                    <span className="text-base font-bold font-mono text-rose-400">
                      {formatCurrency(card.currentInvoice, currency, hideValues)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                      Limite Disponível
                    </span>
                    <span className="text-base font-bold font-mono text-slate-200">
                      {formatCurrency(availableLimit, currency, hideValues)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Uso do limite</span>
                    <span className="font-mono text-slate-200">{usagePercent}% de {formatCurrency(card.limit, currency, hideValues)}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        usagePercent > 80 ? 'bg-rose-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 font-mono">
                  <span>Fecha dia {card.closingDay}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-purple-400">Vencimento dia {card.dueDay}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
