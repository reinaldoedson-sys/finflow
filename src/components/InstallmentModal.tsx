import React, { useState, useMemo, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { PaymentMethod } from '../types/finance';
import { formatCurrency } from '../utils/currency';
import { 
  X, 
  Calendar, 
  CreditCard as CardIcon, 
  ArrowDownRight, 
  ArrowUpRight, 
  Calculator, 
  AlertCircle,
  Sparkles,
  Layers,
  Plus,
  Coins,
  Check
} from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';

interface InstallmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CalculationMode = 'by_installment' | 'by_total';

export const InstallmentModal: React.FC<InstallmentModalProps> = ({ isOpen, onClose }) => {
  const { categories, accounts, creditCards, addInstallmentPlan, addAccount, currency } = useFinance();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [calcMode, setCalcMode] = useState<CalculationMode>('by_installment');
  const [description, setDescription] = useState('');
  const [installmentAmountStr, setInstallmentAmountStr] = useState('');
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState<number>(10);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [creditCardId, setCreditCardId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit_card');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');

  // Inline quick account creation if user has no accounts
  const [showQuickAccount, setShowQuickAccount] = useState(false);
  const [quickAccountName, setQuickAccountName] = useState('Conta Corrente');
  const [quickAccountBank, setQuickAccountBank] = useState('Meu Banco');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Helper for numeric parsing (supports Brazilian 150,50 and international 150.50 and 1.500,50)
  const parseNum = (val: string): number => {
    if (!val) return 0;
    const trimmed = val.trim();
    if (trimmed.includes('.') && trimmed.includes(',')) {
      // e.g. 1.500,50 -> 1500.50
      return parseFloat(trimmed.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (trimmed.includes(',')) {
      // e.g. 150,50 -> 150.50
      return parseFloat(trimmed.replace(',', '.')) || 0;
    }
    return parseFloat(trimmed) || 0;
  };

  const formatNum = (num: number): string => {
    if (num <= 0) return '';
    return num.toFixed(2).replace('.', ',');
  };

  // Initial defaults
  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setInstallmentAmountStr('');
      setTotalAmountStr('');
      setInstallmentsCount(10);
      setCalcMode('by_installment');
      setStartDate(new Date().toISOString().split('T')[0]);
      setError('');
      setShowQuickAccount(false);

      if (creditCards.length > 0) {
        setCreditCardId(creditCards[0].id);
        setPaymentMethod('credit_card');
      } else {
        setPaymentMethod('bank_slip');
      }

      if (accounts.length > 0) {
        setAccountId(accounts[0].id);
      } else {
        setAccountId('');
      }

      const defaultCat = categories.find(c => c.type === 'expense' || c.type === 'both');
      if (defaultCat) setCategoryId(defaultCat.id);
    }
  }, [isOpen, creditCards, accounts, categories]);

  // Derived effective values
  const parsedInstallment = parseNum(installmentAmountStr);
  const parsedTotal = parseNum(totalAmountStr);

  const effectiveTotal = useMemo(() => {
    if (calcMode === 'by_installment') {
      return parsedInstallment > 0 && installmentsCount > 0
        ? Math.round(parsedInstallment * installmentsCount * 100) / 100
        : parsedTotal;
    } else {
      return parsedTotal > 0
        ? parsedTotal
        : (parsedInstallment > 0 && installmentsCount > 0
            ? Math.round(parsedInstallment * installmentsCount * 100) / 100
            : 0);
    }
  }, [calcMode, parsedInstallment, parsedTotal, installmentsCount]);

  const effectiveInstallment = useMemo(() => {
    if (calcMode === 'by_installment') {
      return parsedInstallment > 0
        ? parsedInstallment
        : (effectiveTotal > 0 && installmentsCount > 0
            ? Math.round((effectiveTotal / installmentsCount) * 100) / 100
            : 0);
    } else {
      return installmentsCount > 0 && effectiveTotal > 0
        ? Math.round((effectiveTotal / installmentsCount) * 100) / 100
        : parsedInstallment;
    }
  }, [calcMode, parsedInstallment, effectiveTotal, installmentsCount]);

  // Two-way handlers
  const handleInstallmentChange = (val: string) => {
    setInstallmentAmountStr(val);
    const inst = parseNum(val);
    if (inst > 0 && installmentsCount > 0) {
      const tot = Math.round(inst * installmentsCount * 100) / 100;
      setTotalAmountStr(formatNum(tot));
    } else if (!val) {
      setTotalAmountStr('');
    }
  };

  const handleTotalChange = (val: string) => {
    setTotalAmountStr(val);
    const tot = parseNum(val);
    if (tot > 0 && installmentsCount > 0) {
      const inst = Math.round((tot / installmentsCount) * 100) / 100;
      setInstallmentAmountStr(formatNum(inst));
    } else if (!val) {
      setInstallmentAmountStr('');
    }
  };

  const handleCountChange = (count: number) => {
    const validCount = Math.max(2, Math.min(120, count || 2));
    setInstallmentsCount(validCount);
    if (calcMode === 'by_installment') {
      const inst = parseNum(installmentAmountStr);
      if (inst > 0) {
        const tot = Math.round(inst * validCount * 100) / 100;
        setTotalAmountStr(formatNum(tot));
      }
    } else {
      const tot = parseNum(totalAmountStr);
      if (tot > 0) {
        const inst = Math.round((tot / validCount) * 100) / 100;
        setInstallmentAmountStr(formatNum(inst));
      }
    }
  };

  const handleSwitchMode = (mode: CalculationMode) => {
    setCalcMode(mode);
    if (mode === 'by_installment') {
      const tot = parseNum(totalAmountStr);
      if (tot > 0 && installmentsCount > 0) {
        const inst = Math.round((tot / installmentsCount) * 100) / 100;
        setInstallmentAmountStr(formatNum(inst));
      }
    } else {
      const inst = parseNum(installmentAmountStr);
      if (inst > 0 && installmentsCount > 0) {
        const tot = Math.round(inst * installmentsCount * 100) / 100;
        setTotalAmountStr(formatNum(tot));
      }
    }
  };

  // Generate preview of all installment dates
  const schedulePreview = useMemo(() => {
    if (!startDate || installmentsCount < 2 || effectiveInstallment <= 0) return [];
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const dates: { number: number; date: string; amount: number }[] = [];

    for (let i = 0; i < installmentsCount; i++) {
      const d = new Date(startYear, (startMonth - 1) + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const maxDaysInMonth = new Date(year, d.getMonth() + 1, 0).getDate();
      const day = String(Math.min(startDay, maxDaysInMonth)).padStart(2, '0');
      dates.push({
        number: i + 1,
        date: `${day}/${month}/${year}`,
        amount: effectiveInstallment
      });
    }

    return dates;
  }, [startDate, installmentsCount, effectiveInstallment]);

  const handleCreateQuickAccount = async () => {
    if (!quickAccountName.trim()) return;
    setIsCreatingAccount(true);
    try {
      await addAccount({
        name: quickAccountName.trim(),
        bankName: quickAccountBank.trim() || 'Banco',
        type: 'checking',
        color: '#10b981',
        initialBalance: 0,
        icon: 'Wallet'
      });
      setShowQuickAccount(false);
    } catch (err) {
      console.error('Error creating quick account', err);
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      setError('Informe uma descrição para o parcelamento (ex: Notebook, Celular, Curso).');
      return;
    }

    if (effectiveTotal <= 0 || effectiveInstallment <= 0) {
      setError('Informe um valor de parcela ou valor total válido maior que zero.');
      return;
    }

    if (installmentsCount < 2) {
      setError('O parcelamento deve conter no mínimo 2 parcelas.');
      return;
    }

    let finalAccountId = accountId;
    if (!finalAccountId) {
      if (accounts.length > 0) {
        finalAccountId = accounts[0].id;
      } else {
        setError('Cadastre pelo menos uma conta bancária para vincular o débito das parcelas.');
        return;
      }
    }

    if (paymentMethod === 'credit_card' && !creditCardId && creditCards.length > 0) {
      setError('Selecione o cartão de crédito da compra.');
      return;
    }

    await addInstallmentPlan({
      description: description.trim(),
      totalAmount: effectiveTotal,
      installmentAmount: effectiveInstallment,
      totalInstallments: installmentsCount,
      type,
      categoryId: categoryId || 'cat-compras',
      accountId: finalAccountId,
      creditCardId: paymentMethod === 'credit_card' ? creditCardId : undefined,
      paymentMethod,
      startDate
    });

    onClose();
  };

  const presetCounts = [2, 3, 4, 5, 6, 8, 10, 12, 18, 24, 36, 48];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Novo Parcelamento
              </h3>
              <p className="text-[11px] text-slate-400">
                Informe o valor da parcela ou o total e gere as parcelas automáticas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type toggle: Despesa vs Receita */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/90 rounded-xl mb-4 border border-slate-800">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              type === 'expense'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
            <span>Compra Parcelada (Despesa)</span>
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              type === 'income'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>Venda Parcelada (Receita)</span>
          </button>
        </div>

        {/* Calculation mode selector */}
        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 mb-4 space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Como deseja definir os valores?
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSwitchMode('by_installment')}
              className={`p-2 rounded-lg text-left border transition-all ${
                calcMode === 'by_installment'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                <span>Valor da Parcela</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Ex: 10x de R$ 99,90 (calcula o total)
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode('by_total')}
              className={`p-2 rounded-lg text-left border transition-all ${
                calcMode === 'by_total'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Valor Total</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Ex: R$ 999,00 em 10x (divide o valor)
              </p>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Descrição da Compra / Bem
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: iPhone 16 Pro, Geladeira Brastemp, Curso de Pós..."
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Amount Inputs depending on active mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Field 1: Valor da Parcela */}
            <div className={calcMode === 'by_installment' ? 'order-1' : 'order-2'}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Valor de Cada Parcela</span>
                  {calcMode === 'by_installment' && (
                    <span className="text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-400 rounded font-mono">
                      Principal
                    </span>
                  )}
                </label>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={installmentAmountStr}
                  onChange={(e) => handleInstallmentChange(e.target.value)}
                  placeholder="89,90"
                  className={`w-full pl-9 pr-3 py-2 bg-slate-900 border rounded-xl text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-500 ${
                    calcMode === 'by_installment' ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800'
                  }`}
                />
              </div>
            </div>

            {/* Field 2: Quantidade de Parcelas */}
            <div className="order-2 sm:order-2">
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Quantidade de Parcelas
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="2"
                  max="120"
                  value={installmentsCount}
                  onChange={(e) => handleCountChange(parseInt(e.target.value) || 2)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">
                  vezes
                </span>
              </div>
            </div>

            {/* Field 3: Valor Total da Compra */}
            <div className={`sm:col-span-2 ${calcMode === 'by_total' ? 'order-1' : 'order-3'}`}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <span>Valor Total da Compra</span>
                  {calcMode === 'by_total' && (
                    <span className="text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-400 rounded font-mono">
                      Principal
                    </span>
                  )}
                </label>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalAmountStr}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  placeholder="899,00"
                  className={`w-full pl-10 pr-3 py-2 bg-slate-900 border rounded-xl text-sm font-bold font-mono text-white focus:outline-none focus:border-emerald-500 ${
                    calcMode === 'by_total' ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-800'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Quick preset chips for installment count */}
          <div>
            <span className="text-[10px] text-slate-400 block mb-1">Escolha rápida de parcelas:</span>
            <div className="flex flex-wrap gap-1.5">
              {presetCounts.map((n) => {
                const isActive = installmentsCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleCountChange(n)}
                    className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-lg transition-all ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {n}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-time Calculation Summary Banner */}
          {effectiveTotal > 0 && effectiveInstallment > 0 && (
            <div className="space-y-2">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-slate-800/40 to-slate-800/40 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-emerald-400 font-semibold block">
                    Resumo do Parcelamento:
                  </span>
                  <div className="text-sm font-bold font-mono text-white mt-0.5">
                    <span className="text-emerald-300">{installmentsCount}x</span> de{' '}
                    <span className="text-emerald-300">{formatCurrency(effectiveInstallment, currency)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                    Total Final
                  </span>
                  <span className="text-sm font-bold font-mono text-white">
                    {formatCurrency(effectiveTotal, currency)}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <span>
                  <strong>Organização automática:</strong> Na aba <em>Transações</em>, apenas a parcela do mês vigente será exibida para manter seu extrato limpo.
                </span>
              </div>
            </div>
          )}

          {/* Category & Payment Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Categoria
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="credit_card">Cartão de Crédito</option>
                <option value="bank_slip">Boleto / Carnê</option>
                <option value="pix">Pix Parcelado</option>
                <option value="debit_card">Débito em Conta</option>
                <option value="transfer">Transferência / TED</option>
              </select>
            </div>
          </div>

          {/* Account and Credit Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Conta Bancária
                </label>
                {accounts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setShowQuickAccount(prev => !prev)}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    + Criar Conta
                  </button>
                )}
              </div>
              {accounts.length > 0 ? (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.bankName})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-300 text-xs">
                  <span>Nenhuma conta bancária cadastrada.</span>
                </div>
              )}
            </div>

            {paymentMethod === 'credit_card' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Cartão de Crédito
                </label>
                {creditCards.length > 0 ? (
                  <select
                    value={creditCardId}
                    onChange={(e) => setCreditCardId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {creditCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
                    <span>Sem cartões cadastrados.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick inline account creator if opened */}
          {showQuickAccount && accounts.length === 0 && (
            <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-2 text-xs">
              <span className="font-bold text-white block">Adicionar Conta Rápida:</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={quickAccountName}
                  onChange={(e) => setQuickAccountName(e.target.value)}
                  placeholder="Nome (Ex: Nubank)"
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                />
                <input
                  type="text"
                  value={quickAccountBank}
                  onChange={(e) => setQuickAccountBank(e.target.value)}
                  placeholder="Instituição (Ex: Nu)"
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateQuickAccount}
                disabled={isCreatingAccount || !quickAccountName.trim()}
                className="w-full py-1.5 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 transition-all disabled:opacity-50"
              >
                {isCreatingAccount ? 'Criando...' : 'Confirmar e Selecionar Conta'}
              </button>
            </div>
          )}

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Data da 1ª Parcela / Vencimento Inicial</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Schedule Preview */}
          {schedulePreview.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>Cronograma ({schedulePreview.length} parcelas)</span>
                <span className="font-mono text-emerald-400 lowercase">
                  término em {schedulePreview[schedulePreview.length - 1]?.date}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1 text-[11px]">
                {schedulePreview.map((item) => (
                  <div key={item.number} className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-800/60 flex items-center justify-between">
                    <span className="text-slate-400 font-mono">#{item.number} · {item.date}</span>
                    <span className="text-slate-200 font-mono font-medium">{formatCurrency(item.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
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
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm shadow-emerald-500/20 transition-all font-bold"
            >
              Criar Parcelamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
