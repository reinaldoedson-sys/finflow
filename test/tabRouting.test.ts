import {
  TAB_SLUGS,
  hashFromTab,
  tabFromHash,
  getNavigationAction,
  TabId
} from '../src/domain/tabRouting';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

function runTests() {
  console.log('--- TESTES: ROTEAMENTO DE ABAS E NAVEGAÇÃO HISTORY API ---\n');

  // 1. Mapeamento exato de todas as 11 abas do FinFlow
  console.log('[1] Cobertura e verificação das 11 abas:');
  const expectedTabs: TabId[] = [
    'dashboard',
    'transactions',
    'accounts',
    'investments',
    'portfolio',
    'installments',
    'budgets',
    'goals',
    'reports',
    'analytics',
    'settings',
  ];

  const actualTabs = Object.keys(TAB_SLUGS) as TabId[];
  assert(actualTabs.length === 11, `Exatamente 11 abas mapeadas no TAB_SLUGS (obtido: ${actualTabs.length})`);

  for (const tab of expectedTabs) {
    const slug = TAB_SLUGS[tab];
    assert(Boolean(slug), `Aba "${tab}" possui slug definido: ${slug}`);

    // Ida: tab -> hash
    const generatedHash = hashFromTab(tab);
    assert(generatedHash === slug, `hashFromTab("${tab}") devolve "${slug}"`);

    // Volta: hash -> tab
    const resolvedTab = tabFromHash(slug);
    assert(resolvedTab === tab, `tabFromHash("${slug}") devolve "${tab}"`);
  }

  // 2. Hashes inválidos, vazios ou com lixo
  console.log('\n[2] Hashes inválidos, vazios e com lixo:');
  {
    assert(tabFromHash('') === 'dashboard', 'String vazia devolve "dashboard"');
    assert(tabFromHash(null) === 'dashboard', 'null devolve "dashboard"');
    assert(tabFromHash(undefined) === 'dashboard', 'undefined devolve "dashboard"');
    assert(tabFromHash('#') === 'dashboard', '"#" puro devolve "dashboard"');
    assert(tabFromHash('#/') === 'dashboard', '"#/" devolve "dashboard"');
    assert(tabFromHash('#/xyz') === 'dashboard', '"#/xyz" desconhecido devolve "dashboard"');
    assert(tabFromHash('#/transacoes/extra') === 'dashboard', '"#/transacoes/extra" com lixo devolve "dashboard"');
    assert(tabFromHash('#/contas/123') === 'dashboard', '"#/contas/123" com subrota inexistente devolve "dashboard"');
    assert(tabFromHash('transacoes') === 'dashboard', '"transacoes" sem "#/" devolve "dashboard"');

    assert(hashFromTab(null) === '#/', 'hashFromTab(null) devolve "#/"');
    assert(hashFromTab(undefined) === '#/', 'hashFromTab(undefined) devolve "#/"');
    assert(hashFromTab('desconhecida') === '#/', 'hashFromTab("desconhecida") devolve "#/"');
  }

  // 3. Tabela completa de getNavigationAction
  console.log('\n[3] Tabela completa de getNavigationAction:');

  // 3.1 Mesma aba (deve retornar 'none')
  {
    assert(
      getNavigationAction('dashboard', 'dashboard', false) === 'none',
      'dashboard -> dashboard com dashboardBelow=false -> none'
    );
    assert(
      getNavigationAction('dashboard', 'dashboard', true) === 'none',
      'dashboard -> dashboard com dashboardBelow=true -> none'
    );
    assert(
      getNavigationAction('transactions', 'transactions', true) === 'none',
      'transactions -> transactions com dashboardBelow=true -> none'
    );
    assert(
      getNavigationAction('installments', 'installments', false) === 'none',
      'installments -> installments com dashboardBelow=false -> none'
    );
  }

  // 3.2 De dashboard para outra aba (deve retornar 'push' independente da flag)
  {
    assert(
      getNavigationAction('dashboard', 'transactions', false) === 'push',
      'dashboard -> transactions com dashboardBelow=false -> push'
    );
    assert(
      getNavigationAction('dashboard', 'accounts', true) === 'push',
      'dashboard -> accounts com dashboardBelow=true -> push'
    );
    assert(
      getNavigationAction('dashboard', 'settings', false) === 'push',
      'dashboard -> settings com dashboardBelow=false -> push'
    );
  }

  // 3.3 De outra aba para outra aba (deve retornar 'replace')
  {
    // Com entrada de dashboard abaixo
    assert(
      getNavigationAction('transactions', 'accounts', true) === 'replace',
      'transactions -> accounts com dashboardBelow=true -> replace'
    );
    assert(
      getNavigationAction('accounts', 'investments', true) === 'replace',
      'accounts -> investments com dashboardBelow=true -> replace'
    );

    // Sem entrada de dashboard abaixo (link direto ou reload sem base)
    assert(
      getNavigationAction('transactions', 'accounts', false) === 'replace',
      'transactions -> accounts com dashboardBelow=false -> replace'
    );
    assert(
      getNavigationAction('investments', 'portfolio', false) === 'replace',
      'investments -> portfolio com dashboardBelow=false -> replace'
    );
  }

  // 3.4 De outra aba para dashboard (com e sem entrada de dashboard abaixo)
  {
    // COM dashboardBelow=true: deve retornar 'back' para desempilhar e retornar ao Início
    assert(
      getNavigationAction('transactions', 'dashboard', true) === 'back',
      'transactions -> dashboard com dashboardBelow=true -> back'
    );
    assert(
      getNavigationAction('accounts', 'dashboard', true) === 'back',
      'accounts -> dashboard com dashboardBelow=true -> back'
    );
    assert(
      getNavigationAction('settings', 'dashboard', true) === 'back',
      'settings -> dashboard com dashboardBelow=true -> back'
    );

    // SEM dashboardBelow=false: deve retornar 'replace' para não tentar voltar no vazio
    assert(
      getNavigationAction('transactions', 'dashboard', false) === 'replace',
      'transactions -> dashboard com dashboardBelow=false -> replace'
    );
    assert(
      getNavigationAction('accounts', 'dashboard', false) === 'replace',
      'accounts -> dashboard com dashboardBelow=false -> replace'
    );
    assert(
      getNavigationAction('reports', 'dashboard', false) === 'replace',
      'reports -> dashboard com dashboardBelow=false -> replace'
    );
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
