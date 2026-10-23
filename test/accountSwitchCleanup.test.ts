import {
  getLocalStorageKeysToClearOnAccountSwitch,
  getLocalStorageKeysToClearOnWipe,
} from '../src/domain/localOwnership';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes de limpeza de chaves do localStorage na troca de conta e wipe do aparelho...');

  const sampleKeys = [
    // Chaves de dados do app (devem ser apagadas em ambos os casos)
    'finflow_app_categories',
    'finflow_app_accounts',
    'finflow_app_credit_cards',
    'finflow_app_budgets',
    'finflow_app_goals',
    'finflow_app_goal_movements',
    'finflow_app_installment_plans',
    'finflow_app_transactions',
    'finflow_app_investments',
    'finflow_app_investment_transactions',
    'finflow_app_currency',
    'finflow_app_has_initialized',
    'finflow_app_demo_cleared',
    'finflow_app_pending_sync_queue',

    // Chaves legadas de fila de sincronização (devem ser apagadas em ambos os casos)
    'finflow_pending_queue',
    'finflow_pending_sync_queue',

    // Configuração de segurança/PIN da conta anterior (deve ser apagada em ambos os casos)
    'finflow_security_v1',

    // Chaves críticas preservadas na troca de conta, mas apagadas no Wipe total
    'finflow_auth_hint',
    'finflow_local_owner',

    // Chaves alheias ao FinFlow (NUNCA podem ser apagadas)
    'outra_chave',
    'user_settings_externa',
    'theme_override',
    'loglevel',
  ];

  // =========================================================================
  // 1. Testes de getLocalStorageKeysToClearOnAccountSwitch
  // =========================================================================
  console.log('\n--- 1. Testando getLocalStorageKeysToClearOnAccountSwitch ---');
  const switchKeys = getLocalStorageKeysToClearOnAccountSwitch(sampleKeys);

  // Confirma que as chaves finflow_app_* estão presentes
  assert(switchKeys.includes('finflow_app_categories'), 'deve incluir finflow_app_categories');
  assert(switchKeys.includes('finflow_app_transactions'), 'deve incluir finflow_app_transactions');
  assert(switchKeys.includes('finflow_app_pending_sync_queue'), 'deve incluir finflow_app_pending_sync_queue');
  assert(switchKeys.includes('finflow_app_demo_cleared'), 'deve incluir finflow_app_demo_cleared');

  // Confirma que as filas legadas estão presentes
  assert(switchKeys.includes('finflow_pending_queue'), 'deve incluir finflow_pending_queue');
  assert(switchKeys.includes('finflow_pending_sync_queue'), 'deve incluir finflow_pending_sync_queue');

  // Confirma que finflow_security_v1 está presente
  assert(switchKeys.includes('finflow_security_v1'), 'deve incluir finflow_security_v1');

  // Confirma que finflow_auth_hint e finflow_local_owner NÃO estão presentes
  assert(!switchKeys.includes('finflow_auth_hint'), 'NÃO deve incluir finflow_auth_hint');
  assert(!switchKeys.includes('finflow_local_owner'), 'NÃO deve incluir finflow_local_owner');

  // Confirma que chaves alheias NÃO estão presentes
  assert(!switchKeys.includes('outra_chave'), 'NÃO deve incluir outra_chave');
  assert(!switchKeys.includes('user_settings_externa'), 'NÃO deve incluir user_settings_externa');
  assert(!switchKeys.includes('theme_override'), 'NÃO deve incluir theme_override');
  assert(!switchKeys.includes('loglevel'), 'NÃO deve incluir loglevel');

  // 14 chaves finflow_app_* + 2 filas legadas + 1 security = 17 chaves
  assert(switchKeys.length === 17, `Esperado 17 chaves a apagar na troca, recebeu ${switchKeys.length}`);
  assert(getLocalStorageKeysToClearOnAccountSwitch([]).length === 0, 'Lista vazia deve devolver array vazio');
  console.log('  ✅ getLocalStorageKeysToClearOnAccountSwitch validado com sucesso.');

  // =========================================================================
  // 2. Testes de getLocalStorageKeysToClearOnWipe
  // =========================================================================
  console.log('\n--- 2. Testando getLocalStorageKeysToClearOnWipe ---');
  const wipeKeys = getLocalStorageKeysToClearOnWipe(sampleKeys);

  // Deve incluir todas as chaves da troca de conta
  for (const k of switchKeys) {
    assert(wipeKeys.includes(k), `Wipe deve incluir chave "${k}" da troca de conta`);
  }

  // Deve incluir adicionalmente finflow_auth_hint e finflow_local_owner
  assert(wipeKeys.includes('finflow_auth_hint'), 'Wipe deve incluir finflow_auth_hint');
  assert(wipeKeys.includes('finflow_local_owner'), 'Wipe deve incluir finflow_local_owner');

  // NUNCA deve incluir chaves alheias
  assert(!wipeKeys.includes('outra_chave'), 'Wipe NÃO deve incluir outra_chave');
  assert(!wipeKeys.includes('user_settings_externa'), 'Wipe NÃO deve incluir user_settings_externa');
  assert(!wipeKeys.includes('theme_override'), 'Wipe NÃO deve incluir theme_override');
  assert(!wipeKeys.includes('loglevel'), 'Wipe NÃO deve incluir loglevel');

  // 17 chaves da troca + 2 (auth_hint e local_owner) = 19 chaves
  assert(wipeKeys.length === 19, `Esperado 19 chaves a apagar no wipe, recebeu ${wipeKeys.length}`);
  assert(getLocalStorageKeysToClearOnWipe([]).length === 0, 'Lista vazia deve devolver array vazio no wipe');
  console.log('  ✅ getLocalStorageKeysToClearOnWipe validado com sucesso.');

  console.log('\n🎉 Todos os testes de limpeza e wipe foram aprovados!');
}

runTests().catch(err => {
  console.error('\n❌ Falha no teste accountSwitchCleanup:', err);
  process.exit(1);
});
