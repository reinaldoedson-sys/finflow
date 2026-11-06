import React, { useId } from 'react';

interface SparklineChartProps {
  data: number[];
  color: string;
  gradientId?: string;
  height?: number;
  ariaLabel: string;
}

/**
 * Constrói uma curva cúbica suave (C) entre pontos SVG.
 */
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

export const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color,
  gradientId,
  height = 42,
  ariaLabel,
}) => {
  const generatedId = useId().replace(/:/g, '');
  const gradId = gradientId || `spark-grad-${generatedId}`;

  const width = 160;
  const paddingX = 4;
  const paddingTop = 4;
  const paddingBottom = 4;
  const chartHeight = height;

  const validData = data && data.length > 0 ? data : [0];
  const minVal = Math.min(0, ...validData);
  const maxVal = Math.max(1, ...validData);
  const range = maxVal - minVal || 1;

  const availableWidth = width - paddingX * 2;
  const availableHeight = chartHeight - paddingTop - paddingBottom;

  const stepX = validData.length > 1 ? availableWidth / (validData.length - 1) : availableWidth;

  const points = validData.map((val, idx) => {
    const x = paddingX + idx * stepX;
    const normalized = (val - minVal) / range;
    const y = chartHeight - paddingBottom - normalized * availableHeight;
    return { x, y };
  });

  const linePath = buildSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${chartHeight} L ${firstPoint.x.toFixed(2)} ${chartHeight} Z`;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${chartHeight}`}
        className="w-full h-auto overflow-visible block"
        style={{ height: `${height}px` }}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Área preenchida em degradê */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Linha suave contínua */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Ponto final destacado */}
        {lastPoint && (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="3"
            fill={color}
            className="animate-pulse"
          />
        )}
      </svg>
    </div>
  );
};
