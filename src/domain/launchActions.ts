import { parseReceiptOrShareText } from './receiptParser';

export type LaunchAction =
  | { kind: 'new-transaction'; type: 'expense' | 'income' }
  | {
      kind: 'shared-content';
      type: 'expense' | 'income';
      description: string;
      amount?: number;
      date: string;
      notes?: string;
    };

/**
 * Analisa a query string (search) para identificar uma ação de inicialização:
 * - Atalhos do PWA:
 *   - "nova-despesa" -> { kind: 'new-transaction', type: 'expense' }
 *   - "nova-receita" -> { kind: 'new-transaction', type: 'income' }
 * - Web Share Target do PWA:
 *   - "compartilhar" -> { kind: 'shared-content', type, description, amount, date, notes }
 * Qualquer outro valor, ausência do parâmetro ou search vazio devolve null.
 */
export function parseLaunchAction(search: string | null | undefined): LaunchAction | null {
  if (!search) return null;
  const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
  if (!cleanSearch) return null;

  try {
    const params = new URLSearchParams(cleanSearch);
    const acao = params.get('acao');

    if (acao === 'nova-despesa') {
      return { kind: 'new-transaction', type: 'expense' };
    }

    if (acao === 'nova-receita') {
      return { kind: 'new-transaction', type: 'income' };
    }

    if (acao === 'compartilhar') {
      const texto = params.get('texto') || params.get('text') || '';
      const titulo = params.get('titulo') || params.get('title') || '';
      const parsed = parseReceiptOrShareText(texto, titulo);
      return {
        kind: 'shared-content',
        type: parsed.type,
        description: parsed.description,
        amount: parsed.amount,
        date: parsed.date,
        notes: parsed.notes,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Remove parâmetros de inicialização e compartilhamento da URL, preservando outros parâmetros e o hash.
 * Se não sobrar parâmetro, não deixa "?" solto no final.
 *
 * @param path Caminho da URL (ex.: "/" ou "/app")
 * @param search Query string com ou sem "?" (ex.: "?acao=nova-despesa" ou "?acao=compartilhar&texto=...")
 * @param hash Hash da URL com ou sem "#" (ex.: "#/analises")
 * @returns Endereço limpo (caminho + query restante + hash)
 */
export function removeLaunchParams(path: string, search: string, hash: string): string {
  const safePath = path || '/';
  const cleanSearch = search && search.startsWith('?') ? search.slice(1) : (search || '');
  const safeHash = hash || '';

  if (!cleanSearch) {
    return `${safePath}${safeHash}`;
  }

  try {
    const params = new URLSearchParams(cleanSearch);
    const launchParamsToRemove = ['acao', 'texto', 'text', 'titulo', 'title', 'link', 'url'];
    for (const key of launchParamsToRemove) {
      params.delete(key);
    }
    const remaining = params.toString();
    const queryPart = remaining ? `?${remaining}` : '';
    return `${safePath}${queryPart}${safeHash}`;
  } catch {
    return `${safePath}${safeHash}`;
  }
}
