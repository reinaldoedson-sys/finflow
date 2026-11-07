import { parseReceiptOrShareText } from '../src/domain/receiptParser';

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

function assertClose(actual: number | undefined, expected: number, message: string) {
  if (actual !== undefined && Math.abs(actual - expected) < 0.001) {
    console.log(`✅ PASS: ${message} (${actual})`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}. Esperado: ${expected}, Obtido: ${actual}`);
    failed++;
  }
}

function runTests() {
  console.log('--- TESTES: PARSER DE COMPROVANTES E TEXTOS COMPARTILHADOS ---\n');

  console.log('[1] Comprovante padrão de PIX:');
  {
    const text = `Comprovante de pagamento PIX
Valor: R$ 125,50
Para: Padaria Central
Data: 15/04/2026
Chave PIX: 12345678900`;

    const result = parseReceiptOrShareText(text, 'Comprovante Banco');
    assert(result.type === 'expense', 'Identificado como despesa');
    assertClose(result.amount, 125.5, 'Valor extraído corretamente: 125.50');
    assert(result.description === 'Padaria Central', `Favorecido extraído: "${result.description}"`);
    assert(result.date === '2026-04-15', `Data convertida para ISO: ${result.date}`);
  }

  console.log('\n[2] Comprovante de PIX recebido (Receita):');
  {
    const text = `Você recebeu um PIX!
Origem: João Silva
Valor: R$ 500,00
Data: 20/05/2026`;

    const result = parseReceiptOrShareText(text);
    assert(result.type === 'income', 'Identificado como receita devido a "recebeu"');
    assertClose(result.amount, 500.0, 'Valor 500.00 extraído');
    assert(result.date === '2026-05-20', 'Data 20/05/2026 extraída');
  }

  console.log('\n[3] Texto simples ou compartilhado direto de mensagem:');
  {
    const text = 'Almoço no Restaurante Sabor R$ 45,90';
    const result = parseReceiptOrShareText(text);
    assert(result.type === 'expense', 'Tipo despesa');
    assertClose(result.amount, 45.9, 'Valor 45.90');
    assert(Boolean(result.description), `Descrição preenchida: ${result.description}`);
  }

  console.log('\n[4] Valores com separador de milhar:');
  {
    const text = 'Transferência realizada com sucesso. Valor: R$ 2.450,80 para Construtora Alpha em 01/06/2026.';
    const result = parseReceiptOrShareText(text);
    assertClose(result.amount, 2450.8, 'Valor com milhar convertido: 2450.80');
    assert(result.date === '2026-06-01', 'Data 2026-06-01');
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
