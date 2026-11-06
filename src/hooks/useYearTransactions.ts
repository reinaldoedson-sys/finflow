import { useState, useEffect, useMemo } from 'react';
import { Transaction } from '../types/finance';
import { useFinance } from '../context/FinanceContext';
import { IndexedDBTransactionRepository } from '../repositories/implementations/IndexedDBTransactionRepository';
import { isIndexedDBAvailable } from '../storage/indexedDB';

/**
 * Hook para carregar lançamentos de um ano específico diretamente do repositório local
 * caso o estado global não contenha o ano completo, recarregando automaticamente quando
 * o estado de transações do FinanceContext mudar (adições, edições ou exclusões).
 */
export function useYearTransactions(year: number) {
  const { transactions: contextTransactions } = useFinance();
  const repo = useMemo(() => new IndexedDBTransactionRepository(), []);
  const [yearTransactions, setYearTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      const start = `${year}-01-01`;
      const end = `${year}-12-31\uffff`;

      try {
        if (isIndexedDBAvailable()) {
          const dbItems = await repo.getByDateRange(start, end);
          if (!isCancelled) {
            setYearTransactions(dbItems);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('[useYearTransactions] Falha ao consultar repositório local:', err);
      }

      // Fallback seguro usando as transações em memória do contexto
      if (!isCancelled) {
        const fallbackItems = contextTransactions.filter(
          t => t.date && t.date.startsWith(String(year)) && !t.deleted && !t.deletedAt
        );
        setYearTransactions(fallbackItems);
        setIsLoading(false);
      }
    }

    load();

    return () => {
      isCancelled = true;
    };
  }, [year, contextTransactions, repo]);

  return { yearTransactions, isLoading };
}
