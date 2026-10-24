import {
  wipeLocalFinancialStorage,
  executeClearAndSwitchAccount,
  executeSignOutAndWipeDevice,
  WipeStorageDependencies,
  SwitchAccountDependencies,
  SignOutAndWipeDependencies,
} from '../src/services/deviceWipeService';
import { LOCAL_OWNER_STORAGE_KEY, AUTH_HINT_STORAGE_KEY_NAME } from '../src/domain/localOwnership';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes de deviceWipeService...');

  // =========================================================================
  // 1. Ordem de execução de wipeLocalFinancialStorage
  // =========================================================================
  console.log('\n--- 1. Ordem das chamadas em wipeLocalFinancialStorage ---');
  {
    const callLog: string[] = [];
    const removedKeys: string[] = [];

    const deps: WipeStorageDependencies = {
      clearAllFinancialEntities: async () => {
        callLog.push('clearAllFinancialEntities');
      },
      clearSyncQueue: async () => {
        callLog.push('clearSyncQueue');
      },
      storage: {
        removeItem: (key: string) => {
          callLog.push(`removeItem:${key}`);
          removedKeys.push(key);
        },
      },
      saveEmptyPendingQueue: () => {
        callLog.push('saveEmptyPendingQueue');
      },
    };

    const keys = ['key1', 'key2'];
    await wipeLocalFinancialStorage(keys, deps);

    assert(callLog[0] === 'clearAllFinancialEntities', '1º deve ser clearAllFinancialEntities');
    assert(callLog[1] === 'clearSyncQueue', '2º deve ser clearSyncQueue');
    assert(callLog[2] === 'removeItem:key1', '3º deve ser removeItem key1');
    assert(callLog[3] === 'removeItem:key2', '4º deve ser removeItem key2');
    assert(callLog[4] === 'saveEmptyPendingQueue', '5º deve ser saveEmptyPendingQueue');
    console.log('  ✅ Ordem rigorosa de wipeLocalFinancialStorage validada.');
  }

  // =========================================================================
  // 2. Falha em uma chave não impede a remoção das demais
  // =========================================================================
  console.log('\n--- 2. Falha isolada em removeItem não trava as demais chaves ---');
  {
    const removedKeys: string[] = [];
    let savedEmptyQueue = false;

    const deps: WipeStorageDependencies = {
      clearAllFinancialEntities: async () => {},
      clearSyncQueue: async () => {},
      storage: {
        removeItem: (key: string) => {
          if (key === 'broken_key') {
            throw new Error('Falha de permissão / quota storage');
          }
          removedKeys.push(key);
        },
      },
      saveEmptyPendingQueue: () => {
        savedEmptyQueue = true;
      },
    };

    await wipeLocalFinancialStorage(['key_a', 'broken_key', 'key_b'], deps);

    assert(removedKeys.includes('key_a'), 'key_a deve ter sido removida');
    assert(removedKeys.includes('key_b'), 'key_b deve ter sido removida mesmo com erro na broken_key');
    assert(!removedKeys.includes('broken_key'), 'broken_key gerou erro e foi tratada');
    assert(savedEmptyQueue, 'saveEmptyPendingQueue deve ter sido chamada mesmo após falha na chave');
    console.log('  ✅ Isolamento contra falhas pontuais de storage validado.');
  }

  // =========================================================================
  // 3. executeClearAndSwitchAccount: ordem completa e reload no final
  // =========================================================================
  console.log('\n--- 3. Troca de conta (executeClearAndSwitchAccount) ---');
  {
    const callLog: string[] = [];
    let recordedNewOwner: string | null = null;
    let reloadTriggered = false;

    const sampleKeys = [
      'finflow_app_accounts',
      'finflow_app_transactions',
      'finflow_pending_queue',
      'finflow_security_v1',
      LOCAL_OWNER_STORAGE_KEY,
      AUTH_HINT_STORAGE_KEY_NAME,
      'outra_chave_qualquer',
    ];

    const deps: SwitchAccountDependencies = {
      currentUserUid: 'novo_uid_usuario_789',
      allKeys: sampleKeys,
      clearAllFinancialEntities: async () => {
        callLog.push('clearAllFinancialEntities');
      },
      clearSyncQueue: async () => {
        callLog.push('clearSyncQueue');
      },
      storage: {
        removeItem: (key: string) => {
          callLog.push(`removeItem:${key}`);
        },
      },
      saveEmptyPendingQueue: () => {
        callLog.push('saveEmptyPendingQueue');
      },
      setStoredOwner: (uid: string) => {
        callLog.push(`setStoredOwner:${uid}`);
        recordedNewOwner = uid;
      },
      reload: () => {
        callLog.push('reload');
        reloadTriggered = true;
      },
    };

    await executeClearAndSwitchAccount(deps);

    assert(recordedNewOwner === 'novo_uid_usuario_789', 'Novo dono deve ser gravado com o UID atual');
    assert(reloadTriggered, 'Reload deve ser chamado');

    // Confirma que setStoredOwner ocorreu após saveEmptyPendingQueue e antes do reload
    const emptyQueueIndex = callLog.indexOf('saveEmptyPendingQueue');
    const setOwnerIndex = callLog.indexOf('setStoredOwner:novo_uid_usuario_789');
    const reloadIndex = callLog.indexOf('reload');

    assert(emptyQueueIndex !== -1, 'saveEmptyPendingQueue deve ter sido executado');
    assert(setOwnerIndex > emptyQueueIndex, 'setStoredOwner deve ser executado APÓS limpeza');
    assert(reloadIndex === callLog.length - 1, 'reload DEVE ser a última operação executada');

    // Confirma que LOCAL_OWNER_STORAGE_KEY e AUTH_HINT_STORAGE_KEY_NAME NÃO foram apagados na troca
    assert(!callLog.includes(`removeItem:${LOCAL_OWNER_STORAGE_KEY}`), 'local_owner não deve ser apagado na troca de conta');
    assert(!callLog.includes(`removeItem:${AUTH_HINT_STORAGE_KEY_NAME}`), 'auth_hint não deve ser apagado na troca de conta');

    console.log('  ✅ Troca de conta validada: ordem correta e reload ao final.');
  }

  // =========================================================================
  // 4. executeClearAndSwitchAccount: sem UID não executa limpeza
  // =========================================================================
  console.log('\n--- 4. Troca de conta sem UID autenticado ---');
  {
    let anyAction = false;
    const deps: SwitchAccountDependencies = {
      currentUserUid: undefined,
      allKeys: ['finflow_app_accounts'],
      clearAllFinancialEntities: async () => { anyAction = true; },
      clearSyncQueue: async () => { anyAction = true; },
      saveEmptyPendingQueue: () => { anyAction = true; },
      setStoredOwner: () => { anyAction = true; },
      reload: () => { anyAction = true; },
    };

    await executeClearAndSwitchAccount(deps);
    assert(!anyAction, 'Sem currentUserUid, nada deve ser executado');
    console.log('  ✅ Operação sem UID ignorada com segurança.');
  }

  // =========================================================================
  // 5. executeSignOutAndWipeDevice: ordem completa e reload no final
  // =========================================================================
  console.log('\n--- 5. Sair e apagar aparelho (executeSignOutAndWipeDevice) ---');
  {
    const callLog: string[] = [];
    let logoutCalled = false;
    let reloadTriggered = false;

    const sampleKeys = [
      'finflow_app_accounts',
      'finflow_app_transactions',
      LOCAL_OWNER_STORAGE_KEY,
      AUTH_HINT_STORAGE_KEY_NAME,
      'outra_chave_qualquer',
    ];

    const deps: SignOutAndWipeDependencies = {
      logout: async () => {
        callLog.push('logout');
        logoutCalled = true;
      },
      allKeys: sampleKeys,
      clearAllFinancialEntities: async () => {
        callLog.push('clearAllFinancialEntities');
      },
      clearSyncQueue: async () => {
        callLog.push('clearSyncQueue');
      },
      storage: {
        removeItem: (key: string) => {
          callLog.push(`removeItem:${key}`);
        },
      },
      saveEmptyPendingQueue: () => {
        callLog.push('saveEmptyPendingQueue');
      },
      reload: () => {
        callLog.push('reload');
        reloadTriggered = true;
      },
    };

    await executeSignOutAndWipeDevice(deps);

    assert(logoutCalled, 'Logout deve ser chamado');
    assert(reloadTriggered, 'Reload deve ser chamado');

    assert(callLog[0] === 'logout', '1º deve ser logout');
    assert(callLog[1] === 'clearAllFinancialEntities', '2º deve ser clearAllFinancialEntities');
    assert(callLog[2] === 'clearSyncQueue', '3º deve ser clearSyncQueue');

    // No wipe completo, LOCAL_OWNER_STORAGE_KEY e AUTH_HINT_STORAGE_KEY_NAME DEVEM ser apagados
    assert(callLog.includes(`removeItem:${LOCAL_OWNER_STORAGE_KEY}`), 'Wipe deve apagar local_owner');
    assert(callLog.includes(`removeItem:${AUTH_HINT_STORAGE_KEY_NAME}`), 'Wipe deve apagar auth_hint');
    assert(!callLog.includes('removeItem:outra_chave_qualquer'), 'Wipe NÃO deve apagar chaves externas');

    const reloadIndex = callLog.indexOf('reload');
    assert(reloadIndex === callLog.length - 1, 'reload deve ser a última chamada');

    console.log('  ✅ Wipe total validado: logout prévio, limpeza completa e reload ao final.');
  }

  console.log('\n🎉 Todos os testes de deviceWipeService passaram com sucesso!');
}

runTests().catch(err => {
  console.error('\n❌ Falha nos testes de deviceWipeService:', err);
  process.exit(1);
});
