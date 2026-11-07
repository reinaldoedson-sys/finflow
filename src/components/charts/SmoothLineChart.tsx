import React, { useState, useEffect } from 'react';
import { CurrencyCode } from '../../types/finance';
import { formatCurrency } from '../../utils/currency';
import { formatCompactCurrency } from '../../utils/compactCurrency';

export interface SmoothLineItem {
  month: number; // 1 a 12
  income: number;
  expense: number;
  balance: number;
}

interface SmoothLineChartProps {
  data: SmoothLineItem[];
  currency: CurrencyCode;
  hideValues: boolean;
  selectedMonth?: number | null;
  onSelectMonth?: (month: number) => void;
  isProjected?: (month: number) => boolean;
  ariaLabel: string;
}

const MONTH_NAMES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export const SmoothLineChart: React.FC<SmoothLineChartProps> = ({
  data,
  currency,
  hideValues,
  selectedMonth = null,
  onSelectMonth,
  isProjected,
  ariaLabel,
}) => {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Limpa o hover sempre que a seleção de mês mudar
  useEffect(() => {
    setHoveredMonth(null);
  }, [selectedMonth]);

  const activeIndex = hoveredMonth !== null
    ? hoveredMonth - 1
    : selectedMonth !== null
      ? selectedMonth - 1
      : null;

  const width = 760;
  const height = 280;
  const padLeft = 75;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Encontra o valor máximo entre receitas e despesas
  let maxVal = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  for (const item of data) {
    if (item.income > maxVal) maxVal = item.income;
    if (item.expense > maxVal) maxVal = item.expense;
    totalIncome += item.income;
    totalExpense += item.expense;
  }
  const totalBalance = totalIncome - totalExpense;

  if (maxVal <= 0) maxVal = 1000;
  maxVal = maxVal * 1.15; // 15% de folga no topo

  // Verifica se há ao menos um mês previsto com valor diferente de zero
  const hasProjectedWithValues = data.some(item => {
    const projected = isProjected ? isProjected(item.month) : false;
    return projected && (item.income > 0 || item.expense > 0);
  });

  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  const colW = chartW / 12;

  // Pontos de Receita e Despesa
  const incomePoints = data.map((item, idx) => {
    const x = padLeft + idx * colW + colW / 2;
    const y = padTop + chartH - (item.income / maxVal) * chartH;
    return { x, y };
  });

  const expensePoints = data.map((item, idx) => {
    const x = padLeft + idx * colW + colW / 2;
    const y = padTop + chartH - (item.expense / maxVal) * chartH;
    return { x, y };
  });

  // Divisão entre segmentos realizados e previstos (para traçado tracejado no futuro)
  let lastRealizedIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if (!isProjected || !isProjected(data[i].month)) {
      lastRealizedIdx = i;
    }
  }

  let realizedIncomePts: { x: number; y: number }[] = [];
  let projectedIncomePts: { x: number; y: number }[] = [];
  let realizedExpensePts: { x: number; y: number }[] = [];
  let projectedExpensePts: { x: number; y: number }[] = [];

  if (lastRealizedIdx === -1) {
    // Todos os meses são previstos
    projectedIncomePts = incomePoints;
    projectedExpensePts = expensePoints;
  } else if (lastRealizedIdx === data.length - 1) {
    // Todos os meses são realizados
    realizedIncomePts = incomePoints;
    realizedExpensePts = expensePoints;
  } else {
    // Parte realizada e parte prevista conectadas
    realizedIncomePts = incomePoints.slice(0, lastRealizedIdx + 1);
    projectedIncomePts = incomePoints.slice(lastRealizedIdx);
    realizedExpensePts = expensePoints.slice(0, lastRealizedIdx + 1);
    projectedExpensePts = expensePoints.slice(lastRealizedIdx);
  }

  const realizedIncomePath = buildSmoothPath(realizedIncomePts);
  const projectedIncomePath = buildSmoothPath(projectedIncomePts);
  const realizedExpensePath = buildSmoothPath(realizedExpensePts);
  const projectedExpensePath = buildSmoothPath(projectedExpensePts);

  const activeItem = activeIndex !== null && data[activeIndex] ? data[activeIndex] : null;
  const activeIsProjected = activeItem && isProjected ? isProjected(activeItem.month) : false;

  return (
    <div 
      className="relative w-full select-none"
      onMouseLeave={() => setHoveredMonth(null)}
    >
      {/* Legenda e Tooltip dinâmico */}
      <div className="flex items-center justify-between mb-2 px-1 text-xs min-h-[28px] flex-wrap gap-2">
        <div className="flex items-center gap-4 text-slate-400 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-300">Receitas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-300">Despesas</span>
          </div>
          {hasProjectedWithValues && (
            <div className="flex items-center gap-1.5" title="Parcelas e lançamentos com competência futura">
              <span className="w-3.5 h-0 border-t-2 border-dashed border-amber-400 inline-block" />
              <span className="text-[11px] font-medium text-amber-300/90">
                Previsto (parcelas e lançamentos futuros)
              </span>
            </div>
          )}
        </div>

        {activeItem ? (
          <div className={`flex items-center gap-2.5 font-mono text-xs px-3 py-1 rounded-lg shadow-sm border ${
            activeIsProjected 
              ? 'bg-slate-900/95 border-amber-500/50' 
              : 'bg-slate-900/95 border-emerald-500/40'
          }`}>
            <span className="font-sans font-semibold text-white flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${activeIsProjected ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
              {MONTH_NAMES[activeItem.month - 1]}
              {activeIsProjected ? ' (previsto)' : ''}
              {selectedMonth === activeItem.month ? ' (selecionado)' : ''}:
            </span>
            <span className="text-emerald-400 font-semibold">
              +{formatCurrency(activeItem.income, currency, hideValues)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400 font-semibold">
              -{formatCurrency(activeItem.expense, currency, hideValues)}
            </span>
            <span className="text-slate-600">|</span>
            <span className={`font-semibold ${activeItem.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {activeItem.balance >= 0 ? '+' : ''}{formatCurrency(activeItem.balance, currency, hideValues)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span className="font-sans text-slate-400">Total do ano:</span>
            <span className="text-emerald-400 font-semibold">
              +{formatCurrency(totalIncome, currency, hideValues)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400 font-semibold">
              -{formatCurrency(totalExpense, currency, hideValues)}
            </span>
            <span className="text-slate-600">|</span>
            <span className={`font-semibold ${totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalBalance >= 0 ? '+' : ''}{formatCurrency(totalBalance, currency, hideValues)}
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible block"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Linhas de grade e valores do Eixo Y */}
        {yTicks.map((val, idx) => {
          const y = padTop + chartH - (val / maxVal) * chartH;
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#1e293b"
                strokeDasharray={idx === 0 ? 'none' : '3 3'}
                strokeWidth="1"
              />
              <text
                x={padLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="text-[11px] fill-slate-500 font-mono"
              >
                {formatCompactCurrency(val, currency, hideValues)}
              </text>
            </g>
          );
        })}

        {/* Linha vertical do mês ativo/selecionado */}
        {activeIndex !== null && incomePoints[activeIndex] && (
          <line
            x1={incomePoints[activeIndex].x}
            y1={padTop}
            x2={incomePoints[activeIndex].x}
            y2={padTop + chartH}
            stroke="#475569"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
        )}

        {/* Curvas Realizadas (Traço Contínuo) */}
        {realizedIncomePath && (
          <path
            d={realizedIncomePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {realizedExpensePath && (
          <path
            d={realizedExpensePath}
            fill="none"
            stroke="#f43f5e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Curvas Previstas (Traço Tracejado) */}
        {projectedIncomePath && (
          <path
            d={projectedIncomePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        )}
        {projectedExpensePath && (
          <path
            d={projectedExpensePath}
            fill="none"
            stroke="#f43f5e"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        )}

        {/* Pontos nas intersecções de cada mês */}
        {data.map((item, idx) => {
          const incPt = incomePoints[idx];
          const expPt = expensePoints[idx];
          const isSelected = selectedMonth === item.month;
          const isHovered = hoveredMonth === item.month;
          const isActive = isSelected || isHovered;
          const isDimmed = selectedMonth !== null && !isActive;
          const isProj = isProjected ? isProjected(item.month) : false;

          const colX = padLeft + idx * colW;

          return (
            <g
              key={item.month}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredMonth(item.month)}
              onMouseLeave={() => setHoveredMonth(null)}
              onClick={() => onSelectMonth && onSelectMonth(item.month)}
            >
              {/* Moldura de destaque da coluna se o mês estiver selecionado */}
              {isSelected && (
                <rect
                  x={colX + 3}
                  y={padTop - 6}
                  width={colW - 6}
                  height={chartH + 12}
                  fill={isProj ? "rgba(245, 158, 11, 0.08)" : "rgba(16, 185, 129, 0.08)"}
                  stroke={isProj ? "rgba(245, 158, 11, 0.50)" : "rgba(16, 185, 129, 0.40)"}
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  rx="6"
                />
              )}

              {/* Área invisível ampla para clique/hover */}
              <rect
                x={colX}
                y={padTop}
                width={colW}
                height={chartH + padBottom}
                fill={isHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent'}
                rx="6"
              />

              {/* Ponto Receita */}
              <circle
                cx={incPt.x}
                cy={incPt.y}
                r={isActive ? 5.5 : 3.5}
                fill="#10b981"
                stroke={isProj ? "#f59e0b" : "#0f172a"}
                strokeWidth={isProj ? 2 : isActive ? 2.5 : 1.5}
                className="transition-all duration-150"
                opacity={isActive ? 1 : isDimmed ? 0.35 : isProj ? 0.75 : 0.85}
              />

              {/* Ponto Despesa */}
              <circle
                cx={expPt.x}
                cy={expPt.y}
                r={isActive ? 5.5 : 3.5}
                fill="#f43f5e"
                stroke={isProj ? "#f59e0b" : "#0f172a"}
                strokeWidth={isProj ? 2 : isActive ? 2.5 : 1.5}
                className="transition-all duration-150"
                opacity={isActive ? 1 : isDimmed ? 0.35 : isProj ? 0.75 : 0.85}
              />

              {/* Rótulo do Mês no Eixo X */}
              {isSelected ? (
                <g>
                  <rect
                    x={incPt.x - 17}
                    y={height - 24}
                    width="34"
                    height="18"
                    fill={isProj ? "#f59e0b" : "#10b981"}
                    rx="4"
                  />
                  <text
                    x={incPt.x}
                    y={height - 11}
                    textAnchor="middle"
                    className="text-[11px] font-bold fill-slate-950 font-sans"
                  >
                    {MONTH_NAMES[idx]}
                  </text>
                </g>
              ) : (
                <text
                  x={incPt.x}
                  y={height - 12}
                  textAnchor="middle"
                  className={`text-[11px] font-medium transition-colors ${
                    isHovered
                      ? 'fill-white font-semibold'
                      : isDimmed
                      ? 'fill-slate-600'
                      : isProj
                      ? 'fill-amber-400/80 font-normal'
                      : 'fill-slate-400'
                  }`}
                >
                  {MONTH_NAMES[idx]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
