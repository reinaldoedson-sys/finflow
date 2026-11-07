import React, { useState } from 'react';
import { formatCurrency } from '../../utils/currency';
import { CurrencyCode } from '../../types/finance';

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  percentage: number;
  count?: number;
}

interface DonutChartProps {
  segments: DonutSegment[];
  currency?: CurrencyCode;
  hideValues?: boolean;
  activeSegmentId?: string | null;
  onSelectSegment?: (id: string | null) => void;
  title?: string;
  emptyLabel?: string;
  ariaLabel?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  currency = 'BRL',
  hideValues = false,
  activeSegmentId = null,
  onSelectSegment,
  title = 'Total',
  emptyLabel = 'Sem movimentações',
  ariaLabel = 'Gráfico de rosca de distribuição por categoria'
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const effectiveActiveId = hoveredId || activeSegmentId;

  // Raio e circunferência para o cálculo exato do arco SVG
  const radius = 78;
  const circumference = 2 * Math.PI * radius; // ~490.088
  const center = 120;

  const totalValue = segments.reduce((sum, s) => sum + s.value, 0);
  const activeSegment = segments.find(s => s.id === effectiveActiveId);

  // Calcula os offsets e comprimentos das fatias
  let accumulatedLength = 0;
  const renderedSlices = segments.map(segment => {
    const fraction = totalValue > 0 ? segment.value / totalValue : 0;
    const sliceLength = fraction * circumference;
    const offset = accumulatedLength;
    accumulatedLength += sliceLength;

    const gap = segments.length > 1 && sliceLength > 4 ? 2.5 : 0;
    const dashLength = Math.max(0, sliceLength - gap);

    const isActive = effectiveActiveId === segment.id;

    return {
      segment,
      dashLength,
      dashOffset: -offset,
      isActive,
    };
  });

  return (
    <div className="flex flex-col items-center justify-center relative select-none">
      <div className="relative w-[240px] h-[240px]">
        <svg
          viewBox="0 0 240 240"
          className="w-full h-full transform -rotate-90 transition-transform duration-300"
          role="img"
          aria-label={ariaLabel}
        >
          {/* Anel de fundo para base */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="20"
            className="opacity-40"
          />

          {/* Segmentos de dados */}
          {totalValue > 0 &&
            renderedSlices.map(({ segment, dashLength, dashOffset, isActive }) => {
              return (
                <circle
                  key={segment.id}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={isActive ? 28 : 20}
                  strokeDasharray={`${dashLength} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  className="transition-all duration-200 cursor-pointer origin-center"
                  style={{
                    filter: isActive
                      ? `drop-shadow(0 0 8px ${segment.color}88)`
                      : undefined,
                    opacity: effectiveActiveId && !isActive ? 0.35 : 1,
                  }}
                  onMouseEnter={() => {
                    setHoveredId(segment.id);
                  }}
                  onMouseLeave={() => {
                    setHoveredId(null);
                  }}
                  onClick={() => {
                    if (onSelectSegment) {
                      onSelectSegment(activeSegmentId === segment.id ? null : segment.id);
                    }
                  }}
                />
              );
            })}
        </svg>

        {/* Centro Informativo do Donut */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          {totalValue === 0 ? (
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium block">
                {emptyLabel}
              </span>
              <span className="text-[11px] text-slate-600 block">
                R$ 0,00
              </span>
            </div>
          ) : activeSegment ? (
            <div className="space-y-0.5 animate-in fade-in duration-150">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block truncate max-w-[130px]">
                {activeSegment.label}
              </span>
              <span className="text-lg font-bold font-mono text-white tracking-tight block">
                {formatCurrency(activeSegment.value, currency, hideValues)}
              </span>
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: activeSegment.color }}
                />
                <span className="text-xs font-semibold text-emerald-400 font-mono">
                  {activeSegment.percentage}%
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 animate-in fade-in duration-150">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                {title}
              </span>
              <span className="text-lg font-bold font-mono text-white tracking-tight block">
                {formatCurrency(totalValue, currency, hideValues)}
              </span>
              <span className="text-[11px] text-slate-500 block">
                {segments.length} {segments.length === 1 ? 'categoria' : 'categorias'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
