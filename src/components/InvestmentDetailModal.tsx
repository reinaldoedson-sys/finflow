import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { InvestmentAsset, InvestmentTransaction, InvestmentTransactionType } from '../types/finance';
import { formatCurrency, formatDateShort } from '../utils/currency';
import { 
  calculateInvestmentCost, 
  calculateInvestmentValue, 
  calculateUnrealizedProfit 
} from '../domain/investments';
import { 
  resolveEffectiveInvestmentPosition, 
  calculateEffectiveInvestmentValue 
} from '../domain/investmentPosition';
import { 
  X, 
  TrendingUp, 
  Plus, 
  History, 
  Edit3, 
  Trash2, 
  Building2, 
  Calendar, 
  Coins, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText,
  DollarSign,
  PieChart,
  RefreshCw,
  PlusCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface InvestmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: InvestmentAsset | null;
  onOpenAporte: (assetId: string) => void;
  onEditAsset: (asset: InvestmentAsset) => void;
}

const ASSET_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  stock: { label: 'Ação', color: '#10b981', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  fii: { label: 'FII', color: '#3b82f6', bg: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  crypto: { label: 'Cripto', color: '#f59e0b', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  fixed_income: { label: 'Renda Fixa', color: '#8b5cf6', bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  bdr_etf: { label: 'BDR / ETF', color: '#06b6d4', bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  other: { label: 'Outro', color: '#64748b', bg: 'bg-slate-700/40 text-slate-300 border-slate-700' }
};

export const InvestmentDetailModal: React.FC<InvestmentDetailModalProps> = ({
  isOpen,
  onClose,
  asset,
  onOpenAporte,
  onEditAsset,
}) => {
  const { 
    investmentTransactions, 
    deleteInvestmentTransaction,
    refreshInvestmentQuotes,
    isRefreshingQuotes 
  } = useFinance();
  const { hideValues } = useSecurity();

  const [activeTab, setActiveTab] = useState<'all' | 'buys' | 'sells' | 'dividends'>('buys');

  // Posição efetiva derivada do ledger (ou fallback legado seguro)
  const derivedPos = useMemo(() => {
    if (!asset) return null;
    return resolveEffectiveInvestmentPosition(asset, investmentTransactions);
  }, [asset, investmentTransactions]);

  // Transações puras do ativo no ledger (sem inventar transações fictícias)
  const assetTransactions = useMemo(() => {
    if (!asset) return [];
    return investmentTransactions
      .filter(tx => tx.assetId === asset.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [investmentTransactions, asset]);

  // Filtered by tab
  const filteredTransactions = useMemo(() => {
    if (activeTab === 'all') return assetTransactions;
    if (activeTab === 'buys') return assetTransactions.filter(t => t.type === 'buy');
    if (activeTab === 'sells') return assetTransactions.filter(t => t.type === 'sell');
    if (activeTab === 'dividends') return assetTransactions.filter(t => t.type === 'dividend');
    return assetTransactions;
  }, [assetTransactions, activeTab]);

  // Métricas agregadas derivadas do motor de posição
  const txStats = useMemo(() => {
    if (!derivedPos) {
      return {
        totalBoughtAmount: 0,
        totalBoughtQty: 0,
        totalSoldAmount: 0,
        totalSoldQty: 0,
        totalDividends: 0,
        realizedProfitLoss: 0,
        buysCount: 0,
        sellsCount: 0,
        dividendsCount: 0
      };
    }

    return {
      totalBoughtAmount: derivedPos.totalBought,
      totalBoughtQty: derivedPos.totalBoughtQuantity,
      totalSoldAmount: derivedPos.totalSold,
      totalSoldQty: derivedPos.totalSoldQuantity,
      totalDividends: derivedPos.totalDividends,
      realizedProfitLoss: derivedPos.realizedProfitLoss,
      buysCount: assetTransactions.filter(t => t.type === 'buy').length,
      sellsCount: assetTransactions.filter(t => t.type === 'sell').length,
      dividendsCount: assetTransactions.filter(t => t.type === 'dividend').length
    };
  }, [derivedPos, assetTransactions]);

  if (!isOpen || !asset) return null;

  const meta = ASSET_TYPE_LABELS[asset.type] || ASSET_TYPE_LABELS.other;
  const effectiveQuantity = derivedPos ? derivedPos.quantity : asset.quantity;
  const effectiveAveragePrice = derivedPos ? derivedPos.averagePrice : asset.averagePrice;
  const assetCost = derivedPos ? derivedPos.totalCost : calculateInvestmentCost(asset);
  const assetValue = derivedPos 
    ? calculateEffectiveInvestmentValue(asset, derivedPos)
    : calculateInvestmentValue(asset);
  const { profitLoss: assetProfit, profitLossPercent: assetProfitPercent } = calculateUnrealizedProfit({
    quantity: effectiveQuantity,
    averagePrice: effectiveAveragePrice,
    currentPrice: asset.currentPrice
  });
  const hasChange = typeof asset.changePercent === 'number';
  const isPositiveChange = hasChange && (asset.changePercent || 0) >= 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/60 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black font-mono text-white tracking-tight">
                  {asset.ticker}
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg}`}>
                  {meta.label}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {asset.currency}
                </span>
                {asset.autoUpdate && (
                  <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    Cotação em tempo real
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                {asset.name}
              </p>
              {asset.institution && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{asset.institution}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenAporte(asset.id)}
              className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
              title="Fazer um novo aporte neste ativo"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Novo Aporte</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Position Overview KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Quantidade Atual</span>
              <strong className="text-base sm:text-lg font-mono font-bold text-white block mt-0.5">
                {effectiveQuantity.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">cotas</span>
              </strong>
              <span className="text-[10px] text-slate-500">Posição acumulada</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Preço Médio Pago</span>
              <strong className="text-base sm:text-lg font-mono font-bold text-slate-200 block mt-0.5">
                {formatCurrency(effectiveAveragePrice, asset.currency, hideValues)}
              </strong>
              <span className="text-[10px] text-slate-500">Custo ponderado</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 block font-medium">Cotação Atual</span>
                {hasChange && (
                  <span className={`text-[10px] font-mono font-bold flex items-center ${isPositiveChange ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositiveChange ? '+' : ''}{(asset.changePercent || 0).toFixed(2)}%
                  </span>
                )}
              </div>
              <strong className="text-base sm:text-lg font-mono font-bold text-emerald-400 block mt-0.5">
                {formatCurrency(asset.currentPrice, asset.currency, hideValues)}
              </strong>
              <span className="text-[10px] text-slate-500">Preço de mercado</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-medium">Posição Total</span>
              <strong className="text-base sm:text-lg font-mono font-black text-white block mt-0.5">
                {formatCurrency(assetValue, asset.currency, hideValues)}
              </strong>
              <div className={`text-[10px] font-mono font-bold mt-0.5 ${assetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {assetProfit >= 0 ? '+' : ''}{formatCurrency(assetProfit, asset.currency, hideValues)} ({assetProfitPercent >= 0 ? '+' : ''}{assetProfitPercent.toFixed(2)}%)
              </div>
            </div>
          </div>

          {/* Quick Action Bar for Asset */}
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Ações do ativo:</span>
              <button
                onClick={() => onEditAsset(asset)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Ativo</span>
              </button>
              <button
                onClick={() => refreshInvestmentQuotes()}
                disabled={isRefreshingQuotes}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingQuotes ? 'animate-spin' : ''}`} />
                <span>Atualizar Cotação</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Custo total de aquisição: <strong className="text-slate-300">{formatCurrency(assetCost, asset.currency, hideValues)}</strong>
            </div>
          </div>

          {/* Transactions Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  <span>Histórico de Compras, Aportes & Movimentações</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Todas as operações registradas no livro-razão deste ativo
                </p>
              </div>

              {/* Tabs Filter */}
              <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 gap-1 text-xs">
                <button
                  onClick={() => setActiveTab('buys')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    activeTab === 'buys'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Compras & Aportes ({txStats.buysCount})
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Todas ({assetTransactions.length})
                </button>
                {txStats.sellsCount > 0 && (
                  <button
                    onClick={() => setActiveTab('sells')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      activeTab === 'sells'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Vendas ({txStats.sellsCount})
                  </button>
                )}
                {txStats.dividendsCount > 0 && (
                  <button
                    onClick={() => setActiveTab('dividends')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      activeTab === 'dividends'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Proventos ({txStats.dividendsCount})
                  </button>
                )}
              </div>
            </div>

            {/* Totalizers Banner */}
            {txStats.buysCount > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Total Aportado em Compras:</span>
                  <strong className="text-emerald-400 font-mono font-bold">
                    {formatCurrency(txStats.totalBoughtAmount, asset.currency, hideValues)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Cotas Compradas no Histórico:</span>
                  <strong className="text-slate-200 font-mono font-bold">
                    {txStats.totalBoughtQty.toLocaleString('pt-BR')} cotas
                  </strong>
                </div>
                {txStats.totalDividends > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-500 block">Total em Proventos Recebidos:</span>
                    <strong className="text-purple-400 font-mono font-bold">
                      {formatCurrency(txStats.totalDividends, asset.currency, hideValues)}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* Transactions List */}
            {filteredTransactions.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-950/40 border border-slate-800 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-400 mx-auto">
                  <TrendingUp className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    {activeTab === 'buys'
                      ? 'Nenhuma compra ou aporte registrado'
                      : 'Nenhuma operação encontrada para este filtro'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Cadastre compras e aportes para manter o histórico e o preço médio ponderado perfeitamente auditáveis.
                  </p>
                </div>
                <button
                  onClick={() => onOpenAporte(asset.id)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Realizar Aporte Agora</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map(tx => {
                  const isBuy = tx.type === 'buy';
                  const isSell = tx.type === 'sell';
                  const isDividend = tx.type === 'dividend';

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl border shrink-0 ${
                          isBuy
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : isSell
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                              : 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                        }`}>
                          <TrendingUp className="w-4 h-4" />
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              tx.id.startsWith('initial-pos-')
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : isBuy
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : isSell
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            }`}>
                              {tx.id.startsWith('initial-pos-') ? 'Compra Inicial (Cadastro)' : isBuy ? 'Aporte / Compra' : isSell ? 'Venda' : 'Dividendo'}
                            </span>
                            <span className="text-slate-400 text-[11px] font-mono flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {formatDateShort(tx.date)}
                            </span>
                          </div>

                          <div className="text-slate-300 font-medium">
                            {isDividend ? (
                              <span>Provento / Rendimento creditado</span>
                            ) : (
                              <span>
                                <strong className="font-mono text-white">{tx.quantity.toLocaleString('pt-BR')}</strong> cotas a{' '}
                                <strong className="font-mono text-slate-200">{formatCurrency(tx.price, asset.currency, hideValues)}</strong>
                              </span>
                            )}
                          </div>

                          {tx.notes && (
                            <p className="text-[11px] text-slate-400 italic">
                              "{tx.notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Total and Delete button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-500 block">Total da Operação</span>
                          <strong className={`font-mono text-sm font-bold ${
                            isBuy ? 'text-emerald-400' : isSell ? 'text-amber-400' : 'text-purple-400'
                          }`}>
                            {formatCurrency(tx.totalAmount, asset.currency, hideValues)}
                          </strong>
                        </div>

                        {tx.id.startsWith('initial-pos-') ? (
                          <span className="text-[10px] text-slate-500 font-mono px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60" title="Posição inicial base do ativo">
                            Base
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              if (window.confirm('Deseja realmente excluir esta operação do histórico?')) {
                                deleteInvestmentTransaction(tx.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Excluir operação do histórico"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <span>{assetTransactions.length} operação(ões) registrada(s)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
