import { parseLaunchAction, removeLaunchParams } from '../src/domain/launchActions';

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

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message} (esperado ${expectedStr}, obtido ${actualStr})`);
    failed++;
  }
}

function runTests() {
  console.log('--- TESTES: ATALHOS DE LANÇAMENTO (PWA LAUNCH ACTIONS) ---\n');

  console.log('[1] parseLaunchAction:');
  {
    // ?acao=nova-despesa
    assertDeepEqual(
      parseLaunchAction('?acao=nova-despesa'),
      { kind: 'new-transaction', type: 'expense' },
      '?acao=nova-despesa devolve { kind: "new-transaction", type: "expense" }'
    );

    // acao=nova-despesa sem ? inicial
    assertDeepEqual(
      parseLaunchAction('acao=nova-despesa'),
      { kind: 'new-transaction', type: 'expense' },
      'acao=nova-despesa sem prefixo ? também é reconhecido'
    );

    // ?acao=nova-receita
    assertDeepEqual(
      parseLaunchAction('?acao=nova-receita'),
      { kind: 'new-transaction', type: 'income' },
      '?acao=nova-receita devolve { kind: "new-transaction", type: "income" }'
    );

    // ?foo=bar&acao=nova-despesa
    assertDeepEqual(
      parseLaunchAction('?foo=bar&acao=nova-despesa'),
      { kind: 'new-transaction', type: 'expense' },
      '?foo=bar&acao=nova-despesa reconhece expense preservando contexto'
    );

    // ?acao=nova-receita&utm_source=pwa
    assertDeepEqual(
      parseLaunchAction('?acao=nova-receita&utm_source=pwa'),
      { kind: 'new-transaction', type: 'income' },
      '?acao=nova-receita&utm_source=pwa reconhece income'
    );

    // ?acao=compartilhar com texto de PIX
    const shareAction = parseLaunchAction('?acao=compartilhar&texto=Pagamento+PIX+R%24+85%2C00+para+Mercado+Central&titulo=Comprovante');
    assert(shareAction !== null && shareAction.kind === 'shared-content', 'parseLaunchAction reconhece acao=compartilhar');
    if (shareAction && shareAction.kind === 'shared-content') {
      assert(shareAction.type === 'expense', 'Tipo compartilhado é expense');
      assert(shareAction.amount === 85.0, `Valor extraído 85.0 (obtido: ${shareAction.amount})`);
      assert(shareAction.description === 'Mercado Central', `Descrição extraída: "${shareAction.description}"`);
    }

    // Valores desconhecidos ou inválidos
    assert(parseLaunchAction('?acao=outro') === null, '?acao=outro devolve null');
    assert(parseLaunchAction('?outro=1') === null, '?outro=1 devolve null');
    assert(parseLaunchAction('') === null, 'String vazia "" devolve null');
    assert(parseLaunchAction('?') === null, '"?" puro devolve null');
    assert(parseLaunchAction(null) === null, 'null devolve null');
    assert(parseLaunchAction(undefined) === null, 'undefined devolve null');
  }

  console.log('\n[2] removeLaunchParams:');
  {
    // Remove quando é o único parâmetro
    assert(
      removeLaunchParams('/', '?acao=nova-despesa', '') === '/',
      'remove acao quando é o único parâmetro: ("/", "?acao=nova-despesa", "") -> "/"'
    );

    // Remove quando é o único parâmetro com prefixo sem ?
    assert(
      removeLaunchParams('/', 'acao=nova-despesa', '') === '/',
      'remove acao sem interrogação: ("/", "acao=nova-despesa", "") -> "/"'
    );

    // Remove acao preservando outros parâmetros
    assert(
      removeLaunchParams('/', '?foo=1&acao=nova-despesa&bar=2', '') === '/?foo=1&bar=2',
      'remove acao preservando outros parâmetros: ("/", "?foo=1&acao=nova-despesa&bar=2", "") -> "/?foo=1&bar=2"'
    );

    // Remove parâmetros de compartilhamento (acao, texto, titulo, link)
    assert(
      removeLaunchParams('/', '?acao=compartilhar&texto=teste&titulo=comp&utm=1', '#/transacoes') === '/?utm=1#/transacoes',
      'remove parâmetros de compartilhamento (acao, texto, titulo) preservando outros'
    );

    // Preserva hash
    assert(
      removeLaunchParams('/', '?acao=nova-despesa', '#/analises') === '/#/analises',
      'preserva hash: ("/", "?acao=nova-despesa", "#/analises") -> "/#/analises"'
    );

    // Preserva parâmetros restantes e hash
    assert(
      removeLaunchParams('/', '?acao=nova-despesa&ref=pwa', '#/analises') === '/?ref=pwa#/analises',
      'preserva parâmetros restantes e hash juntos'
    );

    // Sem search
    assert(
      removeLaunchParams('/app', '', '#/contas') === '/app#/contas',
      'sem search: ("/app", "", "#/contas") -> "/app#/contas"'
    );

    // Path padrão vazio vira "/"
    assert(
      removeLaunchParams('', '', '') === '/',
      'parâmetros vazios devolvem "/"'
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
