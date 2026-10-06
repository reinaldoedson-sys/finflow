import {
  calculateTransactionTotal,
  validateInvestmentTransaction,
  createInvestmentTransaction
} from '../src/domain/investmentTransactions';

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

console.log('--- INICIANDO TESTES DO LEDGER DE INVESTIMENTOS (ETAPA 9) ---');

const mockAssets = [
  { id: 'inv-petr4' },
  { id: 'inv-mxrf11' },
  { id: 'inv-btc' }
];

// Teste A: criação de compra válida
{
  const tx = createInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 100,
    price: 35.50,
    totalAmount: 3550.00
  }, mockAssets);

  assert(tx.id.startsWith('itx-'), 'Teste A: ID gerado com prefixo itx-');
  assert(tx.type === 'buy', 'Teste A: Tipo é buy');
  assert(tx.quantity === 100, 'Teste A: Quantidade é 100');
  assert(tx.price === 35.50, 'Teste A: Preço é 35.50');
  assert(tx.totalAmount === 3550.00, 'Teste A: Total é 3550.00');
  assert(typeof tx.createdAt === 'string', 'Teste A: createdAt gerado');
}

// Teste B: criação de venda válida
{
  const tx = createInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'sell',
    date: '2026-10-02',
    quantity: 50,
    price: 37.00,
    totalAmount: 1850.00
  }, mockAssets);

  assert(tx.type === 'sell', 'Teste B: Tipo é sell');
  assert(tx.quantity === 50, 'Teste B: Quantidade vendida é 50');
  assert(tx.totalAmount === 1850.00, 'Teste B: Total é 1850.00');
}

// Teste C: criação de dividendo válido (permite quantidade zero)
{
  const tx = createInvestmentTransaction({
    assetId: 'inv-mxrf11',
    type: 'dividend',
    date: '2026-10-05',
    quantity: 0,
    price: 0,
    totalAmount: 30.50,
    notes: 'Rendimento mensal do fundo'
  }, mockAssets);

  assert(tx.type === 'dividend', 'Teste C: Tipo é dividend');
  assert(tx.quantity === 0, 'Teste C: Dividendo permite quantidade zero');
  assert(tx.totalAmount === 30.50, 'Teste C: Valor do dividendo correto');
  assert(tx.notes === 'Rendimento mensal do fundo', 'Teste C: Notas preservadas');
}

// Teste D: rejeição de tipo inválido
{
  const result = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'deposit' as any,
    date: '2026-10-01',
    quantity: 10,
    price: 10,
    totalAmount: 100
  });

  assert(!result.isValid, 'Teste D: Tipo inválido é rejeitado');
  assert(typeof result.error === 'string', 'Teste D: Retorna mensagem de erro');
}

// Teste E: rejeição de quantidade negativa
{
  const resultNegative = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: -10,
    price: 30,
    totalAmount: 300
  });

  assert(!resultNegative.isValid, 'Teste E: Quantidade negativa é rejeitada');

  const resultZeroBuy = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 0,
    price: 30,
    totalAmount: 0
  });

  assert(!resultZeroBuy.isValid, 'Teste E: Quantidade zero para compra é rejeitada');
}

// Teste F: rejeição de valor negativo
{
  const resultNegPrice = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 10,
    price: -5,
    totalAmount: 50
  });

  assert(!resultNegPrice.isValid, 'Teste F: Preço negativo é rejeitado');

  const resultNegTotal = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 10,
    price: 10,
    totalAmount: -100
  });

  assert(!resultNegTotal.isValid, 'Teste F: Total negativo é rejeitado');
}

// Teste G: rejeição de NaN/Infinity
{
  const resultNaNQty = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: NaN,
    price: 20,
    totalAmount: 200
  });

  assert(!resultNaNQty.isValid, 'Teste G: NaN na quantidade é rejeitado');

  const resultInfPrice = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 10,
    price: Infinity,
    totalAmount: 200
  });

  assert(!resultInfPrice.isValid, 'Teste G: Infinity no preço é rejeitado');
}

// Teste H: rejeição de operação sem assetId e ativo inexistente
{
  const resultNoAsset = validateInvestmentTransaction({
    assetId: '',
    type: 'buy',
    date: '2026-10-01',
    quantity: 10,
    price: 20,
    totalAmount: 200
  });

  assert(!resultNoAsset.isValid, 'Teste H: Operação sem assetId é rejeitada');

  let threwNonExistent = false;
  try {
    createInvestmentTransaction({
      assetId: 'inv-inexistente',
      type: 'buy',
      date: '2026-10-01',
      quantity: 10,
      price: 20,
      totalAmount: 200
    }, mockAssets);
  } catch (err: any) {
    threwNonExistent = true;
  }
  assert(threwNonExistent, 'Teste H: Operação apontando para ativo inexistente lança erro');
}

// Teste I: cálculo de totalAmount usando precisão monetária (centavos)
{
  // 3 cotas a R$ 10.33 -> 3 * 1033 centavos = 3099 centavos -> R$ 30.99
  const total = calculateTransactionTotal(3, 10.33);
  assert(total === 30.99, `Teste I: Cálculo com centavos exatos (esperado 30.99, obtido: ${total})`);

  // Se createInvestmentTransaction não receber totalAmount, calcula automaticamente
  const txAuto = createInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 100,
    price: 20.00,
    totalAmount: 0 // Solicita cálculo automático
  }, mockAssets);

  assert(txAuto.totalAmount === 2000.00, `Teste I: Cálculo automático de totalAmount (esperado 2000.00, obtido: ${txAuto.totalAmount})`);
}

// Teste J: IDs diferentes para duas operações criadas
{
  const tx1 = createInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 10,
    price: 20,
    totalAmount: 200
  }, mockAssets);

  const tx2 = createInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-01',
    quantity: 10,
    price: 20,
    totalAmount: 200
  }, mockAssets);

  assert(tx1.id !== tx2.id, `Teste J: IDs são únicos e distintos (${tx1.id} !== ${tx2.id})`);
}

console.log(`\nResultado Final dos Testes do Ledger de Investimentos: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
}
