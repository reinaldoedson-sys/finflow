/**
 * Utilitários para tratamento de datas em fuso horário local.
 * Evita o problema de "virada de dia prematura às 21h" no Brasil (UTC-3)
 * causado pelo uso de toISOString().split('T')[0], que converte para UTC.
 */

/**
 * Converte um objeto Date em string "YYYY-MM-DD" usando os métodos locais (getFullYear, getMonth, getDate).
 * @param date Instância de Date (padrão: new Date())
 */
export function toLocalISODate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retorna a data de "hoje" no fuso local no formato "YYYY-MM-DD".
 */
export function todayLocalISO(): string {
  return toLocalISODate(new Date());
}

/**
 * Adiciona ou subtrai dias de uma data em formato "YYYY-MM-DD" sem passar por UTC.
 * Constrói a data com new Date(ano, mes - 1, dia + days) no horário local.
 *
 * @param iso Data no formato "YYYY-MM-DD"
 * @param days Quantidade de dias a somar (positivo) ou subtrair (negativo)
 */
export function addDaysLocalISO(iso: string, days: number): string {
  const [yearStr, monthStr, dayStr] = iso.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const targetDate = new Date(year, month - 1, day + days);
  return toLocalISODate(targetDate);
}

/**
 * Converte um objeto Date em string de ano-mês "YYYY-MM" no fuso horário local.
 * @param date Instância de Date (padrão: new Date())
 */
export function toLocalYearMonth(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
