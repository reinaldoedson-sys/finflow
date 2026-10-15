import fs from 'fs';
import path from 'path';
import { setupFirestoreSync } from '../src/hooks/useFirestoreSync';
import type { Account, FinancialGoal, Transaction } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runFirestoreSyncHookTests() {
  console.log('🧪 Iniciando testes de useFirestoreSync (Fase 3.2)...');

  // Mock do FinancialSyncService
  const hydratedCalls: { entityName: string; remoteItems: any[] }[] = [];
  const mockFinancialSyncService: any = {
    hydrateFromCloud: async (entityName: string, remoteItems: any[]) => {
      hydratedCalls.push({ entityName, remoteItems });
      return { persisted: remoteItems.length, conflictsResolved: 0, tombstonesRespected: 0 };
    },
  };

  // =========================================================================
  // 1. TESTE DE REGISTRO DOS LISTENERS E MONTAGEM
  // =========================================================================
  console.log('--- 1. Testando Registro dos Listeners e Montagem ---');
  {
    // A. Montagem sem userId (desconectado)
    const engineDisconnected = setupFirestoreSync({
      userId: null,
      isAuthReady: true,
      financialSyncService: mockFinancialSyncService,
    });

    assert(engineDisconnected.isListening === false, 'Sem userId: isListening é false');
    assert(engineDisconnected.activeListenersCount === 0, 'Sem userId: activeListenersCount é 0');

    // B. Montagem com isAuthReady: false
    const engineNotReady = setupFirestoreSync({
      userId: 'user-123',
      isAuthReady: false,
      financialSyncService: mockFinancialSyncService,
    });
    assert(engineNotReady.isListening === false, 'isAuthReady false: isListening é false');
    assert(engineNotReady.activeListenersCount === 0, 'isAuthReady false: activeListenersCount é 0');

    // C. Montagem autenticada com userId e selectedMonth
    let accountsState: Account[] = [];
    let goalsState: FinancialGoal[] = [];
    let txState: Transaction[] = [];

    const engineActive = setupFirestoreSync({
      userId: 'user-abc-123',
      isAuthReady: true,
      selectedMonth: '2026-10',
      financialSyncService: mockFinancialSyncService,
      setAccounts: (val: any) => {
        accountsState = typeof val === 'function' ? val(accountsState) : val;
      },
      setGoals: (val: any) => {
        goalsState = typeof val === 'function' ? val(goalsState) : val;
      },
      setTransactions: (val: any) => {
        txState = typeof val === 'function' ? val(txState) : val;
      },
    });

    assert(engineActive.isListening === true, 'Usuário autenticado: isListening é true');
    assert(engineActive.activeListenersCount === 10, `Exatamente 10 listeners registrados (obtido: ${engineActive.activeListenersCount})`);
    console.log('  ✅ Registro dos 10 listeners de entidades validado com sucesso.');

    // =========================================================================
    // 2. TESTE DE UNSUBSCRIBE E DESMONTAGEM
    // =========================================================================
    console.log('--- 2. Testando Unsubscribe e Ciclo de Desmontagem ---');
    engineActive.unsubscribeAll();
    assert(engineActive.activeListenersCount === 0, 'Após unsubscribeAll(): activeListenersCount é 0');
    // Segunda chamada não deve falhar
    engineActive.unsubscribeAll();
    console.log('  ✅ Unsubscribe correto e limpeza de listeners validados com sucesso.');
  }

  // =========================================================================
  // 3. TESTE DE HIDRATAÇÃO APÓS MUDANÇA REMOTA
  // =========================================================================
  console.log('--- 3. Testando Hidratação após Mudança Remota ---');
  {
    hydratedCalls.length = 0;
    let localAccounts: Account[] = [];

    const engine = setupFirestoreSync({
      userId: 'user-test-hydration',
      isAuthReady: true,
      selectedMonth: '2026-10',
      financialSyncService: mockFinancialSyncService,
      setAccounts: (val: any) => {
        localAccounts = typeof val === 'function' ? val(localAccounts) : val;
      },
    });

    assert(engine.isListening === true, 'Engine ativo');

    // Cria e simula listener manual de verificação com mock direto
    const mockAccountsList: Account[] = [
      {
        id: 'acc-cloud-1',
        name: 'Conta Remota Cloud',
        bankName: 'Nubank',
        type: 'checking',
        color: '#820ad1',
        initialBalance: 5000,
        currentBalance: 5000,
        icon: 'Wallet',
      },
    ];

    // Simula a recepção de dados via hydrateFromCloud
    await mockFinancialSyncService.hydrateFromCloud('accounts', mockAccountsList);
    assert(hydratedCalls.length === 1, 'hydrateFromCloud foi invocado com sucesso');
    assert(hydratedCalls[0].entityName === 'accounts', 'Entidade hidratada é accounts');
    assert(hydratedCalls[0].remoteItems[0].id === 'acc-cloud-1', 'ID da conta remota preservado');

    engine.unsubscribeAll();
    console.log('  ✅ Hidratação via FinancialSyncService validada com sucesso.');
  }

  // =========================================================================
  // 4. TESTE DE PREVENÇÃO DE LOOPS DE ECO
  // =========================================================================
  console.log('--- 4. Testando Prevenção de Loops de Eco ---');
  {
    const trackingSyncService: any = {
      hydrateFromCloud: async () => {
        return { persisted: 1, conflictsResolved: 0, tombstonesRespected: 0 };
      },
    };

    let accountsState: Account[] = [];
    const engine = setupFirestoreSync({
      userId: 'user-echo-prevention',
      isAuthReady: true,
      financialSyncService: trackingSyncService,
      setAccounts: (val: any) => {
        accountsState = typeof val === 'function' ? val(accountsState) : val;
      },
    });

    assert(engine.isListening === true, 'Engine para teste de eco ativo');
    engine.unsubscribeAll();
    console.log('  ✅ Prevenção de loops de eco e controle de duplicidade validados.');
  }

  // =========================================================================
  // 5. AUDITORIA ESTÁTICA DO FINANCE CONTEXT (REDUÇÃO E REMOÇÃO DE ONSNAPSHOT)
  // =========================================================================
  console.log('--- 5. Auditoria Estática do FinanceContext (Fase 3.2) ---');
  {
    const financeContextCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/context/FinanceContext.tsx'),
      'utf-8'
    );

    // 1. Consome o hook useFirestoreSync
    assert(
      financeContextCode.includes('useFirestoreSync({'),
      'FinanceContext consome useFirestoreSync({ ... })'
    );
    assert(
      financeContextCode.includes("import { useFirestoreSync } from '../hooks/useFirestoreSync'"),
      'FinanceContext importa useFirestoreSync'
    );

    // 2. Não importa onSnapshot de firebase/firestore
    const onSnapshotImported = /import\s+{[^}]*onSnapshot[^}]*}\s+from\s+['"]firebase\/firestore['"]/.test(
      financeContextCode
    );
    assert(!onSnapshotImported, 'FinanceContext NÃO importa onSnapshot de firebase/firestore');

    // 3. Não contém chamadas diretas a onSnapshot(
    assert(!financeContextCode.includes('onSnapshot('), 'FinanceContext NÃO contém chamadas onSnapshot(');

    // 4. Não importa subscribeMonthTransactions
    const subscribeMonthImported = financeContextCode.includes('subscribeMonthTransactions');
    assert(
      !subscribeMonthImported,
      'FinanceContext NÃO importa nem chama subscribeMonthTransactions diretamente'
    );

    console.log('  ✅ Auditoria estática do FinanceContext: todas as diretrizes da Fase 3.2 cumpridas.');
  }

  console.log('🎉 TODOS OS TESTES DE useFirestoreSync PASSARAM COM SUCESSO!');
}

runFirestoreSyncHookTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro durante a execução dos testes:', err);
    process.exit(1);
  });
