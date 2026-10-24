import { useState, useRef, useEffect, useCallback } from 'react';
import type React from 'react';
import { InvestmentAsset } from '../types/finance';
import { FinancialSyncService } from '../services/financialSyncService';
import { fetchMarketQuotes } from '../services/marketQuotes';
import { loadFirebase } from '../firebaseLoader';
import {
  shouldPerformAutoQuoteCheck,
  getTickersToUpdate,
  findQuoteForTicker,
  mergeQuoteIntoAsset,
  buildQuoteMetadata,
} from '../domain/marketQuotesPolicy';

export interface UseMarketQuotesParams {
  investments: InvestmentAsset[];
  setInvestments: React.Dispatch<React.SetStateAction<InvestmentAsset[]>>;
  currentUser: { uid: string } | null;
  financialSyncService: FinancialSyncService;
  storageKeyPrefix?: string;
}

export interface UseMarketQuotesResult {
  refreshInvestmentQuotes: () => Promise<void>;
  isRefreshingQuotes: boolean;
  lastQuotesUpdate: string | null;
}

export function useMarketQuotes({
  investments,
  setInvestments,
  currentUser,
  financialSyncService,
  storageKeyPrefix = 'finflow_app_',
}: UseMarketQuotesParams): UseMarketQuotesResult {
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [lastQuotesUpdate, setLastQuotesUpdate] = useState<string | null>(null);

  const refreshInvestmentQuotes = useCallback(async () => {
    if (investments.length === 0) return;
    setIsRefreshingQuotes(true);

    const autoTickers = getTickersToUpdate(investments);

    if (autoTickers.length === 0) {
      setIsRefreshingQuotes(false);
      return;
    }

    try {
      const { quotes } = await fetchMarketQuotes(autoTickers);
      if (quotes && Object.keys(quotes).length > 0) {
        let updatedList: InvestmentAsset[] = [];
        setInvestments(prev => {
          updatedList = prev.map(inv => {
            const q = findQuoteForTicker(quotes, inv.ticker);
            return mergeQuoteIntoAsset(inv, q);
          });
          try {
            localStorage.setItem(storageKeyPrefix + 'investments', JSON.stringify(updatedList));
          } catch (e) {
            console.warn('Erro ao salvar investimentos no localStorage:', e);
          }
          return updatedList;
        });
        setLastQuotesUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

        // Atualiza cache local no IndexedDB e sincroniza na nuvem Firestore se autenticado
        for (const inv of updatedList) {
          const q = findQuoteForTicker(quotes, inv.ticker);
          if (q && typeof q.price === 'number') {
            const quoteMetadata = buildQuoteMetadata(q, inv.lastPriceUpdate);
            financialSyncService.updateInvestmentMarketQuote(inv.id, q.price, quoteMetadata).catch(console.warn);

            if (currentUser) {
              loadFirebase().then(async (fb) => {
                const { doc, setDoc } = await import('firebase/firestore');
                const invDocRef = doc(fb.db, 'users', currentUser.uid, 'investments', inv.id);
                setDoc(invDocRef, {
                  userId: currentUser.uid,
                  currentPrice: q.price,
                  ...(q.previousClose !== undefined ? { previousClose: q.previousClose } : {}),
                  ...(q.changePercent !== undefined ? { changePercent: q.changePercent } : {}),
                  lastPriceUpdate: quoteMetadata.lastPriceUpdate,
                  updatedAt: quoteMetadata.lastPriceUpdate,
                }, { merge: true }).catch(err => {
                  console.warn('[FinanceContext] Erro ao sincronizar cotação no Firestore:', err);
                });
              }).catch(console.warn);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao atualizar cotações de investimentos:', err);
    } finally {
      setIsRefreshingQuotes(false);
    }
  }, [investments, setInvestments, currentUser, financialSyncService, storageKeyPrefix]);

  // Quotes refresh automático ao inicializar e quando a lista de investimentos for carregada
  const lastAutoQuoteCheckRef = useRef<number>(0);
  const refreshInvestmentQuotesRef = useRef(refreshInvestmentQuotes);
  refreshInvestmentQuotesRef.current = refreshInvestmentQuotes;

  useEffect(() => {
    if (investments.length > 0) {
      const now = Date.now();
      if (shouldPerformAutoQuoteCheck(now, lastAutoQuoteCheckRef.current)) {
        lastAutoQuoteCheckRef.current = now;
        refreshInvestmentQuotesRef.current();
      }
    }
  }, [investments.length]);

  return {
    refreshInvestmentQuotes,
    isRefreshingQuotes,
    lastQuotesUpdate,
  };
}
