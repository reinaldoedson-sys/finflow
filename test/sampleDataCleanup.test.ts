import {
  isSampleDataDocument,
  mergeCloudWithPending,
  PendingSyncOperation,
} from '../src/domain/sync';
import { demoDataService } from '../src/services/demoDataService';
import { Account, Transaction } from '../src/types/finance';

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

console.log('--- TESTES DE LIMPEZA E ISOLAMENTO DE DADOS DE EXEMPLO (CELULAR/NUVEM) ---');

// =========================================================================
// TESTE 1: isSampleDataDocument identifica corretamente IDs de exemplo
// =========================================================================
{
  assert(isSampleDataDocument('accounts', 'acc-itau'), 'acc-itau é documento de exemplo');
  assert(isSampleDataDocument('accounts', 'acc-nubank'), 'acc-nubank é documento de exemplo');
  assert(isSampleDataDocument('transactions', 'tx-1'), 'tx-1 é documento de exemplo');
  assert(isSampleDataDocument('transactions', 'tx-10'), 'tx-10 é documento de exemplo');
  assert(isSampleDataDocument('investments', 'inv-petr4'), 'inv-petr4 é documento de exemplo');

  // IDs gerados para o usuário nunca são considerados dados de exemplo
  assert(!isSampleDataDocument('accounts', 'acc-1730000000000-xyz'), 'acc de usuário não é exemplo');
  assert(!isSampleDataDocument('transactions', 'tx-1730000000000-abc'), 'tx de usuário não é exemplo');
}

// =========================================================================
// TESTE 2: mergeCloudWithPending descarta dados de exemplo locais ao receber dados da nuvem
// =========================================================================
{
  const localAccounts: Account[] = [
    {
      id: 'acc-itau',
      name: 'Itaú Unibanco (Exemplo)',
      bankName: 'Itaú',
      type: 'checking',
      color: '#ea580c',
      initialBalance: 1000,
      currentBalance: 1000,
      icon: 'Building2',
    },
    {
      id: 'acc-nubank',
      name: 'Nubank (Exemplo)',
      bankName: 'Nubank',
      type: 'checking',
      color: '#820ad1',
      initialBalance: 2000,
      currentBalance: 2000,
      icon: 'Wallet',
    },
    {
      id: 'acc-real-offline',
      name: 'Conta Criada pelo Usuário Offline',
      bankName: 'Inter',
      type: 'checking',
      color: '#ff7a00',
      initialBalance: 5000,
      currentBalance: 5000,
      icon: 'Building2',
    },
  ];

  const cloudAccounts: Account[] = [
    {
      id: 'acc-cloud-1',
      name: 'Minha Conta Real na Nuvem',
      bankName: 'Bradesco',
      type: 'checking',
      color: '#cc0000',
      initialBalance: 15000,
      currentBalance: 15000,
      icon: 'Building2',
    },
  ];

  const pendingQueue: PendingSyncOperation[] = [];

  const merged = mergeCloudWithPending(cloudAccounts, pendingQueue, 'accounts', localAccounts);

  assert(merged.some(a => a.id === 'acc-cloud-1'), 'Contém a conta real da nuvem');
  assert(merged.some(a => a.id === 'acc-real-offline'), 'Preserva a conta criada pelo usuário localmente');
  assert(!merged.some(a => a.id === 'acc-itau'), 'Descarta a conta de exemplo acc-itau');
  assert(!merged.some(a => a.id === 'acc-nubank'), 'Descarta a conta de exemplo acc-nubank');
  assert(merged.length === 2, `Possui exatamente 2 contas (encontradas ${merged.length})`);
}

// =========================================================================
// TESTE 3: mergeCloudWithPending descarta transações de exemplo locais
// =========================================================================
{
  const localTransactions: Transaction[] = [
    {
      id: 'tx-1',
      description: 'Salário Mensal CLT (Exemplo)',
      amount: 8500,
      type: 'income',
      categoryId: 'cat-salario',
      accountId: 'acc-itau',
      paymentMethod: 'transfer',
      date: '2026-10-05',
      status: 'completed',
      createdAt: '2026-10-01T08:00:00Z',
    },
    {
      id: 'tx-user-offline',
      description: 'Almoço Restaurante Real',
      amount: 45.90,
      type: 'expense',
      categoryId: 'cat-alimentacao',
      accountId: 'acc-cloud-1',
      paymentMethod: 'pix',
      date: '2026-10-25',
      status: 'completed',
      createdAt: '2026-10-25T12:00:00Z',
    },
  ];

  const cloudTransactions: Transaction[] = [
    {
      id: 'tx-cloud-1',
      description: 'Supermercado Mensal (Nuvem)',
      amount: 620.00,
      type: 'expense',
      categoryId: 'cat-alimentacao',
      accountId: 'acc-cloud-1',
      paymentMethod: 'credit_card',
      date: '2026-10-20',
      status: 'completed',
      createdAt: '2026-10-20T10:00:00Z',
    },
  ];

  const pendingQueue: PendingSyncOperation[] = [];

  const merged = mergeCloudWithPending(cloudTransactions, pendingQueue, 'transactions', localTransactions);

  assert(merged.some(t => t.id === 'tx-cloud-1'), 'Contém a transação da nuvem');
  assert(merged.some(t => t.id === 'tx-user-offline'), 'Preserva transação real criada pelo usuário');
  assert(!merged.some(t => t.id === 'tx-1'), 'Descarta a transação de exemplo tx-1');
  assert(merged.length === 2, `Possui exatamente 2 transações (encontradas ${merged.length})`);
}

// =========================================================================
// TESTE 4: filterSampleData preserva dados reais e remove todos os de exemplo
// =========================================================================
{
  const defaults = demoDataService.getDefaultDataset();
  const datasetWithUserItem = {
    ...defaults,
    accounts: [
      ...defaults.accounts,
      {
        id: 'acc-custom-meu-banco',
        name: 'Meu Banco Real',
        bankName: 'C6 Bank',
        type: 'checking' as const,
        color: '#000000',
        initialBalance: 3200,
        currentBalance: 3200,
        icon: 'Building2',
      },
    ],
  };

  const filtered = demoDataService.filterSampleData(datasetWithUserItem);

  assert(filtered.accounts.length === 1, `Filtrou todas as contas de exemplo (restaram ${filtered.accounts.length})`);
  assert(filtered.accounts[0].id === 'acc-custom-meu-banco', 'Conta do usuário mantida intacta');
  assert(filtered.transactions.length === 0, 'Todas as transações de exemplo foram removidas');
  assert(filtered.investments.length === 0, 'Todos os investimentos de exemplo foram removidos');
}

console.log(`\nResultados: ${passed} passaram, ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}
