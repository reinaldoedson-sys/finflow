import { CurrencyCode } from '../types/finance';

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'BRL',
  hideValues: boolean = false
): string {
  if (hideValues) {
    return '••••••';
  }

  const locale = currency === 'BRL' ? 'pt-BR' : currency === 'EUR' ? 'de-DE' : 'en-US';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateShort(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateFull(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getMonthLabel(monthString: string): string {
  if (!monthString) return '';
  const [year, month] = monthString.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString('pt-BR', { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
}

export function getPreviousMonth(monthString: string): string {
  const [year, month] = monthString.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function getNextMonth(monthString: string): string {
  const [year, month] = monthString.split('-').map(Number);
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function calculatePercentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((part / total) * 100), 100);
}
