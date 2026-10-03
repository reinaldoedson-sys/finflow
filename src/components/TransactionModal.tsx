import React, { useState, useEffect, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Transaction, TransactionType, PaymentMethod } from '../types/finance';
import { formatCurrency } from '../utils/currency';
import { 
  X, 
  ArrowDownRight, 
  ArrowUpRight, 
  ArrowLeftRight, 
  Calendar, 
  Tag, 
  FileText, 
  Layers, 
  Coins, 
  Sparkles,
  Calculator 
} from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTransaction?: Transaction | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  editTransaction
}) => {
  const { 
    categories, 
    accounts, 
    creditCards, 
    addTransaction, 
    updateTransaction,
    addInstallmentPlan,
    currency,
    selectedMonth
  } = useFinance();

  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [creditCardId, setCreditCardId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [date, setDate] = useState<string>('');
  const [status, setStatus] = useState<'completed' | 'pending'>('completed');
  const [notes, setNotes] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Installment mode options for new transactions
  const [isInstallment, setIsInstallment] = useState<boolean>(false);
  const [installmentCalcMode, setInstallmentCalcMode] = useState<'by_installment' | 'by_total'>('by_installment');
  const [installmentAmountStr, setInstallmentAmountStr] = useState<string>('');
  const [installmentsCount, setInstallmentsCount] = useState<number>(10);

  // Helper for numeric parsing (Brazilian comma, dot, and thousand separators)
  const parseNum = (val: string): number => {
    if (!val) return 0;
    const trimmed = val.trim();
    if (trimmed.includes('.') && trimmed.includes(',')) {
      return parseFloat(trimmed.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (trimmed.includes(',')) {
      return parseFloat(trimmed.replace(',', '.')) || 0;
    }
    return parseFloat(trimmed) || 0;
  };

  const formatNum = (num: number): string => {
    if (num <= 0) return '';
    return num.toFixed(2).replace('.', ',');
  };

  useEffect(() => {
    if (editTransaction) {
      setType(editTransaction.type);
      setDescription(editTransaction.description);
      setAmountStr(String(editTransaction.amount));
      setCategoryId(editTransaction.categoryId || '');
      setAccountId(editTransaction.accountId || '');
      setTargetAccountId(editTransaction.targetAccountId || '');
      setCreditCardId(editTransaction.creditCardId || '');
      setPaymentMethod(editTransaction.paymentMethod || 'pix');
      setDate(editTransaction.date);
      setStatus(editTransaction.status);
      setNotes(editTransaction.notes || '');
      setTagsInput(editTransaction.tags ? editTransaction.tags.join(', ') : '');
      setIsRecurring(!!editTransaction.isRecurring);
      setIsInstallment(false);
    } else {
      // Default new transaction values
      setType('expense');
      setDescription('');
      setAmountStr('');
      setNotes('');
      setTagsInput('');
      setIsRecurring(false);
      setStatus('completed');
      setPaymentMethod('credit_card');
      setCreditCardId(creditCards[0]?.id || '');
      setIsInstallment(false);
      setInstallmentCalcMode('by_installment');
      setInstallmentAmountStr('');
      setInstallmentsCount(10);

      // Default date to today, or first of selected month if looking at another month
      const today = new Date().toISOString().split('T')[0];
      if (today.startsWith(selectedMonth)) {
        setDate(today);
      } else {
        setDate(`${selectedMonth}-01`);
      }

      if (accounts.length > 0) {
        setAccountId(accounts[0].id);
        if (accounts.length > 1) {
          setTargetAccountId(accounts[1].id);
        }
      }

      const defaultExpenseCat = categories.find(c => c.type === 'expense' || c.type === 'both');
      if (defaultExpenseCat) {
        setCategoryId(defaultExpenseCat.id);
      }
    }
    setError('');
  }, [editTransaction, isOpen, accounts, categories, creditCards, selectedMonth]);

  // Derived effective values for installment
  const parsedSingleAmount = parseNum(amountStr);
  const parsedInstallmentAmount = parseNum(installmentAmountStr);

  const effectiveTotal = useMemo(() => {
    if (!isInstallment) return parsedSingleAmount;
    if (installmentCalcMode === 'by_installment') {
      return parsedInstallmentAmount > 0 && installmentsCount > 0
        ? Math.round(parsedInstallmentAmount * installmentsCount * 100) / 100
        : parsedSingleAmount;
    } else {
      return parsedSingleAmount > 0
        ? parsedSingleAmount
        : Math.round(parsedInstallmentAmount * installmentsCount * 100) / 100;
    }
  }, [isInstallment, installmentCalcMode, parsedInstallmentAmount, parsedSingleAmount, installmentsCount]);

  const effectiveInstallment = useMemo(() => {
    if (!isInstallment) return 0;
    if (installmentCalcMode === 'by_installment') {
      return parsedInstallmentAmount > 0
        ? parsedInstallmentAmount
        : (effectiveTotal > 0 && installmentsCount > 0 ? Math.round((effectiveTotal / installmentsCount) * 100) / 100 : 0);
    } else {
      return installmentsCount > 0 && effectiveTotal > 0
        ? Math.round((effectiveTotal / installmentsCount) * 100) / 100
        : parsedInstallmentAmount;
    }
  }, [isInstallment, installmentCalcMode, parsedInstallmentAmount, effectiveTotal, installmentsCount]);

  const handleInstallmentValueChange = (val: string) => {
    setInstallmentAmountStr(val);
    const inst = parseNum(val);
    if (inst > 0 && installmentsCount > 0) {
      const tot = Math.round(inst * installmentsCount * 100) / 100;
      setAmountStr(formatNum(tot));
    } else if (!val) {
      setAmountStr('');
    }
  };

  const handleTotalAmountChange = (val: string) => {
    setAmountStr(val);
    if (isInstallment) {
      const tot = parseNum(val);
      if (tot > 0 && installmentsCount > 0) {
        const inst = Math.round((tot / installmentsCount) * 100) / 100;
        setInstallmentAmountStr(formatNum(inst));
      } else if (!val) {
        setInstallmentAmountStr('');
      }
    }
  };

  const handleInstallmentCountChange = (count: number) => {
    const valid = Math.max(2, Math.min(120, count || 2));
    setInstallmentsCount(valid);
    if (installmentCalcMode === 'by_installment') {
      const inst = parseNum(installmentAmountStr);
      if (inst > 0) {
        const tot = Math.round(inst * valid * 100) / 100;
        setAmountStr(formatNum(tot));
      }
    } else {
      const tot = parseNum(amountStr);
      if (tot > 0) {
        const inst = Math.round((tot / valid) * 100) / 100;
        setInstallmentAmountStr(formatNum(inst));
      }
    }
  };

  // Adjust category choices based on transaction type
  const filteredCategories = categories.filter(cat => {
    if (type === 'transfer') return false;
    return cat.type === type || cat.type === 'both';
  });

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType !== 'transfer') {
      const match = categories.find(c => c.type === newType || c.type === 'both');
      if (match) setCategoryId(match.id);
    }
    if (newType === 'income' && paymentMethod === 'credit_card') {
      setPaymentMethod('pix');
    }
  };

  const handleSetToday = () => {
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleSetYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setDate(yesterday.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      setError('Por favor, informe uma descrição para o lançamento.');
      return;
    }

    // Handle installment creation
    if (isInstallment && !editTransaction) {
      if (effectiveTotal <= 0 || effectiveInstallment <= 0) {
        setError('Informe um valor de parcela ou total válido maior que zero.');
        return;
      }
      if (installmentsCount < 2) {
        setError('O parcelamento deve conter no mínimo 2 parcelas.');
        return;
      }
      if (!accountId) {
        setError('Selecione uma conta bancária.');
        return;
      }
      if (paymentMethod === 'credit_card' && !creditCardId && creditCards.length > 0) {
        setError('Selecione o cartão de crédito.');
        return;
      }

      await addInstallmentPlan({
        description: description.trim(),
        totalAmount: effectiveTotal,
        installmentAmount: effectiveInstallment,
        totalInstallments: installmentsCount,
        type: type === 'income' ? 'income' : 'expense',
        categoryId: categoryId || 'cat-compras',
        accountId,
        creditCardId: paymentMethod === 'credit_card' ? creditCardId : undefined,
        paymentMethod,
        startDate: date || new Date().toISOString().split('T')[0]
      });

      onClose();
      return;
    }

    const parsedAmount = parseNum(amountStr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Por favor, insira um valor válido maior que zero.');
      return;
    }

    if (!accountId) {
      setError('Selecione uma conta.');
      return;
    }

    if (type === 'transfer' && (!targetAccountId || targetAccountId === accountId)) {
      setError('Selecione uma conta de destino diferente da conta de origem.');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(t => t.length > 0);

    const payload = {
      description: description.trim(),
      amount: Math.round(parsedAmount * 100) / 100,
      type,
      categoryId: type === 'transfer' ? 'cat-outros' : categoryId,
      accountId,
      targetAccountId: type === 'transfer' ? targetAccountId : undefined,
      creditCardId: paymentMethod === 'credit_card' ? creditCardId : undefined,
      paymentMethod,
      date,
      status,
      notes: notes.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      isRecurring
    };

    if (editTransaction) {
      updateTransaction(editTransaction.id, payload);
    } else {
      addTransaction(payload);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <h3 className="text-base font-bold text-white tracking-tight">
            {editTransaction ? 'Editar Transação' : 'Nova Transação'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transaction Type Segmented Control */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl mb-5 border border-slate-800/70">
          <button
            type="button"
            onClick={() => handleTypeChange('expense')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              type === 'expense'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
            <span>Despesa</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('income')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              type === 'income'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>Receita</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('transfer')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              type === 'transfer'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
            <span>Transferência</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Installment toggle for new expenses/incomes */}
          {!editTransaction && type !== 'transfer' && (
            <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Lançamento Parcelado</span>
                  <span className="text-[10px] text-slate-400">Defina o valor da parcela e a quantidade</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !isInstallment;
                  setIsInstallment(next);
                  if (next && creditCards.length > 0) {
                    setPaymentMethod('credit_card');
                  }
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all border ${
                  isInstallment
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:text-white'
                }`}
              >
                {isInstallment ? 'Parcelado: Ativo' : '+ Parcelar'}
              </button>
            </div>
          )}

          {/* If installment mode is active */}
          {isInstallment && !editTransaction ? (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-3">
              {/* Mode switch */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInstallmentCalcMode('by_installment')}
                  className={`p-2 rounded-lg text-left border transition-all ${
                    installmentCalcMode === 'by_installment'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Coins className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Valor da Parcela</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Ex: 10x de R$ 99,90
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setInstallmentCalcMode('by_total')}
                  className={`p-2 rounded-lg text-left border transition-all ${
                    installmentCalcMode === 'by_total'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Valor Total</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Ex: R$ 999,00 em 10x
                  </p>
                </button>
              </div>

              {/* Installment Amount and Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Field 1: Valor de Cada Parcela */}
                <div className={installmentCalcMode === 'by_installment' ? 'order-1' : 'order-2'}>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Valor de Cada Parcela
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={installmentAmountStr}
                      onChange={(e) => handleInstallmentValueChange(e.target.value)}
                      placeholder="150,00"
                      className={`w-full pl-9 pr-3 py-2 bg-slate-900 border rounded-xl text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-500 ${
                        installmentCalcMode === 'by_installment' ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800'
                      }`}
                    />
                  </div>
                </div>

                {/* Field 2: Quantidade de Parcelas */}
                <div className="order-2">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Quantidade de Parcelas
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="2"
                      max="120"
                      value={installmentsCount}
                      onChange={(e) => handleInstallmentCountChange(parseInt(e.target.value) || 2)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">
                      vezes
                    </span>
                  </div>
                </div>

                {/* Field 3: Valor Total */}
                <div className={`sm:col-span-2 ${installmentCalcMode === 'by_total' ? 'order-1' : 'order-3'}`}>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Valor Total da Compra
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amountStr}
                      onChange={(e) => handleTotalAmountChange(e.target.value)}
                      placeholder="1500,00"
                      className={`w-full pl-10 pr-3 py-2 bg-slate-900 border rounded-xl text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-500 ${
                        installmentCalcMode === 'by_total' ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Quick preset chips */}
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Escolha rápida de parcelas:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleInstallmentCountChange(n)}
                      className={`px-2 py-0.5 text-xs font-mono font-semibold rounded-md transition-all ${
                        installmentsCount === n
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary and clean transactions note */}
              {effectiveTotal > 0 && effectiveInstallment > 0 && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-semibold">Resumo:</span>
                    <span className="text-white font-mono font-bold">
                      {installmentsCount}x de {formatCurrency(effectiveInstallment, currency)} = Total {formatCurrency(effectiveTotal, currency)}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-400/90 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Apenas a parcela do mês vigente será exibida no extrato para não poluir sua lista.</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Standard single Amount input */
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Valor
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
                  placeholder="0,00"
                  autoFocus
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xl font-bold font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                />
              </div>
            </div>
          )}

          {/* Description input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado, Aluguel, Salário..."
              className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>

          {/* Category selection (not for transfer) */}
          {type !== 'transfer' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Categoria
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
              >
                {filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Account and Target Account Grid */}
          <div className={`grid ${type === 'transfer' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {type === 'transfer' ? 'Conta de Origem' : 'Conta'}
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.bankName})
                  </option>
                ))}
              </select>
            </div>

            {type === 'transfer' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Conta de Destino
                </label>
                <select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione...</option>
                  {accounts
                    .filter(a => a.id !== accountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.bankName})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Payment Method and Credit Card if expense */}
          {type === 'expense' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="pix">Pix</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="bank_slip">Boleto Bancário</option>
                  <option value="cash">Dinheiro em Espécie</option>
                  <option value="transfer">Transferência / TED</option>
                </select>
              </div>

              {paymentMethod === 'credit_card' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Cartão
                  </label>
                  <select
                    value={creditCardId}
                    onChange={(e) => setCreditCardId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione o cartão...</option>
                    {creditCards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Situação
                  </label>
                  <div className="flex items-center gap-2 pt-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        checked={status === 'completed'}
                        onChange={() => setStatus('completed')}
                        className="accent-emerald-500"
                      />
                      Pago
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        checked={status === 'pending'}
                        onChange={() => setStatus('pending')}
                        className="accent-amber-500"
                      />
                      Pendente
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Date with quick presets */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Data
              </label>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={handleSetToday}
                  className="text-emerald-400 hover:text-emerald-300 font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-[11px] transition-colors"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={handleSetYesterday}
                  className="text-slate-400 hover:text-slate-300 font-medium px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] transition-colors"
                >
                  Ontem
                </button>
              </div>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Tags and Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                Tags (separadas por vírgula)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Ex: viagem, mercado"
                className="w-full px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                Observações
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes ou lembretes"
                className="w-full px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Recurring switch */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isRecurring"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-500 border-slate-700 bg-slate-900"
            />
            <label htmlFor="isRecurring" className="text-xs text-slate-300 cursor-pointer select-none">
              Despesa/Receita fixa mensal (recorrente)
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm shadow-emerald-500/20 transition-all active:scale-95"
            >
              {editTransaction ? 'Salvar Alterações' : 'Salvar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
