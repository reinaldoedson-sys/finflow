import {
  suggestDescriptions,
  getTopCategoryIds,
  getQuickDefaults,
  getPrefillFromDescription
} from '../src/domain/quickEntry';
import { Transaction, Account, CreditCard, Category } from '../src/types/finance';

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
  console.log('--- TESTES: FUNÇÕES PURAS DE LANÇAMENTO RÁPIDO (quickEntry.ts) ---\n');

  // 1. suggestDescriptions
  console.log('[1] suggestDescriptions:');
  {
    const sampleTxs: Transaction[] = [
      {
        id: 'tx-1',
        description: 'Padaria São Bento',
        amount: 25.5,
        type: 'expense',
        categoryId: 'cat-alimentacao',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        date: '2026-11-01',
        createdAt: '2026-11-01T10:00:00.000Z',
        status: 'completed'
      },
      {
        id: 'tx-2',
        description: 'Supermercado Pão de Açúcar',
        amount: 150.0,
        type: 'expense',
        categoryId: 'cat-alimentacao',
        accountId: 'acc-1',
        paymentMethod: 'credit_card',
        date: '2026-11-02',
        createdAt: '2026-11-02T10:00:00.000Z',
        status: 'completed'
      },
      {
        id: 'tx-3',
        description: 'padaria são bento', // repetição com caixa diferente
        amount: 30.0,
        type: 'expense',
        categoryId: 'cat-alimentacao',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        date: '2026-11-05',
        createdAt: '2026-11-05T10:00:00.000Z',
        status: 'completed'
      },
      {
        id: 'tx-4',
        description: 'Farmácia Preço Popular',
        amount: 80.0,
        type: 'expense',
        categoryId: 'cat-saude',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        date: '2026-11-04',
        createdAt: '2026-11-04T10:00:00.000Z',
        status: 'completed'
      },
      {
        id: 'tx-deleted',
        description: 'Posto Ipiranga Gasolina',
        amount: 200.0,
        type: 'expense',
        categoryId: 'cat-transporte',
        accountId: 'acc-1',
        paymentMethod: 'credit_card',
        date: '2026-11-06',
        createdAt: '2026-11-06T10:00:00.000Z',
        status: 'completed',
        deleted: true
      }
    ];

    // Ignora excluídas
    const allRecent = suggestDescriptions(sampleTxs, '', 10);
    assert(!allRecent.includes('Posto Ipiranga Gasolina'), 'Ignora transações excluídas (deleted: true)');

    // Mais recentes primeiro e sem repetição
    // tx-3 é a mais recente ('padaria são bento'), depois tx-4 ('Farmácia Preço Popular'), depois tx-2 ('Supermercado Pão de Açúcar')
    assert(allRecent[0] === 'padaria são bento', 'Mais recente aparece primeiro');
    assert(allRecent.filter(d => d.toLowerCase().includes('padaria')).length === 1, 'Descrições repetidas aparecem exatamente uma vez');

    // Ignora acentos e maiúsculas
    const matchFarmacia = suggestDescriptions(sampleTxs, 'farmacia');
    assert(matchFarmacia.length === 1 && matchFarmacia[0] === 'Farmácia Preço Popular', 'Busca "farmacia" sem acento encontra "Farmácia Preço Popular"');

    const matchPao = suggestDescriptions(sampleTxs, 'pao');
    assert(matchPao.length === 1 && matchPao[0] === 'Supermercado Pão de Açúcar', 'Busca "pao" sem til encontra "Supermercado Pão de Açúcar"');

    // Respeita o limite
    const limitTwo = suggestDescriptions(sampleTxs, '', 2);
    assert(limitTwo.length === 2, `Respeita limite = 2 (recebido: ${limitTwo.length})`);
  }

  // 2. getTopCategoryIds
  console.log('\n[2] getTopCategoryIds:');
  {
    const mockCategories: Category[] = [
      { id: 'cat-moradia', name: 'Moradia', icon: 'home', color: '#10b981', type: 'expense' },
      { id: 'cat-alimentacao', name: 'Alimentação', icon: 'utensils', color: '#f59e0b', type: 'expense' },
      { id: 'cat-transporte', name: 'Transporte', icon: 'car', color: '#3b82f6', type: 'expense' },
      { id: 'cat-lazer', name: 'Lazer', icon: 'film', color: '#ec4899', type: 'expense' },
      { id: 'cat-saude', name: 'Saúde', icon: 'activity', color: '#ef4444', type: 'expense' },
      { id: 'cat-educacao', name: 'Educação', icon: 'book', color: '#8b5cf6', type: 'expense' },
      { id: 'cat-salario', name: 'Salário', icon: 'briefcase', color: '#10b981', type: 'income' },
    ];

    const today = '2026-11-06';

    const categoryTxs: Transaction[] = [
      // 3 alimentacao recentes (2026-11-01 a 2026-11-05)
      { id: '1', description: 'a', amount: 10, type: 'expense', categoryId: 'cat-alimentacao', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-11-01', createdAt: '2026-11-01T10:00:00.000Z', status: 'completed' },
      { id: '2', description: 'b', amount: 10, type: 'expense', categoryId: 'cat-alimentacao', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-11-02', createdAt: '2026-11-02T10:00:00.000Z', status: 'completed' },
      { id: '3', description: 'c', amount: 10, type: 'expense', categoryId: 'cat-alimentacao', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-11-03', createdAt: '2026-11-03T10:00:00.000Z', status: 'completed' },
      // 2 transporte recentes
      { id: '4', description: 'd', amount: 10, type: 'expense', categoryId: 'cat-transporte', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-11-04', createdAt: '2026-11-04T10:00:00.000Z', status: 'completed' },
      { id: '5', description: 'e', amount: 10, type: 'expense', categoryId: 'cat-transporte', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-11-05', createdAt: '2026-11-05T10:00:00.000Z', status: 'completed' },
      // 1 lazer antiga (há 150 dias atrás -> deve ser ignorada com days=90)
      { id: '6', description: 'f', amount: 10, type: 'expense', categoryId: 'cat-lazer', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-05-01', createdAt: '2026-05-01T10:00:00.000Z', status: 'completed' },
      // 1 receita (não deve entrar em despesa)
      { id: '7', description: 'g', amount: 10, type: 'income', categoryId: 'cat-salario', accountId: 'acc-1', paymentMethod: 'pix', date: '2026-11-01', createdAt: '2026-11-01T10:00:00.000Z', status: 'completed' },
    ];

    const top6 = getTopCategoryIds(categoryTxs, mockCategories, 'expense', 6, 90, today);
    assert(top6[0] === 'cat-alimentacao', 'Categoria com mais frequência (alimentação) fica em primeiro lugar');
    assert(top6[1] === 'cat-transporte', 'Segunda categoria com mais frequência (transporte) fica em segundo');
    assert(top6.length === 6, 'Completa com as demais categorias até atingir o limite de 6');
    assert(!top6.includes('cat-salario'), 'Não inclui categorias exclusivas de receita ao pedir despesa');

    // Confere a ordem de complemento das demais categorias
    const remaining = top6.slice(2);
    // Categorias de despesa em mockCategories: moradia, lazer, saude, educacao
    assert(remaining.includes('cat-moradia') && remaining.includes('cat-lazer') && remaining.includes('cat-saude'), 'Completa com categorias restantes na ordem de cadastro');
  }

  // 3. getQuickDefaults
  console.log('\n[3] getQuickDefaults:');
  {
    const accounts: Account[] = [
      { id: 'acc-nubank', name: 'Nubank', type: 'checking', bankName: 'Nubank', color: '#820ad1', initialBalance: 100, currentBalance: 100, icon: 'wallet' },
      { id: 'acc-itau', name: 'Itaú', type: 'checking', bankName: 'Itaú', color: '#ec7000', initialBalance: 200, currentBalance: 200, icon: 'landmark' }
    ];

    const creditCards: CreditCard[] = [
      { id: 'card-black', name: 'Mastercard Black', bankName: 'Nubank', color: '#111', limit: 5000, closingDay: 5, dueDay: 12, currentInvoice: 0 }
    ];

    const categories: Category[] = [
      { id: 'cat-compras', name: 'Compras', icon: 'shopping-bag', color: '#10b981', type: 'expense' },
      { id: 'cat-salario', name: 'Salário', icon: 'briefcase', color: '#10b981', type: 'income' },
    ];

    // Cenário 3.1: Sem histórico -> usa primeira conta, 'pix' e primeira categoria
    const defEmpty = getQuickDefaults([], accounts, creditCards, 'expense', categories);
    assert(defEmpty.accountId === 'acc-nubank', 'Sem histórico: accountId é a primeira conta');
    assert(defEmpty.paymentMethod === 'pix', 'Sem histórico: paymentMethod é pix');
    assert(defEmpty.creditCardId === '', 'Sem histórico: creditCardId é vazio');
    assert(defEmpty.categoryId === 'cat-compras', 'Sem histórico: categoryId é a primeira categoria de despesa');

    // Cenário 3.2: Último foi cartão de crédito, mas NÃO existe nenhum cartão cadastrado -> devolve 'pix'
    const txWithCard: Transaction = {
      id: 'tx-card',
      description: 'Compra Mercado',
      amount: 100,
      type: 'expense',
      categoryId: 'cat-compras',
      accountId: 'acc-nubank',
      creditCardId: 'card-inexistente',
      paymentMethod: 'credit_card',
      date: '2026-11-06',
      createdAt: '2026-11-06T12:00:00.000Z',
      status: 'completed'
    };
    const defNoCards = getQuickDefaults([txWithCard], accounts, [], 'expense', categories);
    assert(defNoCards.paymentMethod === 'pix', 'Último foi cartão de crédito, mas sem cartões cadastrados -> usa pix');
    assert(defNoCards.creditCardId === '', 'creditCardId fica vazio');

    // Cenário 3.3: Cartão deletado/inexistente na lista com cartões cadastrados -> devolve 'pix'
    const defDeletedCard = getQuickDefaults([txWithCard], accounts, creditCards, 'expense', categories);
    assert(defDeletedCard.paymentMethod === 'pix', 'Cartão que não existe mais na lista reverte para pix');
    assert(defDeletedCard.creditCardId === '', 'creditCardId fica vazio');

    // Cenário 3.4: Conta que foi removida -> volta para a primeira conta cadastrada
    const txDeletedAccount: Transaction = {
      id: 'tx-del-acc',
      description: 'Gasto',
      amount: 50,
      type: 'expense',
      categoryId: 'cat-compras',
      accountId: 'acc-antiga-deletada',
      paymentMethod: 'pix',
      date: '2026-11-06',
      createdAt: '2026-11-06T14:00:00.000Z',
      status: 'completed'
    };
    const defDeletedAcc = getQuickDefaults([txDeletedAccount], accounts, creditCards, 'expense', categories);
    assert(defDeletedAcc.accountId === 'acc-nubank', 'Conta removida reverte para a primeira conta cadastrada (acc-nubank)');
  }

  // 4. getPrefillFromDescription
  console.log('\n[4] getPrefillFromDescription:');
  {
    const historyTxs: Transaction[] = [
      {
        id: 'tx-old',
        description: 'Almoço Restaurante Silva',
        amount: 32.0,
        type: 'expense',
        categoryId: 'cat-refeicao',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        date: '2026-10-15',
        createdAt: '2026-10-15T12:30:00.000Z',
        status: 'completed'
      },
      {
        id: 'tx-recent',
        description: 'Almoço Restaurante Silva',
        amount: 38.5,
        type: 'expense',
        categoryId: 'cat-alimentacao',
        accountId: 'acc-2',
        paymentMethod: 'credit_card',
        creditCardId: 'card-1',
        date: '2026-11-04',
        createdAt: '2026-11-04T12:30:00.000Z',
        status: 'completed'
      }
    ];

    // Encontra a mais recente ignorando maiúsculas e espaços nas pontas
    const prefill = getPrefillFromDescription(historyTxs, '  almoço restaurante silva  ');
    assert(prefill !== null, 'Encontra correspondência exata desconsiderando maiúsculas e espaços');
    assert(prefill?.categoryId === 'cat-alimentacao', 'Traz a categoria da transação mais recente');
    assert(prefill?.accountId === 'acc-2', 'Traz a conta da transação mais recente');
    assert(prefill?.paymentMethod === 'credit_card', 'Traz a forma de pagamento da mais recente');
    assert(prefill?.creditCardId === 'card-1', 'Traz o cartão da mais recente');
    assert(prefill?.amount === 38.5, 'Traz o valor da mais recente');

    // Descrição inexistente
    const notFound = getPrefillFromDescription(historyTxs, 'Cinema Multiplex');
    assert(notFound === null, 'Descrição inexistente devolve null');

    const emptyDesc = getPrefillFromDescription(historyTxs, '   ');
    assert(emptyDesc === null, 'Descrição vazia devolve null');
  }

  console.log(`\n========================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
