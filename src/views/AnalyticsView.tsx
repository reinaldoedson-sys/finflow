import React, { useState, useMemo, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useSecurity } from '../context/SecurityContext';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Calendar,
  Layers,
  Sparkles,
  BarChart2,
  CalendarRange
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { todayLocalISO } from '../utils/localDate';
import { 
  getAnalyticsYears, 
  computeMonthlySeries, 
  computePeriodTotals,
  isProjectedMonth
} from '../domain/analytics';
import { SparklineChart } from '../components/charts/SparklineChart';
import { GroupedBarChart, GroupedBarMode } from '../components/charts/GroupedBarChart';
import { SmoothLineChart } from '../components/charts/SmoothLineChart';
import { CategoryBreakdownSection } from '../components/analytics/CategoryBreakdownSection';

// Constantes de cores do painel (conforme diretrizes)
const COLOR_INCOME = '#10b981'; // receitas esmeralda
const COLOR_EXPENSE = '#f43f5e'; // despesas rosa/vermelho
const COLOR_OTHER_INCOME = '#6366f1'; // outras receitas índigo
const COLOR_BALANCE = '#0ea5e9'; // saldo azul celeste

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

const MONTH_NAMES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const AnalyticsView: React.FC = () => {
  const { 
    transactions, 
    categories, 
    accounts, 
    creditCards, 
    currency, 
    selectedMonth: headerMonth, 
    setSelectedMonth: setGlobalMonth 
  } = useFinance();
  const { hideValues } = useSecurity();

  const todayStr = useMemo(() => todayLocalISO(), []);
  const currentYear = useMemo(() => parseInt(todayStr.slice(0, 4), 10), [todayStr]);
  const currentMonthNum = useMemo(() => parseInt(todayStr.slice(5, 7), 10), [todayStr]);

  // Lista de anos com lançamentos + ano atual
  const availableYears = useMemo(() => {
    return getAnalyticsYears(transactions, todayStr);
  }, [transactions, todayStr]);

  // Inicializa o filtro de ano com base no mês do cabeçalho
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const headerYear = parseInt(headerMonth.slice(0, 4), 10);
    return !isNaN(headerYear) && headerYear > 1900 ? headerYear : currentYear;
  });

  // Filtro de mês: se o ano selecionado for o atual, padrão é o mês do cabeçalho / atual; senão, 'Ano inteiro' (null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => {
    const headerYear = parseInt(headerMonth.slice(0, 4), 10);
    const headerM = parseInt(headerMonth.slice(5, 7), 10);
    if (headerYear === currentYear) {
      return !isNaN(headerM) && headerM >= 1 && headerM <= 12 ? headerM : currentMonthNum;
    }
    return !isNaN(headerM) && headerM >= 1 && headerM <= 12 ? headerM : null;
  });

  // Seletor de modo do gráfico "Análise mensal" ('income_expense' por padrão ou 'salary_other')
  const [groupedBarMode, setGroupedBarMode] = useState<GroupedBarMode>('income_expense');

  // Sincronização automática quando o mês do cabeçalho mudar (via carrossel < Mês/Ano >)
  useEffect(() => {
    if (!headerMonth) return;
    const [yStr, mStr] = headerMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!isNaN(y) && y > 1900) {
      setSelectedYear(y);
    }
    if (!isNaN(m) && m >= 1 && m <= 12) {
      setSelectedMonth(m);
    }
  }, [headerMonth]);

  // Manipulador de seleção de mês: atualiza estado local e sincroniza com o cabeçalho global
  const handleSelectMonth = (month: number | null) => {
    setSelectedMonth(month);
    if (month !== null && setGlobalMonth) {
      const monthStr = `${selectedYear}-${String(month).padStart(2, '0')}`;
      if (monthStr !== headerMonth) {
        setGlobalMonth(monthStr);
      }
    }
  };

  // Manipulador de troca de ano: sincroniza o mês padrão segundo a regra
  const handleSelectYear = (year: number) => {
    setSelectedYear(year);
    if (year === currentYear) {
      setSelectedMonth(currentMonthNum);
      if (setGlobalMonth) {
        setGlobalMonth(`${year}-${String(currentMonthNum).padStart(2, '0')}`);
      }
    } else {
      setSelectedMonth(null);
    }
  };

  // Cálculo da série mensal (12 itens)
  const monthlySeries = useMemo(() => {
    return computeMonthlySeries(transactions, selectedYear);
  }, [transactions, selectedYear]);

  // Totais do período (mês escolhido ou ano inteiro)
  const totals = useMemo(() => {
    return computePeriodTotals(monthlySeries, selectedMonth);
  }, [monthlySeries, selectedMonth]);

  // Séries para os Sparklines dos 12 meses
  const incomeSparkline = useMemo(() => monthlySeries.map(s => s.income), [monthlySeries]);
  const expenseSparkline = useMemo(() => monthlySeries.map(s => s.expense), [monthlySeries]);
  const balanceSparkline = useMemo(() => monthlySeries.map(s => s.balance), [monthlySeries]);

  // Verifica se o ano possui alguma movimentação
  const hasTransactionsInYear = useMemo(() => {
    return monthlySeries.some(s => s.income > 0 || s.expense > 0);
  }, [monthlySeries]);

  const isWholeYear = selectedMonth === null;
  const periodLabelSuffix = isWholeYear ? 'do ano' : 'do mês';
  const periodDescription = isWholeYear
    ? `Ano de ${selectedYear}`
    : `${MONTH_NAMES_FULL[selectedMonth - 1]} de ${selectedYear}`;

  return (
    <div className="space-y-6 pb-20">
      {/* Cabeçalho da Visão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-400" />
              Painel de Análises
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              {periodDescription}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Visão consolidada anual e mensal de receitas, despesas, salários e evolução do saldo.
          </p>
        </div>
      </div>

      {/* FILTROS NO MOBILE (< md): faixas de botões roláveis na horizontal */}
      <div className="md:hidden space-y-2.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
        {/* Faixa de Anos */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
            Ano
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {availableYears.map(year => {
              const isActive = year === selectedYear;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleSelectYear(year)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
        </div>

        {/* Faixa de Meses */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
            Mês
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => handleSelectMonth(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] ${
                selectedMonth === null
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
              }`}
            >
              Ano inteiro
            </button>
            {MONTH_NAMES_SHORT.map((name, idx) => {
              const mNum = idx + 1;
              const isActive = selectedMonth === mNum;
              return (
                <button
                  key={mNum}
                  type="button"
                  onClick={() => handleSelectMonth(mNum)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* LAYOUT PRINCIPAL: Coluna de Filtros (md+) + Conteúdo/Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: Filtros no Desktop (md+) */}
        <aside className="hidden md:block md:col-span-3 space-y-4 sticky top-20">
          {/* Caixa de Anos */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ano</span>
            </div>
            <div className="space-y-1">
              {availableYears.map(year => {
                const isActive = year === selectedYear;
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleSelectYear(year)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <span>{year}</span>
                    {year === currentYear && (
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                        isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}>
                        Atual
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Caixa de Meses */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <CalendarRange className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mês de {selectedYear}</span>
              </div>
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleSelectMonth(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectedMonth === null
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span>Ano inteiro</span>
                <Layers className="w-3 h-3" />
              </button>

              <div className="pt-1 border-t border-slate-800/80 grid grid-cols-2 gap-1">
                {MONTH_NAMES_SHORT.map((name, idx) => {
                  const mNum = idx + 1;
                  const isActive = selectedMonth === mNum;
                  return (
                    <button
                      key={mNum}
                      type="button"
                      onClick={() => handleSelectMonth(mNum)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium text-center transition-colors ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* COLUNA DIREITA: Cartões e Gráficos */}
        <div className="md:col-span-9 space-y-6">
          {/* 3 Cartões de KPI com Sparklines dos 12 meses */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Receitas */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                    Receitas {periodLabelSuffix}
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                  +{formatCurrency(totals.income, currency, hideValues)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: COLOR_INCOME }} />
                    <span>Salário: {formatCurrency(totals.salary, currency, hideValues)}</span>
                  </span>
                  <span className="text-slate-600 hidden sm:inline">·</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: COLOR_OTHER_INCOME }} />
                    <span>Outras: {formatCurrency(totals.otherIncome, currency, hideValues)}</span>
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500 block mb-1">Evolução no ano:</span>
                <SparklineChart
                  data={incomeSparkline}
                  color={COLOR_INCOME}
                  ariaLabel={`Evolução das receitas mês a mês de ${selectedYear}`}
                />
              </div>
            </div>

            {/* Card 2: Despesas */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                    Despesas {periodLabelSuffix}
                  </span>
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <TrendingDown className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-rose-400 tracking-tight">
                  -{formatCurrency(totals.expense, currency, hideValues)}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: COLOR_EXPENSE }} />
                  <span>Total realizado no período</span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500 block mb-1">Evolução no ano:</span>
                <SparklineChart
                  data={expenseSparkline}
                  color={COLOR_EXPENSE}
                  ariaLabel={`Evolução das despesas mês a mês de ${selectedYear}`}
                />
              </div>
            </div>

            {/* Card 3: Saldo / Resultado */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                    Saldo {periodLabelSuffix}
                  </span>
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <Wallet className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className={`text-2xl font-bold font-mono tracking-tight ${
                  totals.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {totals.balance >= 0 ? '+' : ''}{formatCurrency(totals.balance, currency, hideValues)}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <span>Poupança: <strong className="text-slate-200">{totals.savingsRate}%</strong></span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500 block mb-1">Evolução no ano:</span>
                <SparklineChart
                  data={balanceSparkline}
                  color={totals.balance >= 0 ? COLOR_BALANCE : COLOR_EXPENSE}
                  ariaLabel={`Evolução do saldo mês a mês de ${selectedYear}`}
                />
              </div>
            </div>
          </div>

          {/* Estado Vazio Amigável se não houver movimentações no ano */}
          {!hasTransactionsInYear && (
            <div className="p-6 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
              <Sparkles className="w-6 h-6 text-slate-500 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">
                Nenhum lançamento registrado em {selectedYear}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Não foram encontrados lançamentos realizados para este ano. À medida que você registrar
                receitas e despesas, os gráficos serão atualizados automaticamente.
              </p>
            </div>
          )}

          {/* Gráfico 1: "Análise mensal" (GroupedBarChart com seletor de modo) */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                  <span>Análise mensal</span>
                  <span className="text-xs text-slate-400 font-normal">
                    {groupedBarMode === 'income_expense' 
                      ? '(Receitas × Despesas)' 
                      : '(Salário × Outras receitas)'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {groupedBarMode === 'income_expense'
                    ? (selectedMonth !== null
                        ? `Comparativo de receitas e despesas com foco em ${MONTH_NAMES_FULL[selectedMonth - 1]} de ${selectedYear}. Toque em qualquer coluna para alternar o mês.`
                        : `Comparativo mensal de receitas e despesas em ${selectedYear}. Toque em qualquer coluna para alternar o mês.`)
                    : (selectedMonth !== null
                        ? `Composição de entradas com foco em ${MONTH_NAMES_FULL[selectedMonth - 1]} de ${selectedYear}. Toque em qualquer coluna para alternar o mês.`
                        : `Comparação mensal da composição das entradas em ${selectedYear}. Toque em qualquer coluna para alternar o mês.`)}
                </p>
              </div>

              {/* Seletor do gráfico: "Receitas × Despesas" (padrão) e "Salário × Outras receitas" */}
              <div 
                className="flex items-center p-0.5 rounded-lg bg-slate-950/80 border border-slate-800 self-start sm:self-auto shrink-0"
                role="group"
                aria-label="Modo de visualização da Análise mensal"
              >
                <button
                  type="button"
                  onClick={() => setGroupedBarMode('income_expense')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    groupedBarMode === 'income_expense'
                      ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Receitas × Despesas
                </button>
                <button
                  type="button"
                  onClick={() => setGroupedBarMode('salary_other')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    groupedBarMode === 'salary_other'
                      ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Salário × Outras receitas
                </button>
              </div>
            </div>

            <GroupedBarChart
              data={monthlySeries}
              mode={groupedBarMode}
              currency={currency}
              hideValues={hideValues}
              selectedMonth={selectedMonth}
              onSelectMonth={(m) => handleSelectMonth(m === selectedMonth ? null : m)}
              isProjected={(m) => isProjectedMonth(selectedYear, m, todayStr)}
              ariaLabel={`Gráfico de barras agrupadas comparando ${groupedBarMode === 'income_expense' ? 'receitas e despesas' : 'salário e outras receitas'} por mês de ${selectedYear}`}
            />
          </div>

          {/* Gráfico 2: "Receitas e despesas" (SmoothLineChart) */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                  <span>Receitas e despesas</span>
                  <span className="text-xs text-slate-400 font-normal">
                    (Curvas comparativas no ano de {selectedYear})
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {selectedMonth !== null
                    ? `Curvas anuais com foco em ${MONTH_NAMES_FULL[selectedMonth - 1]} de ${selectedYear}.`
                    : `Acompanhe a relação entre o total recebido e os gastos realizados mês a mês em ${selectedYear}.`}
                </p>
              </div>
            </div>

            <SmoothLineChart
              data={monthlySeries}
              currency={currency}
              hideValues={hideValues}
              selectedMonth={selectedMonth}
              onSelectMonth={(m) => handleSelectMonth(m === selectedMonth ? null : m)}
              isProjected={(m) => isProjectedMonth(selectedYear, m, todayStr)}
              ariaLabel={`Curvas suaves de receitas e despesas mês a mês de ${selectedYear}`}
            />
          </div>

          {/* Gráfico 3 & Detalhamento: Rosca e Ranking de Categorias + Maiores Gastos */}
          <CategoryBreakdownSection
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            creditCards={creditCards}
            year={selectedYear}
            month={selectedMonth}
            currency={currency}
            hideValues={hideValues}
          />
        </div>
      </div>
    </div>
  );
};
