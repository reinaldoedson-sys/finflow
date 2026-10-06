import React, { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { InvestmentAsset, AssetClass } from '../types/finance';
import { POPULAR_TICKERS, fetchMarketQuotes } from '../services/marketQuotes';
import { formatCurrency } from '../utils/currency';
import { 
  calculateInvestmentCost, 
  calculateInvestmentValue, 
  calculateUnrealizedProfit 
} from '../domain/investments';
import { X, TrendingUp, Sparkles, RefreshCw, AlertCircle, Building2, Check } from 'lucide-react';

interface InvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  editAsset?: InvestmentAsset | null;
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({
  isOpen,
  onClose,
  editAsset,
}) => {
  const { addInvestment, updateInvestment, currency } = useFinance();

  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetClass>('stock');
  const [quantity, setQuantity] = useState('');
  const [averagePrice, setAveragePrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [institution, setInstitution] = useState('');
  const [assetCurrency, setAssetCurrency] = useState<'BRL' | 'USD'>('BRL');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [notes, setNotes] = useState('');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceFetchedSuccess, setPriceFetchedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editAsset) {
      setTicker(editAsset.ticker);
      setName(editAsset.name);
      setType(editAsset.type);
      setQuantity(editAsset.quantity.toString());
      setAveragePrice(editAsset.averagePrice.toString());
      setCurrentPrice(editAsset.currentPrice.toString());
      setInstitution(editAsset.institution || '');
      setAssetCurrency(editAsset.currency || 'BRL');
      setAutoUpdate(editAsset.autoUpdate);
      setNotes(editAsset.notes || '');
    } else {
      setTicker('');
      setName('');
      setType('stock');
      setQuantity('');
      setAveragePrice('');
      setCurrentPrice('');
      setInstitution('');
      setAssetCurrency('BRL');
      setAutoUpdate(true);
      setNotes('');
    }
    setError(null);
    setPriceFetchedSuccess(false);
  }, [editAsset, isOpen]);

  if (!isOpen) return null;

  // Quick ticker fill
  const handleSelectPopularTicker = async (pop: typeof POPULAR_TICKERS[0]) => {
    setTicker(pop.ticker);
    setName(pop.name);
    setType(pop.type);
    setAutoUpdate(true);
    await handleFetchLivePrice(pop.ticker);
  };

  const handleFetchLivePrice = async (symbolToFetch?: string) => {
    const sym = (symbolToFetch || ticker).trim().toUpperCase();
    if (!sym) return;

    setIsFetchingPrice(true);
    setPriceFetchedSuccess(false);
    try {
      const { quotes } = await fetchMarketQuotes([sym]);
      const quote = quotes[sym] || quotes[`${sym}.SA`];
      if (quote && typeof quote.price === 'number') {
        setCurrentPrice(quote.price.toFixed(2));
        if (!averagePrice) {
          setAveragePrice(quote.price.toFixed(2));
        }
        if (!name && quote.name) {
          setName(quote.name);
        }
        setPriceFetchedSuccess(true);
      } else {
        setError('Não foi possível obter a cotação de mercado deste código. Você pode digitar o preço manualmente.');
      }
    } catch {
      setError('Falha na consulta da cotação. Você pode preencher o valor atual manualmente.');
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const parsedQty = parseFloat(quantity) || 0;
  const parsedAvgPrice = parseFloat(averagePrice) || 0;
  const parsedCurrentPrice = parseFloat(currentPrice) || parsedAvgPrice;

  // Cálculos financeiros via funções puras do domínio
  const totalCost = calculateInvestmentCost({ quantity: parsedQty, averagePrice: parsedAvgPrice });
  const currentValue = calculateInvestmentValue({ quantity: parsedQty, currentPrice: parsedCurrentPrice });
  const { profitLoss, profitLossPercent } = calculateUnrealizedProfit({
    quantity: parsedQty,
    averagePrice: parsedAvgPrice,
    currentPrice: parsedCurrentPrice
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanTicker = ticker.trim().toUpperCase();
    const cleanName = name.trim() || cleanTicker;

    if (!cleanTicker) {
      setError('Informe o ticker ou código do ativo (ex: PETR4, MXRF11, BTC).');
      return;
    }

    if (parsedQty <= 0) {
      setError('A quantidade deve ser maior que zero.');
      return;
    }

    if (parsedAvgPrice <= 0) {
      setError('O preço médio pago deve ser maior que zero.');
      return;
    }

    try {
      if (editAsset) {
        await updateInvestment(editAsset.id, {
          ticker: cleanTicker,
          name: cleanName,
          type,
          quantity: parsedQty,
          averagePrice: parsedAvgPrice,
          currentPrice: parsedCurrentPrice,
          currency: assetCurrency,
          institution: institution.trim() || undefined,
          autoUpdate,
          notes: notes.trim() || undefined,
        });
      } else {
        await addInvestment({
          ticker: cleanTicker,
          name: cleanName,
          type,
          quantity: parsedQty,
          averagePrice: parsedAvgPrice,
          currentPrice: parsedCurrentPrice,
          currency: assetCurrency,
          institution: institution.trim() || undefined,
          autoUpdate,
          notes: notes.trim() || undefined,
          lastPriceUpdate: new Date().toISOString()
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar investimento.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="fixed inset-0"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {editAsset ? 'Editar Investimento' : 'Novo Ativo na Carteira'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Acompanhe rentabilidade, cotas e cotações atualizadas
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Suggestions (only in create mode) */}
          {!editAsset && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Ativos populares para preenchimento rápido:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TICKERS.slice(0, 8).map((pop) => (
                  <button
                    key={pop.ticker}
                    type="button"
                    onClick={() => handleSelectPopularTicker(pop)}
                    className="px-2 py-1 rounded-md text-[10px] font-bold font-mono bg-slate-800/80 hover:bg-emerald-500/20 hover:text-emerald-300 border border-slate-700/80 text-slate-300 transition-all cursor-pointer"
                  >
                    {pop.ticker}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ticker & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Código / Ticker <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="Ex: PETR4, MXRF11, BTC"
                  required
                  className="w-full px-3 py-2 pr-16 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => handleFetchLivePrice()}
                  disabled={!ticker || isFetchingPrice}
                  title="Buscar cotação atual"
                  className="absolute right-1 top-1 bottom-1 px-2 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingPrice ? 'animate-spin' : ''}`} />
                  <span>Cotação</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome do Ativo / Descrição
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Petrobras PN, FII Maxi Renda"
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Type, Currency & Institution */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Classe do Ativo
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssetClass)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="stock">Ações (B3 / Exterior)</option>
                <option value="fii">Fundos Imobiliários (FIIs)</option>
                <option value="bdr_etf">BDRs & ETFs</option>
                <option value="crypto">Criptomoedas</option>
                <option value="fixed_income">Renda Fixa / Tesouro / CDB</option>
                <option value="other">Outros Investimentos</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Moeda do Ativo
              </label>
              <select
                value={assetCurrency}
                onChange={(e) => setAssetCurrency(e.target.value as 'BRL' | 'USD')}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="BRL">BRL (R$ - Brasil)</option>
                <option value="USD">USD (US$ - Dólar)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Corretora / Banco
              </label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Ex: XP, NuInvest, Rico, BTG"
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Quantity, Average Price & Current Price */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Quantidade / Cotas <span className="text-emerald-400">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.00000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ex: 100 ou 0.05"
                required
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Preço Médio ({assetCurrency}) <span className="text-emerald-400">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={averagePrice}
                onChange={(e) => setAveragePrice(e.target.value)}
                placeholder="Ex: 42.50"
                required
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Preço Atual ({assetCurrency})</span>
                {priceFetchedSuccess && (
                  <span className="text-[10px] text-emerald-400 font-normal flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" /> Mercado
                  </span>
                )}
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="Ex: 55.26"
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs font-mono font-bold text-emerald-400 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Auto update toggle */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-white">Atualização Automática de Cotação</div>
              <div className="text-[11px] text-slate-400">
                O FinFlow atualizará o preço com base em cotações atualizadas de mercado.
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoUpdate}
              onChange={(e) => setAutoUpdate(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 cursor-pointer"
            />
          </div>

          {/* Performance Calculation Preview */}
          {parsedQty > 0 && parsedAvgPrice > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-800 space-y-2">
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                Simulação da Posição ({assetCurrency})
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Total Aplicado:</span>
                  <strong className="text-slate-200 font-mono">{formatCurrency(totalCost, assetCurrency)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Valor Atual:</span>
                  <strong className="text-white font-mono">{formatCurrency(currentValue, assetCurrency)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Rentabilidade:</span>
                  <strong className={`font-mono ${profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, assetCurrency)} ({profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%)
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Observações / Tese do Ativo
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Alvo de 5% de dividendo anual, reserva para aposentadoria..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all cursor-pointer font-bold active:scale-95"
            >
              {editAsset ? 'Salvar Alterações' : 'Adicionar Ativo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
