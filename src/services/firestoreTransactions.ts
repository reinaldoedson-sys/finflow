import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Transaction } from '../types/finance';

export interface MonthPeriod {
  start: string; // ex: '2026-10-01'
  end: string;   // ex: '2026-10-31'
}

/**
 * Retorna as datas de início e fim no formato YYYY-MM-DD para um dado mês YYYY-MM.
 */
export function getMonthDateRange(yearMonth: string): MonthPeriod {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // Último dia do mês: dia 0 do mês seguinte
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export interface PaginatedTransactionsResult {
  items: Transaction[];
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Consulta sob demanda paginada com cursor (startAfter) no Firestore.
 * Utiliza o índice simples de campo único de `date` ordenado decrescente.
 */
export async function queryTransactionsPaged(
  uid: string,
  options: {
    pageSize?: number;
    startAfterDoc?: QueryDocumentSnapshot<DocumentData> | null;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<PaginatedTransactionsResult> {
  const { pageSize = 30, startAfterDoc = null, startDate, endDate } = options;

  const baseRef = collection(db, 'users', uid, 'transactions');
  const constraints: any[] = [];

  if (startDate) {
    constraints.push(where('date', '>=', startDate));
  }
  if (endDate) {
    constraints.push(where('date', '<=', endDate));
  }

  // Ordenação cronológica decrescente
  constraints.push(orderBy('date', 'desc'));

  if (startAfterDoc) {
    constraints.push(startAfter(startAfterDoc));
  }

  constraints.push(limit(pageSize + 1));

  const q = query(baseRef, ...constraints);
  const snapshot = await getDocs(q);

  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

  const items: Transaction[] = pageDocs.map(docSnap => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Transaction, 'id'>),
  }));

  const lastVisible = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

  return {
    items,
    lastVisible,
    hasMore,
  };
}

/**
 * Registra um listener em tempo real no Firestore limitado às transações de um mês específico
 * (ou intervalo de datas), reduzindo o volume de leitura e mantendo o aplicativo reativo.
 */
export function subscribeMonthTransactions(
  uid: string,
  yearMonth: string,
  onUpdate: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const { start, end } = getMonthDateRange(yearMonth);
  const baseRef = collection(db, 'users', uid, 'transactions');

  const q = query(
    baseRef,
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Transaction[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Transaction, 'id'>),
      }));
      onUpdate(list);
    },
    (err) => {
      console.warn(`[FinFlow Firestore] Erro no listener mensal de transações (${yearMonth}):`, err);
      if (onError) onError(err);
    }
  );
}
