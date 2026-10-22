/**
 * Carregador preguiçoso e memoizado do Firebase para arquitetura Local-First.
 * O app funciona 100% offline via IndexedDB e só baixa o bundle do Firebase quando
 * o usuário interagir com login ou sincronização em nuvem.
 */

let firebasePromise: Promise<typeof import('./firebase')> | null = null;

/**
 * Carrega o módulo do Firebase de forma preguiçosa e memoizada.
 * Múltiplas chamadas simultâneas ou sequenciais compartilham a mesma Promise.
 */
export function loadFirebase(): Promise<typeof import('./firebase')> {
  if (!firebasePromise) {
    firebasePromise = import('./firebase').catch((err) => {
      // Se falhar o carregamento da rede/módulo, reseta para permitir novas tentativas futuras
      firebasePromise = null;
      throw err;
    });
  }
  return firebasePromise;
}

/**
 * Pré-carrega o Firebase em segundo plano sem lançar erro em caso de falha.
 * Ideal para ser chamado quando botões ou telas de autenticação forem exibidos.
 */
export function preloadFirebase(): Promise<typeof import('./firebase') | null> {
  return loadFirebase().catch((err) => {
    console.warn('[firebaseLoader] Preload falhou silenciosamente (offline ou rede indisponível):', err);
    return null;
  });
}
