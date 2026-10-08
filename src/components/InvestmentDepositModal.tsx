import React, { useState, useEffect, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { formatCurrency } from '../utils/currency';
import { calculateAportePosition } from '../domain/investments';
import { calculateTransactionTotal } from '../domain/investmentTransactions';
import { 
  X, 
  TrendingUp, 
  Wallet, 
  Calendar, 
  FileText, 
  DollarSign, 
  ArrowRight, 
  Sparkles, 
  AlertCircle,
  CheckCircle2,
  Coins,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface InvestmentDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAssetId?: string | null;
}

export const InvestmentDepositModal: React.FC<InvestmentDepositModalProps> = ({
  isOpen,
  onClose,
  initialAssetId
}) => {
  const { 
    investments, 
    accounts, 
    executeInvestmentAporte 
  } = useFinance();
  const { hideValues } = useSecurity();

  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [mode, setMode] = useState<'quantity' | 'total'>('quantity');
  const [quantityStr, setQuantityStr] = useState<string>('');
  const [priceStr, setPriceStr] = useState<string>('');
  const [totalAmountStr, setTotalAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [debitFromAccount, setDebitFromAccount] = useState<boolean>(false);
  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionKey, setSubmissionKey] = useState<string>('');

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsSubmitting(false);
      setSubmissionKey(Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7));
      const defaultId = initialAssetId || (investments.length > 0 ? investments[0].id : '');
      setSelectedAssetId(defaultId);
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setDebitFromAccount(false);
      setSourceAccountId(accounts.length > 0 ? accounts[0].id : '');

      const asset = investments.find(a => a.id === defaultId);
      if (asset) {
        const defaultPrice = (asset.currentPrice || asset.averagePrice || 0).toString();
        setPriceStr(defaultPrice);
      } else {
        setPriceStr('');
      }

      setQuantityStr('');
      setTotalAmountStr('');
      setMode('quantity');
    }
  }, [isOpen, initialAssetId, investments, accounts]);

  // Selected asset
  const currentAsset = useMemo(() => {
    return investments.find(a => a.id === selectedAssetId);
  }, [investments, selectedAssetId]);

  // When selected asset changes, update price default if empty
  const handleAssetSelect = (newId: string) => {
    setSelectedAssetId(newId);
    setError(null);
    const asset = investments.find(a => a.id === newId);
    if (asset) {
      const p = (asset.currentPrice || asset.averagePrice || 0).toString();
      setPriceStr(p);
      setQuantityStr('');
      setTotalAmountStr('');
    }
  };

  // Handle quantity input
  const handleQuantityChange = (val: string) => {
    setQuantityStr(val);
    const q = parseFloat(val.replace(',', '.'));
    const p = parseFloat(priceStr.replace(',', '.'));
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      const total = calculateTransactionTotal(q, p);
      setTotalAmountStr(total.toString());
    } else {
      setTotalAmountStr('');
    }
  };

  // Handle price input
  const handlePriceChange = (val: string) => {
    setPriceStr(val);
    const p = parseFloat(val.replace(',', '.'));
    if (mode === 'quantity') {
      const q = parseFloat(quantityStr.replace(',', '.'));
      if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
        const total = calculateTransactionTotal(q, p);
        setTotalAmountStr(total.toString());
      }
    } else {
      const total = parseFloat(totalAmountStr.replace(',', '.'));
      if (!isNaN(total) && !isNaN(p) && total > 0 && p > 0) {
        const calculatedQty = total / p;
        const formattedQty = currentAsset?.type === 'crypto' 
          ? Number(calculatedQty.toFixed(8)) 
          : Number(calculatedQty.toFixed(4));
        setQuantityStr(formattedQty.toString());
      }
    }
  };

  // Handle total amount input (mode === 'total')
  const handleTotalAmountChange = (val: string) => {
    setTotalAmountStr(val);
    const total = parseFloat(val.replace(',', '.'));
    const p = parseFloat(priceStr.replace(',', '.'));
    if (!isNaN(total) && !isNaN(p) && total > 0 && p > 0) {
      const calculatedQty = total / p;
      const formattedQty = currentAsset?.type === 'crypto' 
        ? Number(calculatedQty.toFixed(8)) 
        : (currentAsset?.type === 'stock' || currentAsset?.type === 'fii')
          ? Math.floor(calculatedQty)
          : Number(calculatedQty.toFixed(4));
      setQuantityStr(formattedQty.toString());
    } else {
      setQuantityStr('');
    }
  };

  // Use current asset market price
  const handleUseMarketPrice = () => {
    if (!currentAsset) return;
    const p = (currentAsset.currentPrice || currentAsset.averagePrice || 0).toString();
    handlePriceChange(p);
  };

  // Calculations & simulation
  const parsedQuantity = parseFloat(quantityStr.replace(',', '.')) || 0;
  const parsedPrice = parseFloat(priceStr.replace(',', '.')) || 0;
  const parsedTotal = parseFloat(totalAmountStr.replace(',', '.')) || 0;

  const simulation = useMemo(() => {
    if (!currentAsset || parsedQuantity <= 0 || parsedPrice <= 0) {
      return null;
    }
    return calculateAportePosition(
      { quantity: currentAsset.quantity, averagePrice: currentAsset.averagePrice },
      { quantity: parsedQuantity, price: parsedPrice }
    );
  }, [currentAsset, parsedQuantity, parsedPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentAsset) {
      setError('Selecione um ativo para realizar o aporte.');
      return;
    }

    if (parsedQuantity <= 0) {
      setError('Informe uma quantidade válida para o aporte.');
      return;
    }

    if (parsedPrice <= 0) {
      setError('Informe um preço unitário válido.');
      return;
    }

    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError('Informe uma data válida no formato AAAA-MM-DD.');
      return;
    }

    if (debitFromAccount && !sourceAccountId) {
      setError('Selecione a conta bancária de onde o aporte será debitado.');
      return;
    }

    setIsSubmitting(true);
    try {
      await executeInvestmentAporte({
        assetId: currentAsset.id,
        quantity: parsedQuantity,
        price: parsedPrice,
        date,
        sourceAccountId: debitFromAccount ? sourceAccountId : undefined,
        notes: notes.trim() || undefined,
        idempotencyKey: submissionKey
      });

      // Celebration confetti
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {
        // ignore
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao processar aporte.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Novo Aporte</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  Carteira
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Adicione mais cotas e atualize seu preço médio ponderado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Asset Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Ativo para Aporte
            </label>
            {investments.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-400">
                Nenhum ativo cadastrado. Cadastre um novo ativo primeiro.
              </div>
            ) : (
              <select
                value={selectedAssetId}
                onChange={e => handleAssetSelect(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-medium cursor-pointer"
              >
                {investments.map(asset => (
                  <option key={asset.id} value={asset.id}>
                    {asset.ticker} - {asset.name} ({asset.currency})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Current Asset Position Summary Card */}
          {currentAsset && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="font-semibold text-slate-300">Posição Atual do Ativo:</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {currentAsset.currency}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-200">
                <div>
                  <span className="text-slate-500 text-[10px] block">Quantidade:</span>
                  <strong className="font-mono font-bold text-white">
                    {currentAsset.quantity.toLocaleString('pt-BR')}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Preço Médio:</span>
                  <strong className="font-mono text-slate-300">
                    {formatCurrency(currentAsset.averagePrice, currentAsset.currency, hideValues)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Cotação Atual:</span>
                  <strong className="font-mono text-emerald-400">
                    {formatCurrency(currentAsset.currentPrice, currentAsset.currency, hideValues)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Custo Total:</span>
                  <strong className="font-mono text-slate-200">
                    {formatCurrency(currentAsset.quantity * currentAsset.averagePrice, currentAsset.currency, hideValues)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Input Mode Selector */}
          <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-800 gap-1">
            <button
              type="button"
              onClick={() => setMode('quantity')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                mode === 'quantity'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Definir por Quantidade de Cotas
            </button>
            <button
              type="button"
              onClick={() => setMode('total')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                mode === 'total'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Definir por Valor a Investir (R$)
            </button>
          </div>

          {/* Amount and Price Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mode === 'quantity' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Quantidade a Comprar <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 10"
                    value={quantityStr}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-mono font-bold"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-[10px] pointer-events-none">
                    cotas
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Valor Total do Aporte <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 500.00"
                    value={totalAmountStr}
                    onChange={e => handleTotalAmountChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-mono font-bold"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-[10px] pointer-events-none">
                    {currentAsset?.currency || 'BRL'}
                  </span>
                </div>
              </div>
            )}

            {/* Execution Price Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  Preço por Cota <span className="text-emerald-400">*</span>
                </label>
                {currentAsset && currentAsset.currentPrice > 0 && (
                  <button
                    type="button"
                    onClick={handleUseMarketPrice}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Preencher com a cotação atual"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Usar cotação</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={priceStr}
                  onChange={e => handlePriceChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                />
                <span className="absolute right-3 top-2.5 text-slate-500 text-[10px] pointer-events-none">
                  / cota
                </span>
              </div>
            </div>
          </div>

          {/* Secondary Calculated Info (if mode is total, shows calculated quantity; if quantity, shows calculated total) */}
          {mode === 'total' && parsedQuantity > 0 && (
            <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 text-[11px] flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Quantidade calculada:</span>
              <strong className="font-mono text-emerald-400 font-bold">
                {parsedQuantity.toLocaleString('pt-BR')} cotas
              </strong>
            </div>
          )}

          {mode === 'quantity' && parsedTotal > 0 && (
            <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 text-[11px] flex items-center justify-between text-slate-300">
              <span className="text-slate-400">Total calculado do aporte:</span>
              <strong className="font-mono text-emerald-400 font-bold">
                {formatCurrency(parsedTotal, currentAsset?.currency || 'BRL', hideValues)}
              </strong>
            </div>
          )}

          {/* Live Simulation Card of New Position */}
          {simulation && currentAsset && (
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simulação da Nova Posição após o Aporte:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-500/20 text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block">Nova Quantidade:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 line-through font-mono">
                      {currentAsset.quantity.toLocaleString('pt-BR')}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <strong className="font-mono font-bold text-white">
                      {simulation.newQuantity.toLocaleString('pt-BR')}
                    </strong>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      (+{parsedQuantity})
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Novo Preço Médio:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 line-through font-mono">
                      {formatCurrency(currentAsset.averagePrice, currentAsset.currency, hideValues)}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <strong className="font-mono font-bold text-emerald-300">
                      {formatCurrency(simulation.newAveragePrice, currentAsset.currency, hideValues)}
                    </strong>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Valor deste Aporte:</span>
                  <strong className="font-mono font-bold text-emerald-400">
                    {formatCurrency(simulation.totalAporteAmount, currentAsset.currency, hideValues)}
                  </strong>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] block">Novo Custo Total:</span>
                  <strong className="font-mono font-bold text-white">
                    {formatCurrency(simulation.newTotalCost, currentAsset.currency, hideValues)}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Date & Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Data do Aporte</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Observação (opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Aporte mensal de dividendos"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {/* Debit from Bank Account Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={debitFromAccount}
                onChange={e => setDebitFromAccount(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 cursor-pointer"
              />
              <span className="font-semibold text-slate-200">
                Debitar valor de uma conta bancária
              </span>
            </label>

            {debitFromAccount && (
              <div className="space-y-1.5 pl-6 pt-1 animate-in fade-in">
                <select
                  value={sourceAccountId}
                  onChange={e => setSourceAccountId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName}) - Saldo: {formatCurrency(acc.currentBalance, 'BRL', hideValues)}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  Uma transação de despesa será lançada na conta para manter seu saldo bancário atualizado.
                </p>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !currentAsset || parsedQuantity <= 0 || parsedPrice <= 0}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <TrendingUp className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Processando Aporte...' : 'Confirmar Aporte'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
