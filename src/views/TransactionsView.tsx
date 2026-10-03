import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { Transaction, TransactionType } from '../types/finance';
import { formatCurrency, formatDateShort, getMonthLabel } from '../utils/currency';
import { 
  Search, 
  Filter, 
  Download, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowLeftRight,
  CheckCircle,
  Clock,
  Check,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';

interface TransactionsViewProps {
  onOpenNewTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  onOpenNewTransaction,
  onEditTransaction,
}) => {
  const { 
    transactions, 
    categories, 
    accounts, 
    creditCards, 
    currency, 
    deleteTransaction, 
    toggleTransactionStatus,
    addTransaction,
    selectedMonth
  } = useFinance();
  const { hideValues } = useSecurity();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [installmentFilter, setInstallmentFilter] = useState<'current_month' | 'all' | 'none'>('current_month');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Search text
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchDesc = t.description.toLowerCase().includes(query);
        const matchNotes = t.notes ? t.notes.toLowerCase().includes(query) : false;
        const matchTags = t.tags ? t.tags.some(tag => tag.toLowerCase().includes(query)) : false;
        if (!matchDesc && !matchNotes && !matchTags) return false;
      }

      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;

      // Category filter
      if (categoryFilter !== 'all' && t.categoryId !== categoryFilter) return false;

      // Account filter
      if (accountFilter !== 'all') {
        const matchAcc = t.accountId === accountFilter || t.targetAccountId === accountFilter;
        const matchCard = t.creditCardId === accountFilter;
        if (!matchAcc && !matchCard) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;

      // Installment filter: default is 'current_month' so future/past installments don't clutter the transactions view
      const isInstallment = !!(t.installmentPlanId || t.installments || /\(\d+\/\d+\)/.test(t.description));
      if (isInstallment) {
        if (installmentFilter === 'current_month') {
          if (!t.date.startsWith(selectedMonth)) return false;
        } else if (installmentFilter === 'none') {
          return false;
        }
      }

      return true;
    });
  }, [transactions, search, typeFilter, categoryFilter, accountFilter, statusFilter, installmentFilter, selectedMonth]);

  // Count installments hidden because they belong to other months
  const hiddenFutureInstallmentsCount = useMemo(() => {
    return transactions.filter(t => {
      const isInstallment = !!(t.installmentPlanId || t.installments || /\(\d+\/\d+\)/.test(t.description));
      return isInstallment && !t.date.startsWith(selectedMonth);
    }).length;
  }, [transactions, selectedMonth]);

  // Aggregate stats for filtered data
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'income') income += t.amount;
      if (t.type === 'expense') expense += t.amount;
    });
    return {
      count: filteredTransactions.length,
      income,
      expense,
      net: income - expense
    };
  }, [filteredTransactions]);

  const handleDuplicate = (tx: Transaction) => {
    const { id, createdAt, ...rest } = tx;
    addTransaction({
      ...rest,
      description: `${tx.description} (Cópia)`,
      date: new Date().toISOString().split('T')[0]
    });
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;

    const headers = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Status', 'Forma de Pagamento', 'Tags'];
    const rows = filteredTransactions.map(t => {
      const cat = categories.find(c => c.id === t.categoryId)?.name || '';
      const acc = accounts.find(a => a.id === t.accountId)?.name || '';
      return [
        t.date,
        t.type,
        `"${t.description.replace(/"/g, '""')}"`,
        `"${cat}"`,
        `"${acc}"`,
        t.amount.toFixed(2),
        t.status,
        t.paymentMethod,
        `"${(t.tags || []).join('; ')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finflow-transacoes-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Controls */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por descrição, observação ou tag..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredTransactions.length === 0}
              className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
            <button
              onClick={onOpenNewTransaction}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Novo Lançamento</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Filtros:</span>
          </div>

          {/* Type selector */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Todos os tipos</option>
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
            <option value="transfer">Transferências</option>
          </select>

          {/* Category selector */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Todas as categorias</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Account selector */}
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Todas as contas & cartões</option>
            <optgroup label="Contas">
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </optgroup>
            <optgroup label="Cartões de Crédito">
              {creditCards.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          </select>

          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Qualquer situação</option>
            <option value="completed">Concluídos / Pagos</option>
            <option value="pending">Pendentes / Agendados</option>
          </select>

          {/* Installment Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-md px-2 py-0.5">
            <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <select
              value={installmentFilter}
              onChange={(e) => setInstallmentFilter(e.target.value as any)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="current_month">Parcelas: Mês vigente (limpo)</option>
              <option value="all">Parcelas: Todas as parcelas</option>
              <option value="none">Ocultar parcelamentos</option>
            </select>
          </div>
        </div>

        {/* Filter Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <div>
            <span className="text-slate-500 text-[11px]">Lançamentos:</span>{' '}
            <span className="font-mono font-semibold text-slate-200">{stats.count}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px]">Entradas:</span>{' '}
            <span className="font-mono font-semibold text-emerald-400">+{formatCurrency(stats.income, currency, hideValues)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px]">Saídas:</span>{' '}
            <span className="font-mono font-semibold text-rose-400">-{formatCurrency(stats.expense, currency, hideValues)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px]">Saldo Líquido:</span>{' '}
            <span className={`font-mono font-semibold ${stats.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.net >= 0 ? '+' : ''}{formatCurrency(stats.net, currency, hideValues)}
            </span>
          </div>
        </div>
      </div>

      {/* Clean View Notification Banner */}
      {installmentFilter === 'current_month' && hiddenFutureInstallmentsCount > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              <strong>Visualização Limpa:</strong> Mostrando apenas as parcelas do mês vigente ({getMonthLabel(selectedMonth)}).
              <span className="text-slate-400 ml-1">
                ({hiddenFutureInstallmentsCount} parcela{hiddenFutureInstallmentsCount > 1 ? 's' : ''} de outros meses ocultada{hiddenFutureInstallmentsCount > 1 ? 's' : ''} para manter a listagem limpa).
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setInstallmentFilter('all')}
            className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 underline underline-offset-2 shrink-0 ml-2"
          >
            Exibir todas as parcelas
          </button>
        </div>
      )}

      {/* Transactions Table */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 overflow-hidden shadow-sm">
        {filteredTransactions.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            Nenhuma transação encontrada para os filtros selecionados.{' '}
            <button
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setCategoryFilter('all');
                setAccountFilter('all');
                setStatusFilter('all');
                setInstallmentFilter('current_month');
              }}
              className="text-emerald-400 underline font-medium ml-1"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-12 text-center">Status</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Conta / Cartão</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 w-24 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTransactions.map((tx) => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  const acc = accounts.find(a => a.id === tx.accountId);
                  const card = creditCards.find(c => c.id === tx.creditCardId);
                  const targetAcc = accounts.find(a => a.id === tx.targetAccountId);
                  const isIncome = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';
                  const isInstallmentTx = !!(tx.installmentPlanId || tx.installments || /\(\d+\/\d+\)/.test(tx.description));

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Checkbox toggle status */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleTransactionStatus(tx.id)}
                          title={tx.status === 'completed' ? 'Marcar como pendente' : 'Marcar como concluído'}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                            tx.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'border border-slate-700 hover:border-slate-500 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                        {formatDateShort(tx.date)}
                      </td>

                      {/* Description + Tags + Installment badge */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                            {tx.description}
                          </span>
                          {isInstallmentTx && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              <Layers className="w-3 h-3 text-purple-400" />
                              {tx.installments
                                ? `Parcela ${tx.installments.current}/${tx.installments.total}`
                                : 'Parcelado'}
                            </span>
                          )}
                        </div>
                        {tx.tags && tx.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                            {tx.tags.map((tag, i) => (
                              <span key={i} className="text-slate-400">#{tag}</span>
                            ))}
                          </div>
                        )}
                        {tx.notes && (
                          <div className="text-[10px] text-slate-400 italic truncate max-w-xs mt-0.5">
                            {tx.notes}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <CategoryIcon name={cat?.icon || 'FileText'} color={cat?.color} className="w-3.5 h-3.5" />
                          <span className="text-slate-300 text-xs">{cat?.name || 'Geral'}</span>
                        </div>
                      </td>

                      {/* Account */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-xs">
                        {isTransfer ? (
                          <span>{acc?.name} → {targetAcc?.name}</span>
                        ) : card ? (
                          <span className="text-purple-300">{card.name}</span>
                        ) : (
                          <span>{acc?.name || 'Conta'}</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-mono font-bold text-xs ${
                            isIncome
                              ? 'text-emerald-400'
                              : isTransfer
                              ? 'text-blue-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {isIncome ? '+' : isTransfer ? '' : '-'}
                          {formatCurrency(tx.amount, currency, hideValues)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {tx.status === 'completed' ? 'Concluído' : 'Pendente'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDuplicate(tx)}
                            title="Duplicar transação"
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onEditTransaction(tx)}
                            title="Editar transação"
                            className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            title="Excluir transação"
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
