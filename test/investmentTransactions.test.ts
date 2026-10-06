import * as fs from 'fs';
import * as path from 'path';
import {
  calculateTransactionTotal,
  validateInvestmentTransaction,
  createInvestmentTransaction,
  isValidDateString
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

console.log('--- INICIANDO TESTES DO LEDGER DE INVESTIMENTOS (ETAPA 9.5) ---');

const mockAssets = [
  { id: 'inv-petr4' },
  { id: 'inv-mxrf11' },
  { id: 'inv-btc' }
];

// ==========================================
// 1. TESTES PARA OPERAÇÕES DE COMPRA (BUY)
// ==========================================
console.log('\n[1. Validações de BUY]');

// Quantidade zero -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 0,
    price: 35.50,
    totalAmount: 0
  }, mockAssets);
  assert(!res.isValid, 'BUY: quantidade zero é rejeitada');
}

// Preço zero -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: 0,
    totalAmount: 0
  }, mockAssets);
  assert(!res.isValid, 'BUY: preço zero é rejeitado');
}

// Total zero -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: 20,
    totalAmount: 0
  }, mockAssets);
  assert(!res.isValid, 'BUY: total zero é rejeitado');
}

// Total incompatível com quantidade × preço -> rejeitar (10 x 20 = 200, enviado 500)
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: 20.00,
    totalAmount: 500.00
  }, mockAssets);
  assert(!res.isValid, 'BUY: total incompatível com quantidade × preço (10 × 20 !== 500) é rejeitado');
}

// Operação válida -> aceitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: 20.00,
    totalAmount: 200.00
  }, mockAssets);
  assert(res.isValid, 'BUY: operação válida (10 × 20.00 = 200.00) é aceita com sucesso');
}

// ==========================================
// 2. TESTES PARA OPERAÇÕES DE VENDA (SELL)
// ==========================================
console.log('\n[2. Validações de SELL]');

// Quantidade zero -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'sell',
    date: '2026-10-05',
    quantity: 0,
    price: 37.00,
    totalAmount: 0
  }, mockAssets);
  assert(!res.isValid, 'SELL: quantidade zero é rejeitada');
}

// Preço zero -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'sell',
    date: '2026-10-05',
    quantity: 50,
    price: 0,
    totalAmount: 0
  }, mockAssets);
  assert(!res.isValid, 'SELL: preço zero é rejeitado');
}

// Total incompatível -> rejeitar (50 x 37 = 1850, enviado 1200)
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'sell',
    date: '2026-10-05',
    quantity: 50,
    price: 37.00,
    totalAmount: 1200.00
  }, mockAssets);
  assert(!res.isValid, 'SELL: total incompatível (50 × 37 !== 1200) é rejeitado');
}

// Operação válida -> aceitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'sell',
    date: '2026-10-05',
    quantity: 50,
    price: 37.00,
    totalAmount: 1850.00
  }, mockAssets);
  assert(res.isValid, 'SELL: operação válida (50 × 37.00 = 1850.00) é aceita');
}

// ==========================================
// 3. TESTES PARA DIVIDENDOS (DIVIDEND)
// ==========================================
console.log('\n[3. Validações de DIVIDEND]');

// Total zero -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-mxrf11',
    type: 'dividend',
    date: '2026-10-05',
    quantity: 0,
    price: 0,
    totalAmount: 0
  }, mockAssets);
  assert(!res.isValid, 'DIVIDEND: total zero é rejeitado');
}

// Total negativo -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-mxrf11',
    type: 'dividend',
    date: '2026-10-05',
    quantity: 0,
    price: 0,
    totalAmount: -35.00
  }, mockAssets);
  assert(!res.isValid, 'DIVIDEND: total negativo é rejeitado');
}

// Dividendo válido -> aceitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-mxrf11',
    type: 'dividend',
    date: '2026-10-05',
    quantity: 0,
    price: 0,
    totalAmount: 30.50,
    notes: 'Proventos mensais'
  }, mockAssets);
  assert(res.isValid, 'DIVIDEND: dividendo válido com quantidade/preço zero e total > 0 é aceito');
}

// ==========================================
// 4. TESTES DE VALIDAÇÃO DE DATA (DATE)
// ==========================================
console.log('\n[4. Validações de DATA]');

// '2026-10-05' -> aceitar
{
  assert(isValidDateString('2026-10-05'), "DATA: '2026-10-05' é aceita");
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 1,
    price: 10,
    totalAmount: 10
  }, mockAssets);
  assert(res.isValid, "DATA: transação com data '2026-10-05' é aceita");
}

// '2026-1-5' -> rejeitar (falta zero à esquerda)
{
  assert(!isValidDateString('2026-1-5'), "DATA: '2026-1-5' sem zero à esquerda é rejeitada");
}

// '05/10/2026' -> rejeitar (formato brasileiro não aceito pelo padrão do app)
{
  assert(!isValidDateString('05/10/2026'), "DATA: '05/10/2026' fora do padrão ISO YYYY-MM-DD é rejeitada");
}

// 'banana' -> rejeitar
{
  assert(!isValidDateString('banana'), "DATA: 'banana' é rejeitada");
}

// '2026' -> rejeitar
{
  assert(!isValidDateString('2026'), "DATA: '2026' incompleta é rejeitada");
}

// Data impossível: '2026-99-99' -> rejeitar
{
  assert(!isValidDateString('2026-99-99'), "DATA: '2026-99-99' com mês e dia inválidos é rejeitada");
}

// Data impossível: '2026-02-30' -> rejeitar (fevereiro não tem dia 30)
{
  assert(!isValidDateString('2026-02-30'), "DATA: '2026-02-30' dia impossível em fevereiro é rejeitada");
}

// ==========================================
// 5. TESTES DE ASSET ID E INTEGRIDADE REFERENCIAL
// ==========================================
console.log('\n[5. Validações de ASSET]');

// assetId existente -> aceitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: 20,
    totalAmount: 200
  }, mockAssets);
  assert(res.isValid, "ASSET: assetId existente ('inv-petr4') é aceito");
}

// assetId inexistente -> rejeitar
{
  const res = validateInvestmentTransaction({
    assetId: 'inv-fantasma',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: 20,
    totalAmount: 200
  }, mockAssets);
  assert(!res.isValid, "ASSET: assetId inexistente ('inv-fantasma') é rejeitado");
}

// ==========================================
// 6. TESTES DE CRIAÇÃO E PRECISÃO MONETÁRIA
// ==========================================
console.log('\n[6. Criação e Precisão Monetária]');

// Cálculo com centavos exatos
{
  const total = calculateTransactionTotal(3, 10.33);
  assert(total === 30.99, `Precisão: cálculo com centavos exatos 3 * 10.33 = 30.99 (obtido: ${total})`);
}

// Auto-cálculo de totalAmount em createInvestmentTransaction
{
  const tx = createInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 100,
    price: 35.50
  }, mockAssets);
  assert(tx.totalAmount === 3550.00, `createInvestmentTransaction auto-calcula totalAmount (esperado 3550.00, obtido: ${tx.totalAmount})`);
  assert(tx.id.startsWith('itx-'), 'Prefixo itx- gerado corretamente no ID');
}

// Rejeição de NaN e Infinity
{
  const resNaN = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: NaN,
    price: 20,
    totalAmount: 200
  }, mockAssets);
  assert(!resNaN.isValid, 'NaN em quantidade é rejeitado');

  const resInf = validateInvestmentTransaction({
    assetId: 'inv-petr4',
    type: 'buy',
    date: '2026-10-05',
    quantity: 10,
    price: Infinity,
    totalAmount: 200
  }, mockAssets);
  assert(!resInf.isValid, 'Infinity em preço é rejeitado');
}

// ==========================================
// 7. AUDITORIA ESTÁTICA DE CLEAR ALL DATA
// ==========================================
console.log('\n[7. Auditoria de clearAllData no FinanceContext]');

{
  const financeContextCode = fs.readFileSync(path.resolve(process.cwd(), 'src/context/FinanceContext.tsx'), 'utf-8');
  
  // Extrai a função clearAllData
  const clearAllDataMatch = financeContextCode.match(/const clearAllData = async \(\) => {([\s\S]*?)};/);
  assert(clearAllDataMatch !== null, 'clearAllData() está declarada no FinanceContext');
  
  if (clearAllDataMatch) {
    const code = clearAllDataMatch[1];
    assert(
      code.includes("localStorage.setItem(STORAGE_KEY_PREFIX + 'investment_transactions', JSON.stringify([]))"),
      "clearAllData() reseta 'finflow_app_investment_transactions' no localStorage"
    );
    assert(
      code.includes('setInvestmentTransactions([])'),
      'clearAllData() limpa o estado de investmentTransactions'
    );
    assert(
      code.includes("'investmentTransactions'") && code.includes('subcollections'),
      "clearAllData() inclui 'investmentTransactions' nas subcoleções a serem apagadas do Firestore"
    );
  }
}

// ==========================================
// 8. AUDITORIA DAS FIRESTORE RULES (ETAPA 9.5)
// ==========================================
console.log('\n[8. Auditoria das Firestore Rules para investmentTransactions]');

{
  const firestoreRulesCode = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  
  assert(
    firestoreRulesCode.includes('match /investmentTransactions/{transactionId}'),
    'Bloco match /investmentTransactions/{transactionId} presente em firestore.rules'
  );

  assert(
    firestoreRulesCode.includes("incoming().date.matches('^\\\\d{4}-\\\\d{2}-\\\\d{2}$')"),
    'Firestore Rules valida formato de date com regex ^\\d{4}-\\d{2}-\\d{2}$'
  );

  assert(
    firestoreRulesCode.includes('incoming().totalAmount > 0'),
    'Firestore Rules exige totalAmount > 0 para operações de investimento'
  );

  assert(
    firestoreRulesCode.includes("incoming().type in ['buy', 'sell'] && incoming().quantity > 0 && incoming().price > 0"),
    'Firestore Rules exige quantity > 0 e price > 0 para compra e venda'
  );
}

console.log(`\n======================================================`);
console.log(`Resultado Final dos Testes do Ledger (Etapa 9.5): ${passed} passaram, ${failed} falharam.`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
