import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateAportePosition } from '../src/domain/investments';

console.log('--- INICIANDO TESTES DO CÁLCULO DE APORTE (PREÇO MÉDIO PONDERADO) ---');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

// 1. Aporte clássico em ativo existente
runTest('Aporte clássico: 10 cotas a R$ 20 + 10 cotas a R$ 30 = 20 cotas a R$ 25,00', () => {
  const result = calculateAportePosition(
    { quantity: 10, averagePrice: 20.00 },
    { quantity: 10, price: 30.00 }
  );

  assert.strictEqual(result.newQuantity, 20);
  assert.strictEqual(result.newAveragePrice, 25.00);
  assert.strictEqual(result.totalAporteAmount, 300.00);
  assert.strictEqual(result.newTotalCost, 500.00);
});

// 2. Aporte com quantidades desiguais
runTest('Aporte com quantidades desiguais: 100 cotas a R$ 32,50 + 20 cotas a R$ 35,80', () => {
  // Custo inicial: 100 * 32.50 = 3250.00
  // Aporte: 20 * 35.80 = 716.00
  // Custo novo: 3966.00
  // Nova quantidade: 120
  // Novo PM: 3966.00 / 120 = 33.05
  const result = calculateAportePosition(
    { quantity: 100, averagePrice: 32.50 },
    { quantity: 20, price: 35.80 }
  );

  assert.strictEqual(result.newQuantity, 120);
  assert.strictEqual(result.newAveragePrice, 33.05);
  assert.strictEqual(result.totalAporteAmount, 716.00);
  assert.strictEqual(result.newTotalCost, 3966.00);
});

// 3. Aporte em ativo que tinha posição zerada
runTest('Aporte em ativo zerado (0 cotas): passa a ter a quantidade e preço do aporte', () => {
  const result = calculateAportePosition(
    { quantity: 0, averagePrice: 0 },
    { quantity: 15, price: 10.50 }
  );

  assert.strictEqual(result.newQuantity, 15);
  assert.strictEqual(result.newAveragePrice, 10.50);
  assert.strictEqual(result.totalAporteAmount, 157.50);
  assert.strictEqual(result.newTotalCost, 157.50);
});

// 4. Aporte fracionário (ex: Criptoativos BTC)
runTest('Aporte fracionário: 0.5 BTC a R$ 300.000 + 0.25 BTC a R$ 400.000', () => {
  // Custo inicial: 0.5 * 300000 = 150000
  // Aporte: 0.25 * 400000 = 100000
  // Custo novo: 250000
  // Nova quantidade: 0.75
  // Novo PM: 250000 / 0.75 = 333333.33
  const result = calculateAportePosition(
    { quantity: 0.5, averagePrice: 300000 },
    { quantity: 0.25, price: 400000 }
  );

  assert.strictEqual(result.newQuantity, 0.75);
  assert.strictEqual(result.newAveragePrice, 333333.33);
  assert.strictEqual(result.totalAporteAmount, 100000);
  assert.strictEqual(result.newTotalCost, 250000);
});

// 5. Aporte inválido com quantidade zero ou negativa
runTest('Aporte com quantidade zero não altera posição atual', () => {
  const result = calculateAportePosition(
    { quantity: 50, averagePrice: 15.00 },
    { quantity: 0, price: 20.00 }
  );

  assert.strictEqual(result.newQuantity, 50);
  assert.strictEqual(result.newAveragePrice, 15.00);
  assert.strictEqual(result.totalAporteAmount, 0);
  assert.strictEqual(result.newTotalCost, 750.00);
});

// 6. Aporte com preço zero
runTest('Aporte com preço zero não altera posição atual', () => {
  const result = calculateAportePosition(
    { quantity: 50, averagePrice: 15.00 },
    { quantity: 10, price: 0 }
  );

  assert.strictEqual(result.newQuantity, 50);
  assert.strictEqual(result.newAveragePrice, 15.00);
  assert.strictEqual(result.totalAporteAmount, 0);
});

// 7. Precisão de centavos com dízimas
runTest('Dízimas de centavos são arredondadas com segurança monetária', () => {
  // 3 cotas a 10.33 (30.99) + 2 cotas a 10.33 (20.66) = 5 cotas a 10.33 (51.65)
  const result = calculateAportePosition(
    { quantity: 3, averagePrice: 10.33 },
    { quantity: 2, price: 10.33 }
  );

  assert.strictEqual(result.newQuantity, 5);
  assert.strictEqual(result.newAveragePrice, 10.33);
  assert.strictEqual(result.totalAporteAmount, 20.66);
  assert.strictEqual(result.newTotalCost, 51.65);
});

console.log(`\nResultado Final dos Testes de Aporte: ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
}
