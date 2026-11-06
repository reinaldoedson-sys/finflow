import { getPaymentMethodLabel, PAYMENT_METHOD_LABELS } from '../src/domain/paymentMethods';

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
  console.log('--- TESTES: RÓTULOS DE FORMAS DE PAGAMENTO (getPaymentMethodLabel) ---');

  // 1. pix -> "Pix"
  {
    const label = getPaymentMethodLabel('pix');
    assert(label === 'Pix', `pix retorna "Pix" (obtido: "${label}")`);
  }

  // 2. credit_card -> "Cartão de crédito"
  {
    const label = getPaymentMethodLabel('credit_card');
    assert(label === 'Cartão de crédito', `credit_card retorna "Cartão de crédito" (obtido: "${label}")`);
  }

  // 3. debit_card -> "Cartão de débito"
  {
    const label = getPaymentMethodLabel('debit_card');
    assert(label === 'Cartão de débito', `debit_card retorna "Cartão de débito" (obtido: "${label}")`);
  }

  // 4. bank_slip -> "Boleto"
  {
    const label = getPaymentMethodLabel('bank_slip');
    assert(label === 'Boleto', `bank_slip retorna "Boleto" (obtido: "${label}")`);
  }

  // 5. cash -> "Dinheiro"
  {
    const label = getPaymentMethodLabel('cash');
    assert(label === 'Dinheiro', `cash retorna "Dinheiro" (obtido: "${label}")`);
  }

  // 6. transfer -> "Transferência"
  {
    const label = getPaymentMethodLabel('transfer');
    assert(label === 'Transferência', `transfer retorna "Transferência" (obtido: "${label}")`);
  }

  // 7. Valor desconhecido -> devolve o texto original
  {
    const labelUnknown = getPaymentMethodLabel('vale_refeicao');
    assert(labelUnknown === 'vale_refeicao', `valor desconhecido "vale_refeicao" retorna o texto original (obtido: "${labelUnknown}")`);

    const labelCustom = getPaymentMethodLabel('crypto_usdt');
    assert(labelCustom === 'crypto_usdt', `valor desconhecido "crypto_usdt" retorna o texto original (obtido: "${labelCustom}")`);
  }

  // 8. Normalização de maiúsculas/espaços (robustez)
  {
    const labelUpper = getPaymentMethodLabel('BANK_SLIP');
    assert(labelUpper === 'Boleto', `BANK_SLIP em maiúsculo normaliza e retorna "Boleto" (obtido: "${labelUpper}")`);

    const labelUpperPix = getPaymentMethodLabel('PIX');
    assert(labelUpperPix === 'Pix', `PIX em maiúsculo normaliza e retorna "Pix" (obtido: "${labelUpperPix}")`);
  }

  // 9. Verificação da tabela estática de mapeamento
  {
    assert(PAYMENT_METHOD_LABELS.pix === 'Pix', 'PAYMENT_METHOD_LABELS possui pix mapeado');
    assert(PAYMENT_METHOD_LABELS.credit_card === 'Cartão de crédito', 'PAYMENT_METHOD_LABELS possui credit_card mapeado');
    assert(PAYMENT_METHOD_LABELS.debit_card === 'Cartão de débito', 'PAYMENT_METHOD_LABELS possui debit_card mapeado');
    assert(PAYMENT_METHOD_LABELS.bank_slip === 'Boleto', 'PAYMENT_METHOD_LABELS possui bank_slip mapeado');
    assert(PAYMENT_METHOD_LABELS.cash === 'Dinheiro', 'PAYMENT_METHOD_LABELS possui cash mapeado');
    assert(PAYMENT_METHOD_LABELS.transfer === 'Transferência', 'PAYMENT_METHOD_LABELS possui transfer mapeado');
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
