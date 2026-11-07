import React, { useState, useEffect } from 'react';
import { CurrencyCode } from '../../types/finance';
import { formatCurrency } from '../../utils/currency';
import { formatCompactCurrency } from '../../utils/compactCurrency';

export type GroupedBarMode = 'income_expense' | 'salary_other';

export interface GroupedBarItem {
  month: number; // 1 a 12
  income: number;
  expense: number;
  salary: number;
  otherIncome: number;
}

interface GroupedBarChartProps {
  data: GroupedBarItem[];
  mode?: GroupedBarMode;
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

export const GroupedBarChart: React.FC<GroupedBarChartProps> = ({
  data,
  mode = 'income_expense',
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

  // Dimensões do gráfico
  const width = 760;
  const height = 280;
  const padLeft = 75;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Configuração das séries conforme o modo ativo
  const isIncomeExpense = mode === 'income_expense';
  const series1Color = '#10b981'; // esmeralda
  const series2Color = isIncomeExpense ? '#f43f5e' : '#6366f1'; // rosa/vermelho ou índigo
  const series1Label = isIncomeExpense ? 'Receitas' : 'Salário & Renda';
  const series2Label = isIncomeExpense ? 'Despesas' : 'Outras receitas';

  // Encontra o valor máximo entre todos os meses para calibrar a escala Y
  let maxVal = 0;
  let totalSeries1 = 0;
  let totalSeries2 = 0;

  for (const item of data) {
    const val1 = isIncomeExpense ? item.income : item.salary;
    const val2 = isIncomeExpense ? item.expense : item.otherIncome;
    if (val1 > maxVal) maxVal = val1;
    if (val2 > maxVal) maxVal = val2;
    totalSeries1 += val1;
    totalSeries2 += val2;
  }
  if (maxVal <= 0) maxVal = 1000;
  // Margem superior de 15% para as barras não tocarem o topo
  maxVal = maxVal * 1.15;

  // Verifica se há ao menos um mês previsto com valor diferente de zero
  const hasProjectedWithValues = data.some(item => {
    const projected = isProjected ? isProjected(item.month) : false;
    if (!projected) return false;
    const val1 = isIncomeExpense ? item.income : item.salary;
    const val2 = isIncomeExpense ? item.expense : item.otherIncome;
    return val1 > 0 || val2 > 0;
  });

  // Linhas de grade no eixo Y (4 divisões)
  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  const colW = chartW / 12;
  const barW = Math.max(8, Math.min(16, colW * 0.32));
  const barGap = 3;

  const activeItem = activeIndex !== null && data[activeIndex] ? data[activeIndex] : null;
  const activeIsProjected = activeItem && isProjected ? isProjected(activeItem.month) : false;

  return (
    <div 
      className="relative w-full select-none"
      onMouseLeave={() => setHoveredMonth(null)}
    >
      {/* Legenda e Tooltip flutuante superior quando um mês estiver com foco/hover */}
      <div className="flex items-center justify-between mb-2 px-1 text-xs min-h-[28px] flex-wrap gap-2">
        <div className="flex items-center gap-4 text-slate-400 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: series1Color }} />
            <span className="text-[11px] font-medium text-slate-300">{series1Label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: series2Color }} />
            <span className="text-[11px] font-medium text-slate-300">{series2Label}</span>
          </div>
          {hasProjectedWithValues && (
            <div className="flex items-center gap-1.5" title="Parcelas e lançamentos com competência futura">
              <span className="w-3 h-3 rounded-sm border border-dashed border-amber-400/80 bg-amber-400/20 inline-flex items-center justify-center text-[8px] text-amber-300 font-mono">
                //
              </span>
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
            {isIncomeExpense ? (
              <>
                <span className="text-emerald-400 font-semibold">
                  Receitas +{formatCurrency(activeItem.income, currency, hideValues)}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-rose-400 font-semibold">
                  Despesas -{formatCurrency(activeItem.expense, currency, hideValues)}
                </span>
              </>
            ) : (
              <>
                <span className="text-emerald-400 font-semibold">
                  Salário {formatCurrency(activeItem.salary, currency, hideValues)}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-indigo-400 font-semibold">
                  Outras {formatCurrency(activeItem.otherIncome, currency, hideValues)}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span className="font-sans text-slate-400">Total do ano:</span>
            {isIncomeExpense ? (
              <>
                <span className="text-emerald-400 font-semibold">
                  Receitas +{formatCurrency(totalSeries1, currency, hideValues)}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-rose-400 font-semibold">
                  Despesas -{formatCurrency(totalSeries2, currency, hideValues)}
                </span>
              </>
            ) : (
              <>
                <span className="text-emerald-400 font-semibold">
                  Salário {formatCurrency(totalSeries1, currency, hideValues)}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-indigo-400 font-semibold">
                  Outras {formatCurrency(totalSeries2, currency, hideValues)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible block"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          {/* Padrão de listras diagonais para barras de meses previstos */}
          <pattern
            id="bar-diagonal-stripes"
            width="6"
            height="6"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.6" />
          </pattern>
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

        {/* Colunas dos 12 meses */}
        {data.map((item, idx) => {
          const colX = padLeft + idx * colW;
          const centerX = colX + colW / 2;
          const isSelected = selectedMonth === item.month;
          const isHovered = hoveredMonth === item.month;
          const isActive = isSelected || isHovered;
          const isDimmed = selectedMonth !== null && !isActive;
          const isProj = isProjected ? isProjected(item.month) : false;

          const val1 = isIncomeExpense ? item.income : item.salary;
          const val2 = isIncomeExpense ? item.expense : item.otherIncome;

          // Alturas das duas barras (quando zero, traço fino de 1.5px na linha de base)
          const h1 = val1 > 0 ? (val1 / maxVal) * chartH : 1.5;
          const h2 = val2 > 0 ? (val2 / maxVal) * chartH : 1.5;

          const x1 = centerX - barW - barGap / 2;
          const y1 = padTop + chartH - h1;

          const x2 = centerX + barGap / 2;
          const y2 = padTop + chartH - h2;

          // Opacidades: meses previstos usam opacidade menor conforme especificação
          const baseOpacity = isProj ? 0.6 : 0.85;
          const activeOpacity = isProj ? 0.8 : 1.0;
          const dimmedOpacity = isProj ? 0.25 : 0.35;
          const barOpacity = isActive ? activeOpacity : isDimmed ? dimmedOpacity : baseOpacity;

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
                  fill={isProj ? "rgba(245, 158, 11, 0.10)" : "rgba(16, 185, 129, 0.10)"}
                  stroke={isProj ? "rgba(245, 158, 11, 0.50)" : "rgba(16, 185, 129, 0.45)"}
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  rx="6"
                />
              )}

              {/* Área invisível de toque/hover ampla para cada coluna */}
              <rect
                x={colX}
                y={padTop}
                width={colW}
                height={chartH + padBottom}
                fill={isHovered ? 'rgba(255, 255, 255, 0.05)' : 'transparent'}
                rx="6"
              />

              {/* Barra Série 1 (Receitas ou Salário) */}
              <rect
                x={x1}
                y={y1}
                width={barW}
                height={h1}
                fill={series1Color}
                stroke={isProj && val1 > 0 ? 'rgba(255, 255, 255, 0.6)' : 'none'}
                strokeWidth={isProj && val1 > 0 ? 1 : 0}
                strokeDasharray={isProj && val1 > 0 ? '2 2' : 'none'}
                rx="3"
                className="transition-all duration-150"
                opacity={barOpacity}
              />
              {/* Sobreposição de listras diagonais para meses previstos com valor */}
              {isProj && val1 > 0 && (
                <rect
                  x={x1}
                  y={y1}
                  width={barW}
                  height={h1}
                  fill="url(#bar-diagonal-stripes)"
                  rx="3"
                  opacity={barOpacity}
                  pointerEvents="none"
                />
              )}

              {/* Barra Série 2 (Despesas ou Outras receitas) */}
              <rect
                x={x2}
                y={y2}
                width={barW}
                height={h2}
                fill={series2Color}
                stroke={isProj && val2 > 0 ? 'rgba(255, 255, 255, 0.6)' : 'none'}
                strokeWidth={isProj && val2 > 0 ? 1 : 0}
                strokeDasharray={isProj && val2 > 0 ? '2 2' : 'none'}
                rx="3"
                className="transition-all duration-150"
                opacity={barOpacity}
              />
              {/* Sobreposição de listras diagonais para meses previstos com valor */}
              {isProj && val2 > 0 && (
                <rect
                  x={x2}
                  y={y2}
                  width={barW}
                  height={h2}
                  fill="url(#bar-diagonal-stripes)"
                  rx="3"
                  opacity={barOpacity}
                  pointerEvents="none"
                />
              )}

              {/* Rótulo do Mês no Eixo X */}
              {isSelected ? (
                <g>
                  <rect
                    x={centerX - 17}
                    y={height - 24}
                    width="34"
                    height="18"
                    fill={isProj ? "#f59e0b" : "#10b981"}
                    rx="4"
                  />
                  <text
                    x={centerX}
                    y={height - 11}
                    textAnchor="middle"
                    className="text-[11px] font-bold fill-slate-950 font-sans"
                  >
                    {MONTH_NAMES[idx]}
                  </text>
                </g>
              ) : (
                <text
                  x={centerX}
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
