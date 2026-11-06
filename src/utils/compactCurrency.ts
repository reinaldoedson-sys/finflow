import { CurrencyCode } from '../types/finance';

/**
 * Formata um valor monetário de forma compacta (ex.: "R$ 1,5 mil", "R$ 2 mi")
 * respeitando o modo oculto (retorna "••••••") e a moeda selecionada.
 */
export function formatCompactCurrency(
  amount: number,
  currency: CurrencyCode = 'BRL',
  hideValues: boolean = false
): string {
  if (hideValues) {
    return '••••••';
  }

  const symbol = currency === 'BRL' ? 'R$' : currency === 'EUR' ? '€' : '$';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return `${sign}${symbol} ${val} mi`;
  }

  if (abs >= 1_000) {
    const val = (abs / 1_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return `${sign}${symbol} ${val} mil`;
  }

  const val = abs.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${sign}${symbol} ${val}`;
}
