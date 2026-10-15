import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { formatCurrency } from '../utils/currency';
import { InvestmentAsset, AssetClass } from '../types/finance';
import { 
  calculatePortfolioMonitoring, 
  PortfolioMonitoringSummary
} from '../domain/portfolioMonitoring';
import { getDistinctCurrencies, SupportedInvestmentCurrency } from '../domain/investments';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  PieChart, 
  BarChart3, 
  Download, 
  Plus, 
  Building2, 
  Coins, 
  Landmark, 
  Layers, 
  Clock, 
  Search, 
  Sparkles,
  DollarSign,
  Activity,
  ChevronRight
} from 'lucide-react';
import { InvestmentDepositModal } from '../components/InvestmentDepositModal';
import { InvestmentDetailModal } from '../components/InvestmentDetailModal';
import { InvestmentTransactionModal } from '../components/InvestmentTransactionModal';

interface PortfolioMonitoringViewProps {
  onOpenNewInvestment?: () => void;
  onEditInvestment?: (asset: InvestmentAsset) => void;
  onNavigateToInvestments?: () => void;
}

const CLASS_COLORS: Record<AssetClass, { label: string; color: string; bg: string; text: string }> = {
  stock: { label: 'Ação', color: '#10b981', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  fii: { label: 'FII', color: '#3b82f6', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  crypto: { label: 'Cripto', color: '#f59e0b', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  fixed_income: { label: 'Renda Fixa', color: '#8b5cf6', bg: 'bg-purple-500/15', text: 'text-purple-400' },
  bdr_etf: { label: 'BDR / ETF', color: '#06b6d4', bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  other: { label: 'Outro', color: '#64748b', bg: 'bg-slate-700/40', text: 'text-slate-400' }
};

const SECTOR_PALETTE = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', 
  '#06b6d4', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#e11d48', '#0284c7', '#a855f7', '#d97706', '#64748b'
];

export const PortfolioMonitoringView: React.FC<PortfolioMonitoringViewProps> = ({
  onOpenNewInvestment,
  onEditInvestment,
  onNavigateToInvestments: _onNavigateToInvestments,
}) => {
  const { 
    investments, 
    investmentTransactions, 
    refreshInvestmentQuotes, 
    isRefreshingQuotes, 
    lastQuotesUpdate,
    loadSampleInvestments 
  } = useFinance();
  const { hideValues } = useSecurity();

  // Filtros e estados locais
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedInvestmentCurrency>('BRL');
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'sectors' | 'composition' | 'assets'>('overview');
  const [classFilter, setClassFilter] = useState<'all' | AssetClass>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais de apoio
  const [isAporteModalOpen, setIsAporteModalOpen] = useState(false);
  const [selectedAporteAssetId, setSelectedAporteAssetId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDetailAsset, setSelectedDetailAsset] = useState<InvestmentAsset | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTxAssetId] = useState<string | null>(null);

  // Moedas disponíveis
  const distinctCurrencies = useMemo(() => getDistinctCurrencies(investments), [investments]);
  const hasMultipleCurrencies = distinctCurrencies.length > 1;
  const activeCurrency: SupportedInvestmentCurrency = distinctCurrencies.includes(selectedCurrency) 
    ? selectedCurrency 
    : (distinctCurrencies[0] || 'BRL');

  // Cálculos do domínio
  const summary: PortfolioMonitoringSummary = useMemo(() => {
    return calculatePortfolioMonitoring(investments, investmentTransactions, activeCurrency);
  }, [investments, investmentTransactions, activeCurrency]);

  // Linhas filtradas de ativos para busca e classe
  const filteredAssetRows = useMemo(() => {
    return summary.assetRows.filter(row => {
      const matchClass = classFilter === 'all' || row.type === classFilter;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch = !term || 
        row.ticker.toLowerCase().includes(term) || 
        row.name.toLowerCase().includes(term) ||
        row.sector.toLowerCase().includes(term);
      return matchClass && matchSearch;
    });
  }, [summary.assetRows, classFilter, searchTerm]);

  // Exportar resumo em CSV para o usuário
  const handleExportCSV = () => {
    if (summary.assetRows.length === 0) return;
    const header = [
      'Ticker',
      'Nome',
      'Classe',
      'Setor / Segmento',
      'Quantidade',
      'Preço Médio (R$)',
      'Preço Atual (R$)',
      'Capital Investido (R$)',
      'Capital Atual (R$)',
      'Lucro Não Realizado (R$)',
      'Rentabilidade (%)',
      'Proventos Recebidos (R$)',
      'Lucro Realizado (R$)',
      'Retorno Total (R$)',
      'Retorno Total (%)',
      'Peso na Carteira (%)'
    ].join(';');

    const rows = summary.assetRows.map(r => [
      r.ticker,
      `"${r.name.replace(/"/g, '""')}"`,
      CLASS_COLORS[r.type]?.label || r.type,
      `"${r.sector.replace(/"/g, '""')}"`,
      r.quantity.toFixed(4).replace('.', ','),
      r.averagePrice.toFixed(2).replace('.', ','),
      r.currentPrice.toFixed(2).replace('.', ','),
      r.investedCost.toFixed(2).replace('.', ','),
      r.currentValue.toFixed(2).replace('.', ','),
      r.unrealizedProfit.toFixed(2).replace('.', ','),
      r.unrealizedProfitPercent.toFixed(2).replace('.', ','),
      r.dividends.toFixed(2).replace('.', ','),
      r.realizedProfit.toFixed(2).replace('.', ','),
      r.totalReturn.toFixed(2).replace('.', ','),
      r.totalReturnPercent.toFixed(2).replace('.', ','),
      r.portfolioWeightPercent.toFixed(2).replace('.', ',')
    ].join(';'));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [header, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `finflow_carteira_investimentos_${activeCurrency}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenAporte = (assetId: string | null = null) => {
    setSelectedAporteAssetId(assetId);
    setIsAporteModalOpen(true);
  };

  const handleOpenDetail = (asset: InvestmentAsset) => {
    setSelectedDetailAsset(asset);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner da Carteira */}
      <div className="p-4 sm:p-6 rounded-2xl bg-slate-900/70 border border-slate-800/90 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Painel Executivo
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                Ao Vivo
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Carteira de Investimentos & Monitoramento
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Acompanhamento de alocação por classe, setores, valorização e proventos
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {hasMultipleCurrencies && (
              <div className="flex items-center rounded-xl bg-slate-800/80 p-0.5 border border-slate-700">
                {distinctCurrencies.map(curr => (
                  <button
                    key={curr}
                    onClick={() => setSelectedCurrency(curr)}
                    className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all ${
                      activeCurrency === curr
                        ? 'bg-emerald-500 text-slate-950 shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => refreshInvestmentQuotes()}
              disabled={isRefreshingQuotes}
              className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
              title="Atualizar cotações de mercado da B3 e cripto"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshingQuotes ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar Cotações</span>
              <span className="sm:hidden">Atualizar</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={summary.assetRows.length === 0}
              className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-xs active:scale-95"
              title="Exportar dados da carteira em formato CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Exportar Planilha</span>
              <span className="sm:hidden">CSV</span>
            </button>

            <button
              onClick={() => handleOpenAporte(null)}
              className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <TrendingUp className="w-4 h-4 stroke-[2.5]" />
              <span>Aporte</span>
            </button>

            {onOpenNewInvestment && (
              <button
                onClick={onOpenNewInvestment}
                className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Novo Ativo</span>
              </button>
            )}
          </div>
        </div>

        {/* Timestamp de Cotações */}
        {lastQuotesUpdate && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cotações sincronizadas às <strong>{lastQuotesUpdate}</strong>. Valores salvos automaticamente.</span>
          </div>
        )}

        {/* 4 CARDS PRINCIPAIS EXATOS DA PLANILHA DO USUÁRIO */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-1">
          {/* Card 1: CAPITAL INVESTIDO */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/90 relative overflow-hidden">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-blue-400" />
              <span>Capital Investido</span>
            </div>
            <div className="text-lg sm:text-2xl font-black font-mono text-white">
              {formatCurrency(summary.totalInvestedCost, activeCurrency, hideValues)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Custo total de compra</span>
              <span className="font-mono text-slate-400">{summary.assetRows.length} ativos</span>
            </div>
          </div>

          {/* Card 2: CAPITAL ATUAL */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/90 relative overflow-hidden">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-emerald-400" />
              <span>Capital Atual</span>
            </div>
            <div className="text-lg sm:text-2xl font-black font-mono text-emerald-300">
              {formatCurrency(summary.totalCurrentValue, activeCurrency, hideValues)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Valor a mercado</span>
              <span className="font-mono text-emerald-400/90 font-semibold">100% da carteira</span>
            </div>
          </div>

          {/* Card 3: LUCRO NÃO REALIZADO */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/90 relative overflow-hidden">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              {summary.totalUnrealizedProfit >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>Lucro Não Realizado</span>
            </div>
            <div className={`text-lg sm:text-2xl font-black font-mono ${
              summary.totalUnrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {summary.totalUnrealizedProfit >= 0 ? '+' : ''}
              {formatCurrency(summary.totalUnrealizedProfit, activeCurrency, hideValues)}
            </div>
            <div className="text-[11px] font-mono font-bold mt-1 flex items-center justify-between">
              <span className="text-slate-500 font-sans font-normal">Valorização</span>
              <span className={summary.unrealizedProfitPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {summary.unrealizedProfitPercent >= 0 ? '+' : ''}{summary.unrealizedProfitPercent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Card 4: LUCRO REALIZADO */}
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/90 relative overflow-hidden">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span>Lucro Realizado</span>
            </div>
            <div className={`text-lg sm:text-2xl font-black font-mono ${
              summary.totalRealizedProfit >= 0 ? 'text-amber-300' : 'text-rose-400'
            }`}>
              {summary.totalRealizedProfit >= 0 ? '+' : ''}
              {formatCurrency(summary.totalRealizedProfit, activeCurrency, hideValues)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Vendas executadas</span>
              <span className="font-mono text-slate-400">
                Proventos: {formatCurrency(summary.totalDividends, activeCurrency, hideValues)}
              </span>
            </div>
          </div>
        </div>

        {/* Retorno Total Consolidado (Total Return = Valorização + Proventos + Vendas) */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white">Retorno Total Consolidado da Carteira</div>
              <div className="text-[11px] text-slate-400">
                Soma da valorização dos ativos em carteira + proventos recebidos + lucros realizados em vendas
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 font-mono">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Proventos Totais</div>
              <div className="text-sm font-bold text-emerald-400">
                {formatCurrency(summary.totalDividends, activeCurrency, hideValues)}
              </div>
            </div>
            <div className="w-px h-7 bg-slate-800" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Retorno Global</div>
              <div className={`text-sm font-black ${summary.totalPortfolioReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summary.totalPortfolioReturn >= 0 ? '+' : ''}{formatCurrency(summary.totalPortfolioReturn, activeCurrency, hideValues)} ({summary.totalPortfolioReturnPercent >= 0 ? '+' : ''}{summary.totalPortfolioReturnPercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subnavegação de Seções */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar text-xs">
        {[
          { id: 'overview', label: 'Visão Geral & Classes', icon: Layers },
          { id: 'sectors', label: 'Análise Setorial (Ações & FIIs)', icon: Building2 },
          { id: 'composition', label: 'Composição da Carteira', icon: PieChart },
          { id: 'assets', label: 'Resultado por Ativo', icon: BarChart3 },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-900 border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SEÇÃO 1: NÚMEROS POR CLASSE DE ATIVO */}
      {(activeTab === 'overview' || activeTab === 'classes') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Números por Classe de Ativo</span>
              </h2>
              <p className="text-xs text-slate-400">
                Performance, proventos e resultado realizado segregados por classe
              </p>
            </div>
          </div>

          {summary.classMetrics.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
              Nenhum ativo cadastrado para a moeda {activeCurrency}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Classe de Ativo</th>
                    <th className="py-3 px-4 text-right">Capital Investido</th>
                    <th className="py-3 px-4 text-right">Capital Atual</th>
                    <th className="py-3 px-4 text-right">Valorização (R$)</th>
                    <th className="py-3 px-4 text-right">Rentabilidade (%)</th>
                    <th className="py-3 px-4 text-right">Proventos</th>
                    <th className="py-3 px-4 text-right">Rentab. Total c/ Proventos</th>
                    <th className="py-3 px-4 text-right">Realizado (Vendas)</th>
                    <th className="py-3 px-4 text-right">Alocação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {summary.classMetrics.map(cm => {
                    const meta = CLASS_COLORS[cm.type] || CLASS_COLORS.other;
                    return (
                      <tr key={cm.type} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-sans font-bold flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                          <span className="text-white">{cm.label}</span>
                          <span className="text-[10px] font-mono text-slate-500 font-normal">({cm.count})</span>
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          {formatCurrency(cm.investedCost, activeCurrency, hideValues)}
                        </td>
                        <td className="py-3 px-4 text-right text-white font-bold">
                          {formatCurrency(cm.currentValue, activeCurrency, hideValues)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${
                          cm.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {cm.unrealizedProfit >= 0 ? '+' : ''}{formatCurrency(cm.unrealizedProfit, activeCurrency, hideValues)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${
                          cm.unrealizedProfitPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {cm.unrealizedProfitPercent >= 0 ? '+' : ''}{cm.unrealizedProfitPercent.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-400">
                          {formatCurrency(cm.dividends, activeCurrency, hideValues)}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${
                          cm.totalReturnPercent >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}>
                          {cm.totalReturnPercent >= 0 ? '+' : ''}{cm.totalReturnPercent.toFixed(2)}%
                        </td>
                        <td className={`py-3 px-4 text-right ${
                          cm.realizedProfit > 0 ? 'text-amber-400' : cm.realizedProfit < 0 ? 'text-rose-400' : 'text-slate-400'
                        }`}>
                          {formatCurrency(cm.realizedProfit, activeCurrency, hideValues)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-white font-bold">{cm.allocationPercent.toFixed(1)}%</span>
                            <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden hidden sm:block">
                              <div 
                                className="h-full rounded-full" 
                                style={{ width: `${Math.min(100, cm.allocationPercent)}%`, backgroundColor: meta.color }} 
                              />
                            </div>
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
      )}

      {/* SEÇÃO 2: ANÁLISE SETORIAL (AÇÕES POR SETOR & FIIS POR SETOR) */}
      {(activeTab === 'overview' || activeTab === 'sectors') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card: AÇÕES POR SETOR */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                  Ações por Setor
                </h3>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-400">
                {summary.stockSectors.length} setor(es)
              </span>
            </div>

            {summary.stockSectors.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-950/40 text-slate-500 text-xs">
                Nenhuma ação cadastrada na carteira.
              </div>
            ) : (
              <div className="space-y-3">
                {summary.stockSectors.map((sector, idx) => {
                  const color = SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
                  return (
                    <div key={sector.sector} className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="truncate max-w-[180px] sm:max-w-[260px]">{sector.sector}</span>
                          <span className="text-[10px] text-slate-500 font-mono font-normal">({sector.count} ação)</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-white font-bold">
                            {formatCurrency(sector.currentValue, activeCurrency, hideValues)}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-1.5 font-semibold">
                            ({sector.classAllocationPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, sector.classAllocationPercent)}%`, backgroundColor: color }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-0.5">
                        <span>Custo: {formatCurrency(sector.investedCost, activeCurrency, hideValues)}</span>
                        <span className={sector.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          Valorização: {sector.unrealizedProfit >= 0 ? '+' : ''}{formatCurrency(sector.unrealizedProfit, activeCurrency, hideValues)} ({sector.unrealizedProfitPercent >= 0 ? '+' : ''}{sector.unrealizedProfitPercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card: FIIS POR SETOR / SEGMENTO */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                  FIIs por Setor / Segmento
                </h3>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-400">
                {summary.fiiSegments.length} segmento(s)
              </span>
            </div>

            {summary.fiiSegments.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-950/40 text-slate-500 text-xs">
                Nenhum FII cadastrado na carteira.
              </div>
            ) : (
              <div className="space-y-3">
                {summary.fiiSegments.map((seg, idx) => {
                  const color = SECTOR_PALETTE[(idx + 4) % SECTOR_PALETTE.length];
                  return (
                    <div key={seg.sector} className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="truncate max-w-[180px] sm:max-w-[260px]">{seg.sector}</span>
                          <span className="text-[10px] text-slate-500 font-mono font-normal">({seg.count} fundo)</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-white font-bold">
                            {formatCurrency(seg.currentValue, activeCurrency, hideValues)}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-1.5 font-semibold">
                            ({seg.classAllocationPercent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, seg.classAllocationPercent)}%`, backgroundColor: color }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-0.5">
                        <span>Custo: {formatCurrency(seg.investedCost, activeCurrency, hideValues)}</span>
                        <span className={seg.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          Valorização: {seg.unrealizedProfit >= 0 ? '+' : ''}{formatCurrency(seg.unrealizedProfit, activeCurrency, hideValues)} ({seg.unrealizedProfitPercent >= 0 ? '+' : ''}{seg.unrealizedProfitPercent.toFixed(1)}%)
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

      {/* SEÇÃO 3: COMPOSIÇÃO DA CARTEIRA */}
      {(activeTab === 'overview' || activeTab === 'composition') && (
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-400" />
                <span>Composição da Carteira</span>
              </h2>
              <p className="text-xs text-slate-400">
                Distribuição percentual de cada ativo no patrimônio total
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              Total: {formatCurrency(summary.totalCurrentValue, activeCurrency, hideValues)}
            </span>
          </div>

          {summary.assetRows.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-950/40 text-slate-500 text-xs">
              Nenhum ativo cadastrado.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Barra segmentada horizontal da carteira */}
              <div className="w-full h-4 rounded-full bg-slate-800 overflow-hidden flex shadow-inner">
                {summary.assetRows.map((r, idx) => {
                  const color = SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
                  return (
                    <div
                      key={r.asset.id}
                      title={`${r.ticker}: ${r.portfolioWeightPercent.toFixed(1)}% (${formatCurrency(r.currentValue, activeCurrency, hideValues)})`}
                      style={{ width: `${r.portfolioWeightPercent}%`, backgroundColor: color }}
                      className="h-full transition-all hover:opacity-85 hover:scale-y-110 cursor-pointer"
                    />
                  );
                })}
              </div>

              {/* Grid de fatias de ativos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
                {summary.assetRows.map((r, idx) => {
                  const color = SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
                  return (
                    <div
                      key={r.asset.id}
                      onClick={() => handleOpenDetail(r.asset)}
                      className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="font-mono font-black text-white text-xs truncate group-hover:text-emerald-300">
                            {r.ticker}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0">
                          {r.portfolioWeightPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {r.sector}
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                        {formatCurrency(r.currentValue, activeCurrency, hideValues)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO 4: EVOLUÇÃO & RESULTADO POR ATIVO */}
      {(activeTab === 'overview' || activeTab === 'assets') && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Resultado por Ativo</span>
              </h2>
              <p className="text-xs text-slate-400">
                Capital investido, cotação atual, valorização, proventos e retorno acumulado
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Barra de Busca */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Filtrar ticker ou setor..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44 sm:w-56"
                />
              </div>

              {/* Filtro por Classe */}
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">Todas as Classes</option>
                <option value="stock">Ações</option>
                <option value="fii">FIIs</option>
                <option value="crypto">Cripto</option>
                <option value="fixed_income">Renda Fixa</option>
                <option value="bdr_etf">BDR / ETF</option>
              </select>
            </div>
          </div>

          {filteredAssetRows.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
              <div className="text-slate-400 text-xs">
                Nenhum ativo encontrado com os critérios de filtro informados.
              </div>
              {investments.length === 0 && (
                <button
                  onClick={() => loadSampleInvestments()}
                  className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Carregar Carteira Exemplo (PETR4, MXRF11, BTC)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xs">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Ativo</th>
                    <th className="py-3 px-4">Setor / Segmento</th>
                    <th className="py-3 px-4 text-right">Qtd</th>
                    <th className="py-3 px-4 text-right">Preço Médio</th>
                    <th className="py-3 px-4 text-right">Cotação Atual</th>
                    <th className="py-3 px-4 text-right">Capital Investido</th>
                    <th className="py-3 px-4 text-right">Capital Atual</th>
                    <th className="py-3 px-4 text-right">Lucro Não Realizado</th>
                    <th className="py-3 px-4 text-right">Proventos</th>
                    <th className="py-3 px-4 text-right">Retorno Total</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {filteredAssetRows.map(row => {
                    const meta = CLASS_COLORS[row.type] || CLASS_COLORS.other;
                    return (
                      <tr 
                        key={row.asset.id} 
                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                        onClick={() => handleOpenDetail(row.asset)}
                      >
                        <td className="py-3.5 px-4 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-white text-sm group-hover:text-emerald-300 transition-colors">
                              {row.ticker}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${meta.bg} ${meta.text} border-current/20`}>
                              {meta.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                            {row.name}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-sans text-slate-300 text-xs">
                          {row.sector}
                        </td>

                        <td className="py-3.5 px-4 text-right text-slate-200">
                          {row.quantity}
                        </td>

                        <td className="py-3.5 px-4 text-right text-slate-400">
                          {formatCurrency(row.averagePrice, activeCurrency, hideValues)}
                        </td>

                        <td className="py-3.5 px-4 text-right text-white font-bold">
                          {formatCurrency(row.currentPrice, activeCurrency, hideValues)}
                        </td>

                        <td className="py-3.5 px-4 text-right text-slate-300">
                          {formatCurrency(row.investedCost, activeCurrency, hideValues)}
                        </td>

                        <td className="py-3.5 px-4 text-right text-emerald-300 font-bold">
                          {formatCurrency(row.currentValue, activeCurrency, hideValues)}
                        </td>

                        <td className={`py-3.5 px-4 text-right font-bold ${
                          row.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          <div>{row.unrealizedProfit >= 0 ? '+' : ''}{formatCurrency(row.unrealizedProfit, activeCurrency, hideValues)}</div>
                          <div className="text-[10px]">({row.unrealizedProfitPercent >= 0 ? '+' : ''}{row.unrealizedProfitPercent.toFixed(2)}%)</div>
                        </td>

                        <td className="py-3.5 px-4 text-right text-emerald-400">
                          {formatCurrency(row.dividends, activeCurrency, hideValues)}
                        </td>

                        <td className={`py-3.5 px-4 text-right font-black ${
                          row.totalReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}>
                          <div>{row.totalReturn >= 0 ? '+' : ''}{formatCurrency(row.totalReturn, activeCurrency, hideValues)}</div>
                          <div className="text-[10px]">({row.totalReturnPercent >= 0 ? '+' : ''}{row.totalReturnPercent.toFixed(2)}%)</div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-sans" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenAporte(row.asset.id)}
                              className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer"
                              title="Aporte no ativo"
                            >
                              Aporte
                            </button>
                            <button
                              onClick={() => handleOpenDetail(row.asset)}
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Ver detalhes e extrato"
                            >
                              <ChevronRight className="w-4 h-4" />
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
      )}

      {/* Modais de interação */}
      <InvestmentDepositModal
        isOpen={isAporteModalOpen}
        onClose={() => setIsAporteModalOpen(false)}
        initialAssetId={selectedAporteAssetId}
      />

      <InvestmentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDetailAsset(null);
        }}
        asset={selectedDetailAsset}
        onEditAsset={(asset: InvestmentAsset) => {
          setIsDetailModalOpen(false);
          if (onEditInvestment) onEditInvestment(asset);
        }}
        onOpenAporte={(assetId: string) => {
          setIsDetailModalOpen(false);
          handleOpenAporte(assetId);
        }}
      />

      <InvestmentTransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        initialAssetId={selectedTxAssetId}
      />
    </div>
  );
};
