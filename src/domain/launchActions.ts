export type LaunchAction = {
  kind: 'new-transaction';
  type: 'expense' | 'income';
};

/**
 * Analisa a query string (search) para identificar uma ação de inicialização (ex.: via atalho do PWA).
 * Aceita o parâmetro "acao":
 * - "nova-despesa" -> { kind: 'new-transaction', type: 'expense' }
 * - "nova-receita" -> { kind: 'new-transaction', type: 'income' }
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
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove o parâmetro "acao" da URL, preservando os demais parâmetros de busca e o hash.
 * Se não sobrar nenhum parâmetro de busca, não deixa "?" solto no final.
 *
 * @param path Caminho da URL (ex.: "/" ou "/app")
 * @param search Query string com ou sem "?" (ex.: "?acao=nova-despesa" ou "?foo=1&acao=nova-despesa")
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
    params.delete('acao');
    const remaining = params.toString();
    const queryPart = remaining ? `?${remaining}` : '';
    return `${safePath}${queryPart}${safeHash}`;
  } catch {
    return `${safePath}${safeHash}`;
  }
}
