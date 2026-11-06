import type { Transaction } from '../types/finance';

/**
 * Conta os lançamentos pertencentes ao mês especificado (ano-mês no formato YYYY-MM).
 * Critério: transação com data iniciando com `yearMonth`.
 * 
 * Este cálculo é a fonte única de verdade para a contagem mensal do Dashboard
 * e do extrato de Transações no seu filtro padrão (mês vigente).
 * Garante que parcelas de meses futuros e lançamentos de outros períodos não
 * inflem incorretamente os contadores da visão mensal.
 */
export function countMonthTransactions(
  transactions: Array<{ date: string } | Transaction> | null | undefined,
  yearMonth: string | null | undefined
): number {
  if (!yearMonth || !Array.isArray(transactions) || transactions.length === 0) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx && typeof tx.date === 'string' && tx.date.startsWith(yearMonth)) {
      count++;
    }
  }

  return count;
}
