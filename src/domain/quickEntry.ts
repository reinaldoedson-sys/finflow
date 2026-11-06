import { Transaction, Category, Account, CreditCard, TransactionType, PaymentMethod } from '../types/finance';
import { DEFAULT_CATEGORIES } from '../utils/mockData';
import { todayLocalISO, addDaysLocalISO } from '../utils/localDate';

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Sugere descrições distintas de transações anteriores (ignorando excluídas),
 * que contenham o texto digitado sem diferenciar maiúsculas/minúsculas e sem acentos,
 * ordenadas da mais recente para a mais antiga. Com query vazia, devolve as mais recentes.
 */
export function suggestDescriptions(
  transactions: Transaction[],
  query?: string,
  limit: number = 5
): string[] {
  const cleanQuery = query ? removeAccents(query.trim().toLowerCase()) : '';

  const active = transactions
    .filter(t => !t.deleted && !t.deletedAt && t.description && t.description.trim().length > 0)
    .sort((a, b) => {
      const timeA = a.createdAt || a.date || '';
      const timeB = b.createdAt || b.date || '';
      return timeB.localeCompare(timeA);
    });

  const result: string[] = [];
  const seen = new Set<string>();

  for (const t of active) {
    const desc = t.description.trim();
    const normalized = removeAccents(desc.toLowerCase());

    if (cleanQuery && !normalized.includes(cleanQuery)) {
      continue;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(desc);
      if (result.length >= limit) {
        break;
      }
    }
  }

  return result;
}

/**
 * Retorna os IDs das categorias mais usadas nos últimos N dias para aquele tipo (despesa ou receita),
 * ordenados por frequência. Se houver menos que o limite, completa com as demais categorias do tipo
 * na ordem original de cadastro.
 */
export function getTopCategoryIds(
  transactions: Transaction[],
  param2: TransactionType | Category[],
  param3: number | TransactionType = 6,
  param4: number = 90,
  param5: string | number = todayLocalISO(),
  param6?: string | Category[]
): string[] {
  let allCategories: Category[];
  let type: TransactionType;
  let limit: number;
  let days: number;
  let today: string;

  if (Array.isArray(param2)) {
    allCategories = param2;
    type = param3 as TransactionType;
    limit = typeof param4 === 'number' ? param4 : 6;
    days = typeof param5 === 'number' ? param5 : 90;
    today = typeof param6 === 'string' ? param6 : todayLocalISO();
  } else {
    type = param2 as TransactionType;
    limit = typeof param3 === 'number' ? param3 : 6;
    days = typeof param4 === 'number' ? param4 : 90;
    today = typeof param5 === 'string' ? param5 : todayLocalISO();
    allCategories = Array.isArray(param6) ? param6 : DEFAULT_CATEGORIES;
  }

  const cutoffDate = addDaysLocalISO(today, -days);

  // Filtra transações do tipo selecionado nos últimos N dias
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    if (t.deleted || t.deletedAt) continue;
    if (t.type !== type) continue;
    if (!t.categoryId) continue;
    if (t.date >= cutoffDate && t.date <= today) {
      counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
    }
  }

  // Ordena categorias usadas por frequência decrescente
  const sortedUsed = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  const result: string[] = [];
  const added = new Set<string>();

  for (const catId of sortedUsed) {
    // Garante que a categoria pertence à lista permitida daquele tipo
    const exists = allCategories.some(c => c.id === catId && (c.type === type || c.type === 'both'));
    if (exists && !added.has(catId)) {
      added.add(catId);
      result.push(catId);
      if (result.length >= limit) break;
    }
  }

  // Se houver menos que o limite, completa com as demais categorias do tipo na ordem original
  if (result.length < limit) {
    for (const cat of allCategories) {
      if (cat.type === type || cat.type === 'both') {
        if (!added.has(cat.id)) {
          added.add(cat.id);
          result.push(cat.id);
          if (result.length >= limit) break;
        }
      }
    }
  }

  return result.slice(0, limit);
}

export interface QuickDefaults {
  accountId: string;
  paymentMethod: PaymentMethod;
  creditCardId: string;
  categoryId: string;
}

/**
 * Devolve { accountId, paymentMethod, creditCardId, categoryId } com base no ÚLTIMO lançamento
 * criado (por createdAt) do mesmo tipo, ignorando excluídos.
 * Regras:
 * - Se o método foi cartão de crédito mas não existe nenhum cartão (ou o cartão não existe mais), usa 'pix'.
 * - Se a conta não existir mais, usa a primeira conta.
 * - Sem histórico, usa a primeira conta, 'pix' e a primeira categoria do tipo.
 */
export function getQuickDefaults(
  transactions: Transaction[],
  accounts: Account[],
  creditCards: CreditCard[],
  param4: TransactionType | Category[],
  param5?: TransactionType | Category[]
): QuickDefaults {
  let type: TransactionType;
  let categories: Category[];

  if (typeof param4 === 'string') {
    type = param4;
    categories = Array.isArray(param5) ? param5 : DEFAULT_CATEGORIES;
  } else {
    categories = param4;
    type = param5 as TransactionType;
  }

  const defaultFirstAccount = accounts.length > 0 ? accounts[0].id : '';
  const defaultFirstCategory = categories.find(c => c.type === type || c.type === 'both')?.id || '';

  // Localiza o último lançamento criado do mesmo tipo
  const matching = transactions
    .filter(t => !t.deleted && !t.deletedAt && t.type === type)
    .sort((a, b) => {
      const timeA = a.createdAt || a.date || '';
      const timeB = b.createdAt || b.date || '';
      return timeB.localeCompare(timeA);
    });

  const lastTx = matching[0];

  if (!lastTx) {
    return {
      accountId: defaultFirstAccount,
      paymentMethod: 'pix',
      creditCardId: '',
      categoryId: defaultFirstCategory,
    };
  }

  let accountId = lastTx.accountId;
  let paymentMethod = lastTx.paymentMethod || 'pix';
  let creditCardId = lastTx.creditCardId || '';
  let categoryId = lastTx.categoryId;

  // Validação 1: Conta existe
  if (!accounts.some(a => a.id === accountId)) {
    accountId = defaultFirstAccount;
  }

  // Validação 2: Cartão de crédito
  if (paymentMethod === 'credit_card') {
    const cardExists = Boolean(creditCardId && creditCards.some(c => c.id === creditCardId));
    if (creditCards.length === 0 || !cardExists) {
      paymentMethod = 'pix';
      creditCardId = '';
    }
  } else {
    creditCardId = '';
  }

  // Validação 3: Categoria existe
  if (!categories.some(c => c.id === categoryId)) {
    categoryId = defaultFirstCategory;
  }

  return {
    accountId,
    paymentMethod,
    creditCardId,
    categoryId,
  };
}

export interface DescriptionPrefill {
  categoryId: string;
  accountId: string;
  paymentMethod: PaymentMethod;
  creditCardId: string;
  amount: number;
}

/**
 * Se existir um lançamento anterior com a MESMA descrição (ignorando maiúsculas/minúsculas e espaços nas pontas),
 * devolve { categoryId, accountId, paymentMethod, creditCardId, amount } do mais recente; senão null.
 */
export function getPrefillFromDescription(
  transactions: Transaction[],
  description: string
): DescriptionPrefill | null {
  const clean = description.trim().toLowerCase();
  if (!clean) return null;

  const matches = transactions
    .filter(t => !t.deleted && !t.deletedAt && t.description && t.description.trim().toLowerCase() === clean)
    .sort((a, b) => {
      const timeA = a.createdAt || a.date || '';
      const timeB = b.createdAt || b.date || '';
      return timeB.localeCompare(timeA);
    });

  const latest = matches[0];
  if (!latest) return null;

  return {
    categoryId: latest.categoryId,
    accountId: latest.accountId,
    paymentMethod: latest.paymentMethod || 'pix',
    creditCardId: latest.creditCardId || '',
    amount: latest.amount,
  };
}
