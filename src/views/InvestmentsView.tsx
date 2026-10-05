import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { InvestmentAsset, AssetClass } from '../types/finance';
import { formatCurrency } from '../utils/currency';
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart, 
  Edit3, 
  Trash2, 
  Building2, 
  Sparkles,
  ShieldCheck,
  Clock,
  Landmark,
  Coins,
  LineChart,
  HelpCircle
} from 'lucide-react';

interface InvestmentsViewProps {
  onOpenNewInvestment: () => void;
  onEditInvestment: (asset: InvestmentAsset) => void;
}

const ASSET_TYPE_LABELS: Record<AssetClass, { label: string; color: string; bg: string }> = {
  stock: { label: 'Ação', color: '#10b981', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  fii: { label: 'FII', color: '#3b82f6', bg: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  crypto: { label: 'Cripto', color: '#f59e0b', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  fixed_income: { label: 'Renda Fixa', color: '#8b5cf6', bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  bdr_etf: { label: 'BDR / ETF', color: '#06b6d4', bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  other: { label: 'Outro', color: '#64748b', bg: 'bg-slate-700/40 text-slate-300 border-slate-700' }
};

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  onOpenNewInvestment,
  onEditInvestment,
}) => {
  const { 
    investments, 
    currency, 
    deleteInvestment, 
    refreshInvestmentQuotes, 
    loadSampleInvestments,
    isRefreshingQuotes, 
    lastQuotesUpdate 
  } = useFinance();
  const { hideValues } = useSecurity();

  const [selectedFilter, setSelectedFilter] = useState<'all' | AssetClass>('all');

  // Compute portfolio metrics
  const totalInvestedCost = investments.reduce((sum, a) => sum + (a.quantity * a.averagePrice), 0);
  const totalCurrentValue = investments.reduce((sum, a) => sum + (a.quantity * a.currentPrice), 0);
  const totalProfitLoss = totalCurrentValue - totalInvestedCost;
  const totalProfitLossPercent = totalInvestedCost > 0 ? (totalProfitLoss / totalInvestedCost) * 100 : 0;

  // Day variation
  const totalDailyVariation = investments.reduce((sum, a) => {
    if (typeof a.previousClose === 'number' && a.previousClose > 0) {
      const diff = (a.currentPrice - a.previousClose) * a.quantity;
      return sum + diff;
    }
    return sum;
  }, 0);
  const dailyVariationPercent = totalCurrentValue > 0 ? (totalDailyVariation / (totalCurrentValue - totalDailyVariation || totalCurrentValue)) * 100 : 0;

  // Asset class allocation breakdown
  const classBreakdown = (['stock', 'fii', 'fixed_income', 'crypto', 'bdr_etf', 'other'] as AssetClass[]).map(type => {
    const assets = investments.filter(a => a.type === type);
    const value = assets.reduce((sum, a) => sum + (a.quantity * a.currentPrice), 0);
    const percent = totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0;
    return {
      type,
      label: ASSET_TYPE_LABELS[type].label,
      color: ASSET_TYPE_LABELS[type].color,
      value,
      percent,
      count: assets.length
    };
  }).filter(c => c.value > 0);

  // Filtered list
  const filteredAssets = selectedFilter === 'all' 
    ? investments 
    : investments.filter(a => a.type === selectedFilter);

  return (
    <div className="space-y-6">
      {/* Top Banner Overview */}
      <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                Mercado & Carteira
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                Ao Vivo
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Investimentos & Ativos
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Cotações automáticas da B3, FIIs, Cripto e Renda Fixa em tempo real
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => refreshInvestmentQuotes()}
              disabled={isRefreshingQuotes}
              className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Atualizar cotações do mercado agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingQuotes ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar Cotações</span>
              <span className="sm:hidden">Atualizar</span>
            </button>

            <button
              onClick={onOpenNewInvestment}
              className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Novo Ativo</span>
            </button>
          </div>
        </div>

        {/* Real-time sync timestamp status */}
        {lastQuotesUpdate && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Última cotação de mercado obtida às <strong>{lastQuotesUpdate}</strong>.</span>
          </div>
        )}

        {/* Portfolio KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-1">
          {/* Card 1: Patrimônio Atual */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/40 border border-slate-800/90">
            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-emerald-400" />
              <span>Patrimônio Investido</span>
            </div>
            <div className="text-base sm:text-xl font-black font-mono text-white">
              {formatCurrency(totalCurrentValue, currency, hideValues)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {investments.length} ativo{investments.length !== 1 ? 's' : ''} em carteira
            </span>
          </div>

          {/* Card 2: Custo Aplicado */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/40 border border-slate-800/90">
            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-blue-400" />
              <span>Total Aplicado</span>
            </div>
            <div className="text-base sm:text-xl font-bold font-mono text-slate-200">
              {formatCurrency(totalInvestedCost, currency, hideValues)}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Custo médio de aquisição
            </span>
          </div>

          {/* Card 3: Lucro / Prejuízo Total */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/40 border border-slate-800/90">
            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              {totalProfitLoss >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>Rentabilidade Total</span>
            </div>
            <div className={`text-base sm:text-xl font-black font-mono ${totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(totalProfitLoss, currency, hideValues)}
            </div>
            <span className={`text-[10px] font-mono font-semibold block mt-0.5 ${totalProfitLossPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalProfitLossPercent >= 0 ? '+' : ''}{totalProfitLossPercent.toFixed(2)}% acumulado
            </span>
          </div>

          {/* Card 4: Variação do Dia */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/40 border border-slate-800/90">
            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              {totalDailyVariation >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>Oscilação do Dia</span>
            </div>
            <div className={`text-base sm:text-xl font-bold font-mono ${totalDailyVariation >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalDailyVariation >= 0 ? '+' : ''}{formatCurrency(totalDailyVariation, currency, hideValues)}
            </div>
            <span className={`text-[10px] font-mono font-semibold block mt-0.5 ${dailyVariationPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {dailyVariationPercent >= 0 ? '+' : ''}{dailyVariationPercent.toFixed(2)}% hoje
            </span>
          </div>
        </div>

        {/* Asset Allocation Progress Bar */}
        {classBreakdown.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                <span>Diversificação da Carteira</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {classBreakdown.length} classes de ativos
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex">
              {classBreakdown.map((item) => (
                <div
                  key={item.type}
                  title={`${item.label}: ${item.percent.toFixed(1)}%`}
                  style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                  className="h-full transition-all hover:opacity-80"
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
              {classBreakdown.map((item) => (
                <div key={item.type} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-mono text-slate-400 font-semibold">{item.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        <button
          onClick={() => setSelectedFilter('all')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
            selectedFilter === 'all'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Todos ({investments.length})
        </button>

        {(['stock', 'fii', 'fixed_income', 'crypto', 'bdr_etf', 'other'] as AssetClass[]).map((type) => {
          const count = investments.filter(a => a.type === type).length;
          if (count === 0 && selectedFilter !== type) return null;
          const meta = ASSET_TYPE_LABELS[type];
          const isSelected = selectedFilter === type;
          return (
            <button
              key={type}
              onClick={() => setSelectedFilter(type)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <LineChart className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {investments.length === 0 ? 'Sua carteira de investimentos está vazia' : 'Nenhum ativo nesta categoria'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              {investments.length === 0
                ? 'Você pode carregar uma carteira de exemplo com ativos reais da B3 (PETR4), FIIs (MXRF11), Cripto (Bitcoin) e Tesouro Direto com cotações automáticas, ou cadastrar seus próprios ativos.'
                : 'Não há ativos cadastrados com o filtro selecionado.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {investments.length === 0 && (
              <button
                onClick={() => loadSampleInvestments()}
                className="px-4 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Carregar Carteira Exemplo (B3, FIIs e Cripto)</span>
              </button>
            )}
            <button
              onClick={onOpenNewInvestment}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                investments.length === 0
                  ? 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700'
                  : 'text-slate-950 bg-emerald-400 hover:bg-emerald-300 font-bold'
              }`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Adicionar Novo Ativo</span>
            </button>
            {selectedFilter !== 'all' && investments.length > 0 && (
              <button
                onClick={() => setSelectedFilter('all')}
                className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                Ver Todos os Ativos
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssets.map((asset) => {
            const meta = ASSET_TYPE_LABELS[asset.type] || ASSET_TYPE_LABELS.other;
            const assetCost = asset.quantity * asset.averagePrice;
            const assetValue = asset.quantity * asset.currentPrice;
            const assetProfit = assetValue - assetCost;
            const assetProfitPercent = assetCost > 0 ? (assetProfit / assetCost) * 100 : 0;
            const hasChange = typeof asset.changePercent === 'number';
            const isPositiveChange = hasChange && (asset.changePercent || 0) >= 0;

            return (
              <div
                key={asset.id}
                className="p-4 sm:p-5 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col justify-between space-y-4 group"
              >
                {/* Card Top: Ticker, Type Badge & Actions */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-black font-mono text-white tracking-tight">
                          {asset.ticker}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg}`}>
                          {meta.label}
                        </span>
                        {asset.autoUpdate && (
                          <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded" title="Cotação ao vivo via mercado">
                            Online
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-300 truncate max-w-[200px] mt-0.5">
                        {asset.name}
                      </div>
                      {asset.institution && (
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" />
                          <span>{asset.institution}</span>
                        </div>
                      )}
                    </div>

                    {/* Day change badge */}
                    {hasChange && (
                      <div className={`px-2 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-0.5 shrink-0 ${
                        isPositiveChange 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isPositiveChange ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        <span>{isPositiveChange ? '+' : ''}{(asset.changePercent || 0).toFixed(2)}%</span>
                      </div>
                    )}
                  </div>

                  {/* Quantity & Prices info */}
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Quantidade:</span>
                      <strong className="text-slate-200 font-mono">{asset.quantity.toLocaleString('pt-BR')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Preço Médio:</span>
                      <strong className="text-slate-300 font-mono">{formatCurrency(asset.averagePrice, currency, hideValues)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Cotação Atual:</span>
                      <strong className="text-emerald-400 font-mono font-bold">{formatCurrency(asset.currentPrice, currency, hideValues)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Posição Total:</span>
                      <strong className="text-white font-mono font-black">{formatCurrency(assetValue, currency, hideValues)}</strong>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: Rentabilidade & Buttons */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Rentabilidade:</span>
                    <div className={`text-xs font-mono font-bold ${assetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {assetProfit >= 0 ? '+' : ''}{formatCurrency(assetProfit, currency, hideValues)} ({assetProfitPercent >= 0 ? '+' : ''}{assetProfitPercent.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onEditInvestment(asset)}
                      title="Editar ativo"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deseja remover o ativo ${asset.ticker} da sua carteira?`)) {
                          deleteInvestment(asset.id);
                        }
                      }}
                      title="Excluir ativo"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
