import { loadFirebase, preloadFirebase } from '../src/firebaseLoader';
import { shouldLoadFirebaseOnBoot, AUTH_HINT_STORAGE_KEY } from '../src/context/AuthContext';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests(): Promise<void> {
  console.log('🧪 Iniciando testes do firebaseLoader e decisão de boot...');

  // =========================================================================
  // 1. Memoização de loadFirebase()
  // =========================================================================
  console.log('\n--- 1. Validando memoização de loadFirebase() ---');
  const promise1 = loadFirebase();
  const promise2 = loadFirebase();

  assert(
    promise1 === promise2,
    'loadFirebase() deve retornar exatamente a mesma Promise em chamadas consecutivas (memoização)'
  );

  const [module1, module2] = await Promise.all([promise1, promise2]);
  assert(
    module1 === module2,
    'Ambas as Promises devem resolver para a mesma referência do módulo do Firebase'
  );
  assert(
    Boolean(module1.auth && module1.db),
    'O módulo do Firebase resolvido deve conter as instâncias inicializadas de auth e db'
  );
  console.log('  ✅ Memoização de loadFirebase() validada com sucesso.');

  // =========================================================================
  // 2. preloadFirebase() seguro (não lança exceção)
  // =========================================================================
  console.log('\n--- 2. Validando preloadFirebase() seguro ---');
  const preloadResult = await preloadFirebase();
  assert(
    preloadResult !== undefined,
    'preloadFirebase() deve resolver com sucesso ou null, sem rejeição'
  );
  console.log('  ✅ preloadFirebase() executado com sucesso e sem exceções.');

  // =========================================================================
  // 3. Lógica da flag de sessão (shouldLoadFirebaseOnBoot)
  // =========================================================================
  console.log('\n--- 3. Validando decisão de carregamento na inicialização ---');

  // Cenário A: Sem flag (novo usuário ou deslogado) -> NÃO deve carregar Firebase na abertura
  const emptyStorage: Pick<Storage, 'getItem'> = {
    getItem: (key: string) => (key === AUTH_HINT_STORAGE_KEY ? null : null),
  };
  const shouldLoadWhenNoHint = shouldLoadFirebaseOnBoot(emptyStorage);
  assert(
    shouldLoadWhenNoHint === false,
    'Sem flag de autenticação no storage, shouldLoadFirebaseOnBoot() deve retornar false'
  );
  console.log('  ✅ Sem flag no storage: Firebase não é carregado na abertura (Local-first ativo)');

  // Cenário B: Com flag (usuário já logado anteriormente) -> DEVE carregar Firebase na abertura
  const loggedStorage: Pick<Storage, 'getItem'> = {
    getItem: (key: string) => (key === AUTH_HINT_STORAGE_KEY ? 'true' : null),
  };
  const shouldLoadWhenHintExists = shouldLoadFirebaseOnBoot(loggedStorage);
  assert(
    shouldLoadWhenHintExists === true,
    'Com flag presente no storage, shouldLoadFirebaseOnBoot() deve retornar true'
  );
  console.log('  ✅ Com flag no storage: Firebase é carregado para revalidar sessão');

  // Cenário C: Storage que lança exceção (ex.: cookies/storage bloqueados no navegador) -> fallback seguro false
  const throwingStorage: Pick<Storage, 'getItem'> = {
    getItem: () => {
      throw new Error('Access denied to localStorage');
    },
  };
  const shouldLoadOnStorageError = shouldLoadFirebaseOnBoot(throwingStorage);
  assert(
    shouldLoadOnStorageError === false,
    'Em caso de erro ao acessar o storage, deve retornar false com segurança'
  );
  console.log('  ✅ Falha de acesso ao storage: fallback seguro para false');

  console.log('\n🎉 Todos os testes de firebaseLoader e AuthContext boot foram aprovados!');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de firebaseLoader:', err);
  process.exit(1);
});
