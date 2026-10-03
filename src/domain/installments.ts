import { splitMoney } from './money';

export interface InstallmentScheduleItem {
  number: number;
  totalInstallments: number;
  date: string; // YYYY-MM-DD
  amount: number;
}

/**
 * Calcula a data exata da parcela para o mês especificado,
 * respeitando os dias do mês (28, 29 em bissextos, 30, 31).
 * Se o dia inicial for 31 e o mês seguinte tiver apenas 30 dias (ou 28/29 em fevereiro),
 * ajusta para o último dia do respectivo mês sem saltar para o mês seguinte.
 */
export function calculateInstallmentDate(startDate: string, installmentIndex: number): string {
  const parts = startDate.split('-').map(Number);
  const startYear = parts[0];
  const startMonth = parts[1]; // 1-12
  const startDay = parts[2];

  // Mês zero-indexed para o construtor Date
  const targetDate = new Date(startYear, (startMonth - 1) + installmentIndex, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth(); // 0-11

  // Descobre quantos dias existem no mês de destino (passando dia 0 do mês seguinte)
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  // Garante que o dia não passe do final do mês (ex: 31 de janeiro -> 28/29 de fevereiro)
  const actualDay = Math.min(startDay, daysInTargetMonth);

  const yearStr = String(targetYear);
  const monthStr = String(targetMonth + 1).padStart(2, '0');
  const dayStr = String(actualDay).padStart(2, '0');

  return `${yearStr}-${monthStr}-${dayStr}`;
}

/**
 * Função pura para cálculo do cronograma de parcelas.
 * Garante que a soma das parcelas seja rigorosamente igual a totalAmount (sem perder centavos).
 */
export function calculateInstallmentSchedule(
  totalAmount: number,
  numberOfInstallments: number,
  startDate: string
): InstallmentScheduleItem[] {
  if (numberOfInstallments <= 0 || totalAmount <= 0) {
    return [];
  }

  // Distribuição exata dos centavos
  const amounts = splitMoney(totalAmount, numberOfInstallments);

  return amounts.map((amount, idx) => ({
    number: idx + 1,
    totalInstallments: numberOfInstallments,
    date: calculateInstallmentDate(startDate, idx),
    amount
  }));
}
