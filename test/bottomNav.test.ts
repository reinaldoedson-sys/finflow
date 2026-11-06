import { getBottomNavActiveId } from '../src/domain/bottomNav';

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
  console.log('--- TESTES: RESOLUÇÃO DE ABA ATIVA DA BOTTOM NAV (getBottomNavActiveId) ---');

  // Cobertura explícita das 10 abas atuais do FinFlow
  const expectedMappings: Record<string, 'dashboard' | 'transactions' | 'installments' | 'more'> = {
    dashboard: 'dashboard',
    transactions: 'transactions',
    accounts: 'more',
    portfolio: 'more',
    investments: 'more',
    installments: 'installments',
    budgets: 'more',
    goals: 'more',
    reports: 'more',
    settings: 'more',
  };

  const tabs = Object.keys(expectedMappings);
  assert(tabs.length === 10, `Exatamente 10 abas mapeadas (encontradas: ${tabs.length})`);

  for (const tab of tabs) {
    const expected = expectedMappings[tab];
    const actual = getBottomNavActiveId(tab);
    assert(
      actual === expected,
      `Aba "${tab}" mapeia para "${expected}" (obtido: "${actual}")`
    );
  }

  // Casos de borda e abas desconhecidas
  {
    assert(getBottomNavActiveId(null) === 'more', 'null retorna "more"');
    assert(getBottomNavActiveId(undefined) === 'more', 'undefined retorna "more"');
    assert(getBottomNavActiveId('') === 'more', 'string vazia retorna "more"');
    assert(getBottomNavActiveId('qualquer_outra') === 'more', 'aba desconhecida retorna "more"');
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
