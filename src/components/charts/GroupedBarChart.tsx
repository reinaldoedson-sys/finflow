import React, { useState } from 'react';
import { CurrencyCode } from '../../types/finance';
import { formatCurrency } from '../../utils/currency';
import { formatCompactCurrency } from '../../utils/compactCurrency';

export interface GroupedBarItem {
  month: number; // 1 a 12
  salary: number;
  otherIncome: number;
}

interface GroupedBarChartProps {
  data: GroupedBarItem[];
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

export const GroupedBarChart: React.FC<GroupedBarChartProps> = ({
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

  // Dimensões do gráfico
  const width = 760;
  const height = 280;
  const padLeft = 75;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Encontra o valor máximo entre todos os meses para calibrar a escala Y
  let maxVal = 0;
  for (const item of data) {
    if (item.salary > maxVal) maxVal = item.salary;
    if (item.otherIncome > maxVal) maxVal = item.otherIncome;
  }
  if (maxVal <= 0) maxVal = 1000;
  // Margem superior de 15% para as barras não tocarem o topo
  maxVal = maxVal * 1.15;

  // Linhas de grade no eixo Y (4 divisões)
  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  const colW = chartW / 12;
  const barW = Math.max(8, Math.min(16, colW * 0.32));
  const barGap = 3;

  const activeItem = activeIndex !== null && data[activeIndex] ? data[activeIndex] : null;

  return (
    <div className="relative w-full select-none">
      {/* Tooltip flutuante superior quando um mês estiver com foco/hover */}
      <div className="flex items-center justify-between mb-2 px-1 text-xs min-h-[24px]">
        <div className="flex items-center gap-4 text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-300">Salário & Renda</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
            <span className="text-[11px] font-medium text-slate-300">Outras receitas</span>
          </div>
        </div>

        {activeItem ? (
          <div className="flex items-center gap-3 font-mono text-xs bg-slate-900/90 border border-slate-700/80 px-2.5 py-1 rounded-lg shadow-sm">
            <span className="font-sans font-semibold text-white">
              {MONTH_NAMES[activeItem.month - 1]}:
            </span>
            <span className="text-emerald-400 font-semibold">
              Salário {formatCurrency(activeItem.salary, currency, hideValues)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-400 font-semibold">
              Outras {formatCurrency(activeItem.otherIncome, currency, hideValues)}
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

        {/* Colunas dos 12 meses */}
        {data.map((item, idx) => {
          const colX = padLeft + idx * colW;
          const centerX = colX + colW / 2;
          const isSelected = selectedMonth === item.month;
          const isHovered = hoveredMonth === item.month;

          // Alturas das duas barras
          const salH = (item.salary / maxVal) * chartH;
          const othH = (item.otherIncome / maxVal) * chartH;

          const salX = centerX - barW - barGap / 2;
          const salY = padTop + chartH - salH;

          const othX = centerX + barGap / 2;
          const othY = padTop + chartH - othH;

          return (
            <g
              key={item.month}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredMonth(item.month)}
              onMouseLeave={() => setHoveredMonth(null)}
              onClick={() => onSelectMonth && onSelectMonth(item.month)}
            >
              {/* Área invisível de toque/hover ampla para cada coluna */}
              <rect
                x={colX}
                y={padTop}
                width={colW}
                height={chartH + padBottom}
                fill={isHovered ? 'rgba(255, 255, 255, 0.04)' : isSelected ? 'rgba(16, 185, 129, 0.06)' : 'transparent'}
                rx="6"
              />

              {/* Barra Salário (Esmeralda) */}
              <rect
                x={salX}
                y={salY}
                width={barW}
                height={Math.max(2, salH)}
                fill="#10b981"
                rx="3"
                className="transition-all duration-150"
                opacity={isHovered || isSelected ? 1 : 0.85}
              />

              {/* Barra Outras Receitas (Índigo) */}
              <rect
                x={othX}
                y={othY}
                width={barW}
                height={Math.max(2, othH)}
                fill="#6366f1"
                rx="3"
                className="transition-all duration-150"
                opacity={isHovered || isSelected ? 1 : 0.85}
              />

              {/* Rótulo do Mês no Eixo X */}
              <text
                x={centerX}
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
                  cx={centerX}
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
