import { createAsyncSubscription } from '../src/utils/asyncSubscription';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Helper para criar uma Promise controlável manualmente
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runTests(): Promise<void> {
  console.log('🧪 Iniciando testes de condições de corrida em assinaturas assíncronas (asyncListenerCleanup)...');

  // =========================================================================
  // 1. Cleanup chamado ANTES de o registro assíncrono resolver
  // =========================================================================
  console.log('\n--- 1. Testando cancelamento prévio (cleanup antes de resolver) ---');
  {
    const deferred = createDeferred<() => void>();
    let listenerActive = false;
    let cancelCalled = false;

    const fakeUnsubscribe = () => {
      listenerActive = false;
      cancelCalled = true;
    };

    const cancel = createAsyncSubscription(async (isCancelled) => {
      const unsub = await deferred.promise;
      if (isCancelled()) {
        return unsub; // createAsyncSubscription deve chamar unsub imediatamente
      }
      listenerActive = true;
      return unsub;
    });

    // Desmonta/cancela ANTES de a Promise do registro assíncrono resolver
    cancel();
    assert(!listenerActive, 'O listener ainda não deve estar ativo');
    assert(!cancelCalled, 'A função de cancelamento ainda não foi chamada pois o registro não resolveu');

    // Agora resolve o registro assíncrono
    deferred.resolve(fakeUnsubscribe);
    await Promise.resolve(); // aguarda ticks de microtask
    await Promise.resolve();

    assert(!listenerActive, 'O listener NÃO deve permanecer ativo após resolver');
    assert(cancelCalled, 'O listener recém-criado DEVE ser cancelado imediatamente assim que o registro resolver');
    console.log('  ✅ Listener tardio foi cancelado imediatamente após resolução sem vazamento.');
  }

  // =========================================================================
  // 2. Cleanup chamado duas vezes (idempotência sem erro)
  // =========================================================================
  console.log('\n--- 2. Testando idempotência do cleanup (duas chamadas sem erro) ---');
  {
    let unsubCallCount = 0;
    const fakeUnsubscribe = () => {
      unsubCallCount += 1;
    };

    const cancel = createAsyncSubscription(async () => {
      return fakeUnsubscribe;
    });

    // Aguarda o registro resolver normalmente
    await Promise.resolve();
    await Promise.resolve();

    // Primeira chamada de cleanup
    cancel();
    assert(unsubCallCount === 1, 'Primeiro cleanup deve invocar o unsubscribe do listener');

    // Segunda chamada de cleanup
    cancel();
    assert(unsubCallCount === 1, 'Segundo cleanup NÃO deve invocar o unsubscribe novamente nem lançar erro');
    console.log('  ✅ Chamada repetida de cleanup é idempotente e segura.');
  }

  // =========================================================================
  // 3. React StrictMode: Dois registros seguidos com cleanup do primeiro
  // =========================================================================
  console.log('\n--- 3. Testando simulação do React StrictMode ---');
  {
    const deferred1 = createDeferred<() => void>();
    const deferred2 = createDeferred<() => void>();

    let activeListenersCount = 0;
    let listener1Active = false;
    let listener2Active = false;

    // 1º Ciclo do StrictMode: montagem
    const cancel1 = createAsyncSubscription(async (isCancelled) => {
      await deferred1.promise;
      if (isCancelled()) {
        return () => {
          if (listener1Active) {
            listener1Active = false;
            activeListenersCount -= 1;
          }
        };
      }
      listener1Active = true;
      activeListenersCount += 1;
      return () => {
        listener1Active = false;
        activeListenersCount -= 1;
      };
    });

    // 1º Ciclo do StrictMode: desmontagem imediata
    cancel1();

    // 2º Ciclo do StrictMode: segunda montagem definitiva
    const cancel2 = createAsyncSubscription(async (isCancelled) => {
      await deferred2.promise;
      if (isCancelled()) {
        return () => {};
      }
      listener2Active = true;
      activeListenersCount += 1;
      return () => {
        listener2Active = false;
        activeListenersCount -= 1;
      };
    });

    // Resolve o 1º registro atrasado (que já foi cancelado pelo cleanup)
    deferred1.resolve(() => {});
    await Promise.resolve();
    await Promise.resolve();

    assert(!listener1Active, 'Listener 1 NÃO deve ficar ativo pois o efeito já havia sido cancelado');

    // Resolve o 2º registro definitivo
    deferred2.resolve(() => {});
    await Promise.resolve();
    await Promise.resolve();

    assert(listener2Active, 'Listener 2 DEVE estar ativo');
    assert(activeListenersCount === 1, `Deve existir exatamente 1 listener ativo (obtido: ${activeListenersCount})`);

    // Limpeza final do 2º registro
    cancel2();
    await Promise.resolve();
    assert(!listener2Active, 'Listener 2 foi limpo');
    assert(activeListenersCount === 0, 'Nenhum listener remanescente após desmontagem final');
    console.log('  ✅ React StrictMode validado: primeiro efeito desmontado não deixa listener órfão e apenas 1 fica ativo.');
  }

  // =========================================================================
  // 4. Guarda contra troca de conta (UID mismatch)
  // =========================================================================
  console.log('\n--- 4. Testando descarte de snapshots de contas desautenticadas/antigas ---');
  {
    let currentUserId: string | null = 'user-alice';
    const processedEvents: string[] = [];

    const isSnapshotValid = (listenerUserId: string, isCancelled: () => boolean) => {
      if (isCancelled()) return false;
      if (currentUserId !== listenerUserId) return false;
      return true;
    };

    let fakeEmitSnapshot: ((data: string) => void) | undefined;

    const cancel = createAsyncSubscription(async (isCancelled) => {
      fakeEmitSnapshot = (data: string) => {
        if (!isSnapshotValid('user-alice', isCancelled)) {
          return; // ignora dados da conta antiga
        }
        processedEvents.push(data);
      };
      return () => {
        fakeEmitSnapshot = undefined;
      };
    });

    await Promise.resolve();
    await Promise.resolve();

    // Evento emitido enquanto user-alice está ativa
    if (typeof fakeEmitSnapshot === 'function') {
      (fakeEmitSnapshot as (d: string) => void)('dado-alice-1');
    }
    assert(processedEvents.length === 1 && processedEvents[0] === 'dado-alice-1', 'Evento da conta ativa recebido');

    // Usuário troca de conta para user-bob
    currentUserId = 'user-bob';

    // Evento tardio recebido pelo listener antigo de user-alice
    if (typeof fakeEmitSnapshot === 'function') {
      (fakeEmitSnapshot as (d: string) => void)('dado-alice-2');
    }
    assert(
      processedEvents.length === 1,
      'Evento tardio da conta antiga (user-alice) DEVE ser descartado após troca para user-bob'
    );

    cancel();
    console.log('  ✅ Guarda de UID validada: eventos de contas antigas são ignorados após troca de conta ou logout.');
  }

  console.log('\n🎉 Todos os testes de condições de corrida em assinaturas assíncronas foram aprovados!');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de asyncListenerCleanup:', err);
  process.exit(1);
});
