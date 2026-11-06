import React, { useState } from 'react';
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
  ariaLabel,
}) => {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

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
  for (const item of data) {
    if (item.income > maxVal) maxVal = item.income;
    if (item.expense > maxVal) maxVal = item.expense;
  }
  if (maxVal <= 0) maxVal = 1000;
  maxVal = maxVal * 1.15; // 15% de folga no topo

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

  const incomePath = buildSmoothPath(incomePoints);
  const expensePath = buildSmoothPath(expensePoints);

  const activeItem = activeIndex !== null && data[activeIndex] ? data[activeIndex] : null;

  return (
    <div className="relative w-full select-none">
      {/* Legenda e Tooltip dinâmico */}
      <div className="flex items-center justify-between mb-2 px-1 text-xs min-h-[24px]">
        <div className="flex items-center gap-4 text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-300">Receitas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-300">Despesas</span>
          </div>
        </div>

        {activeItem ? (
          <div className="flex items-center gap-3 font-mono text-xs bg-slate-900/90 border border-slate-700/80 px-2.5 py-1 rounded-lg shadow-sm">
            <span className="font-sans font-semibold text-white">
              {MONTH_NAMES[activeItem.month - 1]}:
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
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Passe o mouse ou toque para detalhes
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible block"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="income-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="expense-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
          </linearGradient>
        </defs>

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

        {/* Curva de Receitas (Esmeralda) */}
        <path
          d={incomePath}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Curva de Despesas (Rosa) */}
        <path
          d={expensePath}
          fill="none"
          stroke="#f43f5e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pontos nas intersecções de cada mês */}
        {data.map((item, idx) => {
          const incPt = incomePoints[idx];
          const expPt = expensePoints[idx];
          const isSelected = selectedMonth === item.month;
          const isHovered = hoveredMonth === item.month;
          const isActive = isSelected || isHovered;

          const colX = padLeft + idx * colW;

          return (
            <g
              key={item.month}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredMonth(item.month)}
              onMouseLeave={() => setHoveredMonth(null)}
              onClick={() => onSelectMonth && onSelectMonth(item.month)}
            >
              {/* Área invisível ampla para clique/hover */}
              <rect
                x={colX}
                y={padTop}
                width={colW}
                height={chartH + padBottom}
                fill={isHovered ? 'rgba(255, 255, 255, 0.03)' : isSelected ? 'rgba(16, 185, 129, 0.05)' : 'transparent'}
                rx="6"
              />

              {/* Ponto Receita */}
              <circle
                cx={incPt.x}
                cy={incPt.y}
                r={isActive ? 5.5 : 3.5}
                fill="#10b981"
                stroke="#0f172a"
                strokeWidth={isActive ? 2.5 : 1.5}
                className="transition-all duration-150"
              />

              {/* Ponto Despesa */}
              <circle
                cx={expPt.x}
                cy={expPt.y}
                r={isActive ? 5.5 : 3.5}
                fill="#f43f5e"
                stroke="#0f172a"
                strokeWidth={isActive ? 2.5 : 1.5}
                className="transition-all duration-150"
              />

              {/* Rótulo do Mês no Eixo X */}
              <text
                x={incPt.x}
                y={height - 12}
                textAnchor="middle"
                className={`text-[11px] font-medium transition-colors ${
                  isSelected
                    ? 'fill-emerald-400 font-bold'
                    : isHovered
                    ? 'fill-white font-semibold'
                    : 'fill-slate-400'
                }`}
              >
                {MONTH_NAMES[idx]}
              </text>

              {/* Indicador de mês selecionado no eixo */}
              {isSelected && (
                <circle
                  cx={incPt.x}
                  cy={height - 2}
                  r="2"
                  fill="#10b981"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
