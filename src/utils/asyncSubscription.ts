/**
 * Utilitário puro para gerenciar o ciclo de vida de assinaturas/listeners assíncronos.
 * Resolve condições de corrida causadas por carregamento sob demanda (lazy loading):
 * 1. Cleanup invocado ANTES de a Promise de registro resolver (cancela imediatamente quando resolver).
 * 2. Múltiplas chamadas de cleanup seguras (idempotente).
 * 3. React StrictMode (montagem/desmontagem rápida sucessiva deixando apenas 1 listener ativo).
 */

export type AsyncSubscriptionRegistrar = (
  isCancelled: () => boolean
) => Promise<(() => void) | void>;

/**
 * Cria uma assinatura assíncrona protegida contra condições de corrida.
 * Retorna uma função de unsubscribe síncrona e segura.
 */
export function createAsyncSubscription(
  registerFn: AsyncSubscriptionRegistrar
): () => void {
  let isCancelled = false;
  let activeUnsub: (() => void) | null = null;

  registerFn(() => isCancelled)
    .then((unsub) => {
      if (!unsub) return;
      if (isCancelled) {
        // O cancelamento foi solicitado enquanto a Promise estava pendente:
        // executa o unsubscribe imediatamente para evitar listeners órfãos (leaks).
        try {
          unsub();
        } catch (err) {
          console.warn('[createAsyncSubscription] Erro ao limpar listener tardio:', err);
        }
      } else {
        activeUnsub = unsub;
      }
    })
    .catch((err) => {
      if (!isCancelled) {
        console.warn('[createAsyncSubscription] Falha durante o registro assíncrono:', err);
      }
    });

  return () => {
    isCancelled = true;
    if (activeUnsub) {
      try {
        activeUnsub();
      } catch (err) {
        console.warn('[createAsyncSubscription] Erro ao invocar unsubscribe ativo:', err);
      }
      activeUnsub = null;
    }
  };
}
