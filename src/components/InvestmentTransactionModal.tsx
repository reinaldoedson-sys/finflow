import React, { useState, useEffect, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { InvestmentAsset, InvestmentTransactionType } from '../types/finance';
import { formatCurrency, formatDateShort } from '../utils/currency';
import { 
  calculateTransactionTotal, 
  validateInvestmentTransaction 
} from '../domain/investmentTransactions';
import { 
  X, 
  PlusCircle, 
  History, 
  Trash2, 
  Calendar, 
  FileText, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight, 
  Coins, 
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface InvestmentTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAssetId?: string | null;
}

export const InvestmentTransactionModal: React.FC<InvestmentTransactionModalProps> = ({
  isOpen,
  onClose,
  initialAssetId
}) => {
  const { 
    investments, 
    investmentTransactions, 
    addInvestmentTransaction, 
    deleteInvestmentTransaction 
  } = useFinance();
  const { hideValues } = useSecurity();

  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [type, setType] = useState<InvestmentTransactionType>('buy');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [quantityStr, setQuantityStr] = useState<string>('');
  const [priceStr, setPriceStr] = useState<string>('');
  const [totalAmountStr, setTotalAmountStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filterAssetId, setFilterAssetId] = useState<string>('all');

  // Reset or initialize state on modal open
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      const defaultAssetId = initialAssetId || (investments.length > 0 ? investments[0].id : '');
      setSelectedAssetId(defaultAssetId);
      setFilterAssetId(initialAssetId || 'all');
      setType('buy');
      setDate(new Date().toISOString().split('T')[0]);
      setQuantityStr('');
      setPriceStr('');
      setTotalAmountStr('');
      setNotes('');
      // If opened with initialAssetId, start on form or history depending on preference
      setActiveTab('form');
    }
  }, [isOpen, initialAssetId, investments]);

  // Selected asset metadata
  const currentAsset = useMemo(() => {
    return investments.find(a => a.id === selectedAssetId);
  }, [investments, selectedAssetId]);

  // Auto-calculate totalAmount when quantity or price changes (unless user typed a custom total for dividend)
  const handleQuantityChange = (val: string) => {
    setQuantityStr(val);
    const q = parseFloat(val.replace(',', '.'));
    const p = parseFloat(priceStr.replace(',', '.'));
    if (!isNaN(q) && !isNaN(p) && q > 0 && p >= 0) {
      const calculated = calculateTransactionTotal(q, p);
      setTotalAmountStr(calculated.toString());
    }
  };

  const handlePriceChange = (val: string) => {
    setPriceStr(val);
    const p = parseFloat(val.replace(',', '.'));
    const q = parseFloat(quantityStr.replace(',', '.'));
    if (!isNaN(q) && !isNaN(p) && q > 0 && p >= 0) {
      const calculated = calculateTransactionTotal(q, p);
      setTotalAmountStr(calculated.toString());
    }
  };

  const handleTypeChange = (newType: InvestmentTransactionType) => {
    setType(newType);
    setError(null);
    if (newType === 'dividend') {
      // Dividends don't necessarily have a unit price or quantity
      if (!quantityStr) setQuantityStr('0');
      if (!priceStr) setPriceStr('0');
    } else {
      if (quantityStr === '0') setQuantityStr('');
      if (priceStr === '0') setPriceStr('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedAssetId) {
      setError('Selecione um ativo para registrar a operação.');
      return;
    }

    const q = type === 'dividend' && (!quantityStr || quantityStr.trim() === '')
      ? 0
      : parseFloat(quantityStr.replace(',', '.'));
    const p = type === 'dividend' && (!priceStr || priceStr.trim() === '')
      ? 0
      : parseFloat(priceStr.replace(',', '.'));
    const total = parseFloat(totalAmountStr.replace(',', '.'));

    const validation = validateInvestmentTransaction({
      assetId: selectedAssetId,
      type,
      date,
      quantity: q,
      price: p,
      totalAmount: total,
      notes
    }, investments);

    if (!validation.isValid) {
      setError(validation.error || 'Dados da operação inválidos.');
      return;
    }

    try {
      await addInvestmentTransaction({
        assetId: selectedAssetId,
        type,
        date,
        quantity: q,
        price: p,
        totalAmount: total,
        notes: notes.trim() || undefined
      });

      setSuccessMsg('Operação registrada com sucesso no histórico!');
      setQuantityStr('');
      setPriceStr('');
      setTotalAmountStr('');
      setNotes('');

      // Auto switch to history tab after brief delay
      setTimeout(() => {
        setActiveTab('history');
        setSuccessMsg(null);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao registrar operação.';
      setError(msg);
    }
  };

  // Filtered transactions for the history view
  const filteredTransactions = useMemo(() => {
    let list = [...investmentTransactions];
    if (filterAssetId !== 'all') {
      list = list.filter(t => t.assetId === filterAssetId);
    }
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [investmentTransactions, filterAssetId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Histórico de Operações
              </h2>
              <p className="text-xs text-slate-400">
                Ledger de compras, vendas e proventos de investimentos
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

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800/80 bg-slate-950/40 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'form'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>Nova Operação</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <History className="w-4 h-4 text-blue-400" />
            <span>Histórico ({investmentTransactions.length})</span>
          </button>
        </div>

        {/* Tab 1: Nova Operação */}
        {activeTab === 'form' && (
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Asset Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Ativo de Investimento *
              </label>
              {investments.length === 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  Nenhum ativo cadastrado na carteira. Cadastre um ativo antes de registrar movimentações.
                </div>
              ) : (
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                >
                  {investments.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.ticker} - {asset.name} ({asset.currency})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Operation Type */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Tipo de Operação *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeChange('buy')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === 'buy'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                  <span>Compra</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('sell')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === 'sell'
                      ? 'bg-rose-500/15 border-rose-500 text-rose-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                  <span>Venda</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('dividend')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === 'dividend'
                      ? 'bg-blue-500/15 border-blue-500 text-blue-300 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Coins className="w-4 h-4 text-blue-400" />
                  <span>Dividendo</span>
                </button>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Data da Operação *
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Quantity and Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {type === 'dividend' ? 'Qtd. de Cotas (Opcional)' : 'Quantidade *'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={type === 'dividend' ? '0' : 'ex: 100'}
                  value={quantityStr}
                  onChange={e => handleQuantityChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
                  required={type !== 'dividend'}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {type === 'dividend' ? 'Valor por Cota (Opcional)' : 'Preço Unitário *'}
                </label>
                <div className="relative">
                  <span className="text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono">
                    {currentAsset?.currency === 'USD' ? 'US$' : 'R$'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={priceStr}
                    onChange={e => handlePriceChange(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 font-mono"
                    required={type !== 'dividend'}
                  />
                </div>
              </div>
            </div>

            {/* Total Amount */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Valor Total da Operação *</span>
                <span className="text-[10px] text-slate-500">Calculado automaticamente ou ajustável</span>
              </label>
              <div className="relative">
                <span className="text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono">
                  {currentAsset?.currency === 'USD' ? 'US$' : 'R$'}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={totalAmountStr}
                  onChange={e => setTotalAmountStr(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Observações (Opcional)
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Aporte mensal, desinvestimento, provento extraordinário..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={investments.length === 0}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                Registrar Operação
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Histórico de Movimentações */}
        {activeTab === 'history' && (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
            {/* Asset Filter */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400 font-medium">Filtrar por ativo:</span>
              <select
                value={filterAssetId}
                onChange={e => setFilterAssetId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="all">Todos os ativos ({investmentTransactions.length})</option>
                {investments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.ticker} ({investmentTransactions.filter(t => t.assetId === a.id).length})
                  </option>
                ))}
              </select>
            </div>

            {/* List */}
            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800/60 space-y-2">
                <History className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">
                  Nenhuma operação registrada
                </p>
                <p className="text-[11px] text-slate-500">
                  {filterAssetId === 'all' 
                    ? 'Use a aba "Nova Operação" acima para registrar compras, vendas e dividendos.'
                    : 'Não há operações registradas para o ativo selecionado.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map(tx => {
                  const asset = investments.find(a => a.id === tx.assetId);
                  const ticker = asset?.ticker || 'Ativo Removido';
                  const currency = asset?.currency || 'BRL';

                  let badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                  let badgeLabel = 'Compra';
                  let Icon = ArrowUpRight;

                  if (tx.type === 'sell') {
                    badgeColor = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
                    badgeLabel = 'Venda';
                    Icon = ArrowDownRight;
                  } else if (tx.type === 'dividend') {
                    badgeColor = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
                    badgeLabel = 'Dividendo';
                    Icon = Coins;
                  }

                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${badgeColor}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold font-mono text-white">
                              {ticker}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${badgeColor}`}>
                              {badgeLabel}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {formatDateShort(tx.date)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {tx.type === 'dividend' ? (
                              <span>Provento recebido {tx.notes ? `· ${tx.notes}` : ''}</span>
                            ) : (
                              <span>
                                {tx.quantity.toLocaleString('pt-BR')} cotas a {formatCurrency(tx.price, currency, hideValues)}
                                {tx.notes ? ` · ${tx.notes}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-white">
                            {formatCurrency(tx.totalAmount, currency, hideValues)}
                          </div>
                        </div>

                        <button
                          onClick={() => deleteInvestmentTransaction(tx.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                          title="Excluir operação do histórico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
