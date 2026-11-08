import React, { useState, useMemo } from 'react';
import { CreditCard, Account, Category, Transaction, CurrencyCode, PaymentMethod } from '../types/finance';
import { 
  InvoiceStatus,
  computeCardInvoices, 
  calculateDynamicLimit,
  buildInvoicePaymentTransaction 
} from '../domain/creditCardInvoices';
import { formatCurrency, formatDateShort } from '../utils/currency';
import { todayLocalISO } from '../utils/localDate';
import { triggerHaptic } from '../utils/haptics';
import { CategoryIcon } from './CategoryIcon';
import { 
  X, 
  CreditCard as CardIcon, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldCheck,
  Receipt
} from 'lucide-react';

interface CreditCardInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CreditCard | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  currency: CurrencyCode;
  hideValues: boolean;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
}

export const CreditCardInvoicesModal: React.FC<CreditCardInvoicesModalProps> = ({
  isOpen,
  onClose,
  card,
  accounts,
  categories,
  transactions,
  currency,
  hideValues,
  onAddTransaction,
  onUpdateTransaction
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<'all' | 'past' | 'current' | 'future'>('all');
  
  // Payment confirmation dialog state
  const [isPaying, setIsPaying] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [paymentDate, setPaymentDate] = useState<string>(todayLocalISO());
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Computations
  const invoices = useMemo(() => {
    if (!card) return [];
    return computeCardInvoices(card, transactions, todayLocalISO());
  }, [card, transactions]);

  const dynamicLimit = useMemo(() => {
    if (!card) return null;
    return calculateDynamicLimit(card, transactions, todayLocalISO());
  }, [card, transactions]);

  // Set default selected month to current month invoice
  const currentInvoiceMonth = useMemo(() => {
    const curr = invoices.find(inv => inv.isCurrent);
    return curr ? curr.month : (invoices[0]?.month || null);
  }, [invoices]);

  const activeMonth = selectedMonth || currentInvoiceMonth;

  const activeInvoice = useMemo(() => {
    return invoices.find(inv => inv.month === activeMonth) || invoices[0] || null;
  }, [invoices, activeMonth]);

  // Filtered invoice list according to selected tab
  const filteredInvoices = useMemo(() => {
    if (statusTab === 'past') return invoices.filter(inv => inv.isPast);
    if (statusTab === 'current') return invoices.filter(inv => inv.isCurrent);
    if (statusTab === 'future') return invoices.filter(inv => inv.isFuture);
    return invoices;
  }, [invoices, statusTab]);

  // Accounts with checking/cash for invoice payment
  const paymentAccounts = useMemo(() => {
    return accounts.filter(a => a.type === 'checking' || a.type === 'cash');
  }, [accounts]);

  // Initialize payment account if empty
  React.useEffect(() => {
    if (paymentAccounts.length > 0 && !paymentAccountId) {
      setPaymentAccountId(paymentAccounts[0].id);
    }
  }, [paymentAccounts, paymentAccountId]);

  if (!isOpen || !card) return null;

  const handleOpenPayment = () => {
    setIsPaying(true);
    setPaymentDate(todayLocalISO());
    if (paymentAccounts.length > 0 && !paymentAccountId) {
      setPaymentAccountId(paymentAccounts[0].id);
    }
    triggerHaptic('light');
  };

  const handleConfirmPayment = async () => {
    if (!activeInvoice || !paymentAccountId) return;
    setIsSubmittingPayment(true);
    try {
      // 1. Atualiza transações pendentes da fatura para completed
      const pendingTxs = activeInvoice.transactions.filter(t => t.status === 'pending');
      for (const tx of pendingTxs) {
        await onUpdateTransaction(tx.id, { status: 'completed' });
      }

      // 2. Cria a transação de despesa do pagamento da fatura debitando da conta bancária
      const paymentPayload = buildInvoicePaymentTransaction({
        card,
        invoice: activeInvoice,
        accountId: paymentAccountId,
        paymentMethod,
        paymentDate
      });

      await onAddTransaction(paymentPayload);
      triggerHaptic('success');
      setIsPaying(false);
    } catch (err) {
      console.error('Erro ao registrar pagamento de fatura:', err);
      triggerHaptic('error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const getStatusBadge = (status: InvoiceStatus, isPaid: boolean) => {
    if (isPaid) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          Paga
        </span>
      );
    }
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" />
            Aberta
          </span>
        );
      case 'closed_pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertCircle className="w-3 h-3" />
            Fechada
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Vencida
          </span>
        );
      case 'future':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Calendar className="w-3 h-3" />
            Prevista
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
              style={{ backgroundColor: card.color }}
            >
              <CardIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="invoice-modal-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Faturas & Limite · {card.name}
                </h2>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  ({card.bankName})
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Histórico detalhado, projeção de parcelas futuras e controle de pagamentos
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* 1. Limite Dinâmico Visual Bar */}
          {dynamicLimit && (
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Limite Dinâmico do Cartão
                    </span>
                    <span className="text-[11px] font-mono text-purple-400 font-semibold">
                      {dynamicLimit.consumedPercent}% consumido
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Compras à vista em aberto somadas às parcelas futuras já comprometem o limite contratado
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">Limite Total Contratado</span>
                  <span className="text-sm sm:text-base font-bold font-mono text-white">
                    {formatCurrency(dynamicLimit.cardLimit, currency, hideValues)}
                  </span>
                </div>
              </div>

              {/* Multi-segment Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full h-3 rounded-full bg-slate-800/90 overflow-hidden flex p-0.5">
                  {/* Segmento 1: Compras à vista / fatura atual */}
                  {dynamicLimit.oneOffPercent > 0 && (
                    <div 
                      className="h-full bg-rose-500 rounded-l-full transition-all duration-500"
                      style={{ width: `${dynamicLimit.oneOffPercent}%` }}
                      title={`Compras atuais: ${formatCurrency(dynamicLimit.pendingOneOffAmount, currency, hideValues)}`}
                    />
                  )}
                  {/* Segmento 2: Parcelas futuras comprometidas */}
                  {dynamicLimit.installmentsPercent > 0 && (
                    <div 
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${dynamicLimit.installmentsPercent}%` }}
                      title={`Parcelas futuras: ${formatCurrency(dynamicLimit.committedInstallmentsAmount, currency, hideValues)}`}
                    />
                  )}
                </div>

                {/* Sub-metrics Legend */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                    <div>
                      <span className="text-slate-400 block text-[11px]">Compras Fatura Atual:</span>
                      <strong className="font-mono text-rose-300 font-semibold">
                        {formatCurrency(dynamicLimit.pendingOneOffAmount, currency, hideValues)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <div>
                      <span className="text-slate-400 block text-[11px]">Parcelas Futuras:</span>
                      <strong className="font-mono text-amber-300 font-semibold">
                        {formatCurrency(dynamicLimit.committedInstallmentsAmount, currency, hideValues)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <div>
                      <span className="text-slate-400 block text-[11px]">Limite Livre Disponível:</span>
                      <strong className="font-mono text-emerald-400 font-semibold">
                        {formatCurrency(dynamicLimit.availableLimitAmount, currency, hideValues)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Status Filters Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80 overflow-x-auto text-xs">
            <button
              onClick={() => {
                setStatusTab('all');
                triggerHaptic('light');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                statusTab === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas as Faturas ({invoices.length})
            </button>
            <button
              onClick={() => {
                setStatusTab('current');
                triggerHaptic('light');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                statusTab === 'current'
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Fatura Atual Aberta
            </button>
            <button
              onClick={() => {
                setStatusTab('past');
                triggerHaptic('light');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                statusTab === 'past'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Anteriores Fechadas ({invoices.filter(i => i.isPast).length})
            </button>
            <button
              onClick={() => {
                setStatusTab('future');
                triggerHaptic('light');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                statusTab === 'future'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Futuras Previstas ({invoices.filter(i => i.isFuture).length})
            </button>
          </div>

          {/* 3. Invoices Carousel / Month Selector */}
          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
            {filteredInvoices.map((inv) => {
              const isSelected = inv.month === activeMonth;
              return (
                <button
                  key={inv.month}
                  onClick={() => {
                    setSelectedMonth(inv.month);
                    setIsPaying(false);
                    triggerHaptic('light');
                  }}
                  className={`min-w-[160px] p-3 rounded-xl border text-left transition-all shrink-0 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-purple-500/60 shadow-lg ring-1 ring-purple-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700/80 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-200">
                      {inv.monthLabel.split(' de ')[0]}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {inv.month.split('-')[0]}
                    </span>
                  </div>

                  <div className="my-1">
                    <span className="text-sm font-bold font-mono text-white block">
                      {formatCurrency(inv.totalAmount, currency, hideValues)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {inv.transactionsCount} {inv.transactionsCount === 1 ? 'item' : 'itens'}
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    {getStatusBadge(inv.status, inv.isPaid)}
                    <span className="text-[10px] font-mono text-slate-400">
                      {inv.dueDate.slice(8, 10)}/{inv.dueDate.slice(5, 7)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 4. Active Invoice Details & Actions */}
          {activeInvoice && (
            <div className="space-y-4">
              {/* Invoice Summary Card */}
              <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Fatura de {activeInvoice.monthLabel}
                      </h3>
                      {getStatusBadge(activeInvoice.status, activeInvoice.isPaid)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono">
                      <span>Fechamento: {formatDateShort(activeInvoice.closingDate)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-purple-400">Vencimento: {formatDateShort(activeInvoice.dueDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-left md:text-right">
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Total da Fatura</span>
                      <span className="text-2xl font-bold font-mono text-rose-400">
                        {formatCurrency(activeInvoice.totalAmount, currency, hideValues)}
                      </span>
                    </div>

                    {/* Pay Invoice Action Button */}
                    {!activeInvoice.isPaid && activeInvoice.totalAmount > 0 && !isPaying && (
                      <button
                        onClick={handleOpenPayment}
                        className="px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/10 transition-all flex items-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Marcar fatura como paga</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Payment Form (when user clicked 'Marcar fatura como paga') */}
                {isPaying && (
                  <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-3.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmar Pagamento de Fatura</span>
                      </div>
                      <button
                        onClick={() => setIsPaying(false)}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                          Conta de Débito:
                        </label>
                        <select
                          value={paymentAccountId}
                          onChange={(e) => setPaymentAccountId(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                        >
                          {paymentAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({formatCurrency(acc.currentBalance, currency, hideValues)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                          Método de Pagamento:
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="pix">PIX</option>
                          <option value="bank_slip">Boleto Bancário</option>
                          <option value="debit_card">Débito em Conta</option>
                          <option value="cash">Dinheiro em Espécie</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                          Data do Pagamento:
                        </label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <p className="text-[11px] text-slate-400">
                        Debitará <strong>{formatCurrency(activeInvoice.totalAmount, currency, hideValues)}</strong> da conta e marcará os lançamentos como pagos.
                      </p>
                      <button
                        onClick={handleConfirmPayment}
                        disabled={isSubmittingPayment}
                        className="px-4 py-2 rounded-lg font-semibold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        {isSubmittingPayment ? 'Registrando...' : 'Confirmar e Quitar Fatura'}
                      </button>
                    </div>
                  </div>
                )}

                {/* If Invoice is already paid */}
                {activeInvoice.isPaid && activeInvoice.paymentTransaction && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <div>
                        <p className="text-xs font-bold text-emerald-300">Fatura Paga com Sucesso</p>
                        <p className="text-[11px] text-slate-400">
                          {activeInvoice.paymentTransaction.description} · Pago em {formatDateShort(activeInvoice.paymentTransaction.date)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {formatCurrency(activeInvoice.paymentTransaction.amount, currency, hideValues)}
                    </span>
                  </div>
                )}

                {/* Breakdown summary metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block uppercase">À Vista no Mês</span>
                    <span className="text-xs sm:text-sm font-bold font-mono text-slate-200">
                      {formatCurrency(activeInvoice.oneOffAmount, currency, hideValues)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block uppercase">Parcelas no Mês</span>
                    <span className="text-xs sm:text-sm font-bold font-mono text-amber-300">
                      {formatCurrency(activeInvoice.installmentsAmount, currency, hideValues)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block uppercase">Quantidade Itens</span>
                    <span className="text-xs sm:text-sm font-bold font-mono text-slate-200">
                      {activeInvoice.transactionsCount}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block uppercase">Situação</span>
                    <span className="text-xs sm:text-sm font-bold text-purple-300">
                      {activeInvoice.statusLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Lançamentos da Fatura ({activeInvoice.transactions.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {activeInvoice.monthLabel}
                  </span>
                </div>

                {activeInvoice.transactions.length === 0 ? (
                  <div className="p-8 rounded-xl bg-slate-950/40 border border-slate-800/60 text-center space-y-2">
                    <Receipt className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-medium text-slate-300">
                      Nenhum lançamento registrado nesta fatura
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Compras realizadas com este cartão atribuídas a {activeInvoice.monthLabel} aparecerão listadas aqui.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60 rounded-xl bg-slate-950/60 border border-slate-800 overflow-hidden">
                    {activeInvoice.transactions.map((tx) => {
                      const category = categories.find(c => c.id === tx.categoryId);
                      const isInstallment = Boolean(tx.installmentPlanId || tx.installments || /\(\d+\/\d+\)/.test(tx.description));

                      return (
                        <div 
                          key={tx.id}
                          className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-slate-900/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ 
                                backgroundColor: `${category?.color || '#94a3b8'}20`,
                                color: category?.color || '#94a3b8'
                              }}
                            >
                              <CategoryIcon name={category?.icon || 'ShoppingBag'} className="w-4 h-4" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-100 truncate">
                                  {tx.description}
                                </span>
                                {isInstallment && tx.installments && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                                    {tx.installments.current}/{tx.installments.total}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                <span>{formatDateShort(tx.date)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{category?.name || 'Geral'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs sm:text-sm font-bold font-mono text-rose-400 block">
                              -{formatCurrency(tx.amount, currency, hideValues)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {tx.status === 'completed' ? 'Concluída' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Dados sincronizados com o banco local IndexedDB</span>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
