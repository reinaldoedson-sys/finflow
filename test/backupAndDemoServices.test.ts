import { backupService, type BackupData } from '../src/services/backupService';
import { DemoDataService, demoDataService } from '../src/services/demoDataService';
import {
  DEFAULT_CATEGORIES,
  INITIAL_ACCOUNTS,
  INITIAL_CREDIT_CARDS,
  INITIAL_BUDGETS,
  INITIAL_GOALS,
  INITIAL_GOAL_MOVEMENTS,
  INITIAL_INSTALLMENT_PLANS,
  INITIAL_TRANSACTIONS,
  INITIAL_INVESTMENTS,
  INITIAL_INVESTMENT_TRANSACTIONS,
} from '../src/utils/mockData';
import type { Account, FinancialGoal, GoalMovement, Transaction } from '../src/types/finance';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function runBackupAndDemoServiceTests() {
  console.log('🧪 Iniciando testes de BackupService e DemoDataService (Fase 3.1)...');

  // =========================================================================
  // 1. TESTES DE EXPORTAÇÃO DE BACKUP (UNENCRYPTED)
  // =========================================================================
  console.log('--- 1. Testando Exportação de Backup ---');
  {
    const sampleData: BackupData = {
      currency: 'BRL',
      categories: [...DEFAULT_CATEGORIES],
      accounts: [...INITIAL_ACCOUNTS],
      creditCards: [...INITIAL_CREDIT_CARDS],
      budgets: [...INITIAL_BUDGETS],
      goals: [...INITIAL_GOALS],
      goalMovements: [...INITIAL_GOAL_MOVEMENTS],
      installmentPlans: [...INITIAL_INSTALLMENT_PLANS],
      transactions: [...INITIAL_TRANSACTIONS],
      investments: [...INITIAL_INVESTMENTS],
      investmentTransactions: [...INITIAL_INVESTMENT_TRANSACTIONS],
    };

    const exportedJson = await backupService.export(sampleData);
    assert(typeof exportedJson === 'string', 'Exportação retorna string JSON');

    const parsed = JSON.parse(exportedJson);
    assert(parsed.version === '1.0.0', 'Envelope contém versão 1.0.0');
    assert(typeof parsed.exportedAt === 'string', 'Envelope contém carimbo exportedAt');
    assert(parsed.currency === 'BRL', 'Moeda BRL preservada no backup');
    assert(Array.isArray(parsed.accounts) && parsed.accounts.length === INITIAL_ACCOUNTS.length, 'Contas preservadas');
    assert(Array.isArray(parsed.transactions) && parsed.transactions.length === INITIAL_TRANSACTIONS.length, 'Transações preservadas');
    assert(Array.isArray(parsed.goals) && parsed.goals.length === INITIAL_GOALS.length, 'Metas preservadas');
    assert(Array.isArray(parsed.categories) && parsed.categories.length === DEFAULT_CATEGORIES.length, 'Categorias preservadas');
    assert(parsed.isEncrypted === undefined, 'Backup sem senha não possui tag isEncrypted');
    console.log('  ✅ Exportação JSON não criptografada validada com sucesso.');
  }

  // =========================================================================
  // 2. TESTES DE CRIPTOGRAFIA (WEBCRYPTO AES-GCM 256)
  // =========================================================================
  console.log('--- 2. Testando Criptografia e Descriptografia ---');
  {
    const passphrase = 'SenhaSuperSecreta@2026';
    const secretMessage = JSON.stringify({ secret: 'finflow-wallet-key', amount: 50000 });

    // Teste de encrypt e decrypt direto
    const cipherText = await backupService.encrypt(secretMessage, passphrase);
    assert(typeof cipherText === 'string' && cipherText.length > 20, 'Criptografia gera cipherText base64 válido');
    assert(!cipherText.includes('finflow-wallet-key'), 'PlainText não vaza no cipherText');

    const decrypted = await backupService.decrypt(cipherText, passphrase);
    assert(decrypted === secretMessage, 'Descriptografia com senha correta recupera o payload exato');

    // Teste de falha com senha errada
    let decryptError = false;
    try {
      await backupService.decrypt(cipherText, 'SenhaIncorreta');
    } catch {
      decryptError = true;
    }
    assert(decryptError, 'Tentativa de descriptografia com senha incorreta lança exceção');

    // Teste de exportação com criptografia
    const sampleData: BackupData = {
      categories: [...DEFAULT_CATEGORIES],
      accounts: [...INITIAL_ACCOUNTS],
      creditCards: [],
      budgets: [],
      goals: [],
      goalMovements: [],
      installmentPlans: [],
      transactions: [...INITIAL_TRANSACTIONS],
      investments: [],
      investmentTransactions: [],
    };

    const encryptedBackupString = await backupService.export(sampleData, passphrase);
    const encryptedEnvelope = JSON.parse(encryptedBackupString);
    assert(encryptedEnvelope.isEncrypted === true, 'Envelope possui isEncrypted: true');
    assert(typeof encryptedEnvelope.cipherText === 'string', 'Envelope contém cipherText');
    assert(encryptedEnvelope.accounts === undefined, 'Dados confidenciais não estão expostos no envelope');
    console.log('  ✅ Criptografia WebCrypto e envelope seguro validados com sucesso.');
  }

  // =========================================================================
  // 3. TESTES DE IMPORTAÇÃO DE BACKUP
  // =========================================================================
  console.log('--- 3. Testando Importação de Backup ---');
  {
    // A. Importação de backup normal (não criptografado)
    const customGoal: FinancialGoal = {
      id: 'goal-custom-1',
      name: 'Reserva de Emergência',
      targetAmount: 30000,
      initialAmount: 5000,
      currentAmount: 5000,
      targetDate: '2026-12-31',
      color: '#10b981',
      icon: 'Shield',
    };
    const customMovement: GoalMovement = {
      id: 'gmov-custom-1',
      goalId: 'goal-custom-1',
      type: 'deposit',
      amount: 2500,
      date: '2026-10-09',
      createdAt: new Date().toISOString(),
    };

    const rawBackup: BackupData = {
      currency: 'USD',
      categories: [...DEFAULT_CATEGORIES],
      accounts: [...INITIAL_ACCOUNTS],
      creditCards: [...INITIAL_CREDIT_CARDS],
      budgets: [...INITIAL_BUDGETS],
      goals: [customGoal],
      goalMovements: [customMovement],
      installmentPlans: [],
      transactions: [...INITIAL_TRANSACTIONS],
      investments: [],
      investmentTransactions: [],
    };

    const exportedRaw = await backupService.export(rawBackup);
    const importRawResult = await backupService.import(exportedRaw);

    assert(importRawResult.success === true, 'Importação de backup normal retorna sucesso');
    assert(importRawResult.data !== undefined, 'Dados importados foram retornados');
    assert(importRawResult.data?.currency === 'USD', 'Moeda USD restaurada');
    assert(importRawResult.data?.goals?.length === 1, 'Meta customizada restaurada');
    // Verifica cálculo derivado do saldo da meta (5000 inicial + 2500 depósito = 7500)
    assert(
      importRawResult.data?.goals?.[0].currentAmount === 7500,
      'Saldo derivado da meta recalculado corretamente na importação (5000 + 2500 = 7500)'
    );

    // B. Importação de backup criptografado com senha correta
    const passphrase = 'MinhaSenhaSegura!123';
    const exportedEncrypted = await backupService.export(rawBackup, passphrase);

    const importEncryptedResult = await backupService.import(exportedEncrypted, passphrase);
    assert(importEncryptedResult.success === true, 'Importação de backup criptografado com senha correta tem sucesso');
    assert(importEncryptedResult.data?.accounts?.length === INITIAL_ACCOUNTS.length, 'Contas recuperadas');

    // C. Importação de backup criptografado SEM senha
    const importNoPassResult = await backupService.import(exportedEncrypted);
    assert(importNoPassResult.success === false, 'Importação sem senha de arquivo criptografado falha');
    assert(importNoPassResult.message.includes('criptografado'), 'Mensagem alerta que o arquivo está criptografado');

    // D. Importação de backup criptografado com senha ERRADA
    const importWrongPassResult = await backupService.import(exportedEncrypted, 'SenhaIncorreta');
    assert(importWrongPassResult.success === false, 'Importação com senha errada falha');
    assert(importWrongPassResult.message.includes('incorreta'), 'Mensagem alerta sobre senha incorreta');

    // E. Importação de JSON corrompido ou inválido
    const invalidJsonResult = await backupService.import('ISSO_NAO_E_JSON');
    assert(invalidJsonResult.success === false, 'JSON inválido rejeitado com segurança');

    const emptyStructureResult = await backupService.import(JSON.stringify({ someKey: 'invalid' }));
    assert(emptyStructureResult.success === false, 'Estrutura de dados inválida rejeitada');
    console.log('  ✅ Todos os fluxos de importação, normalização e validação passaram com sucesso.');
  }

  // =========================================================================
  // 4. TESTES DE DEMODATA SERVICE - SEED DEMO
  // =========================================================================
  console.log('--- 4. Testando DemoDataService (Seed Demo) ---');
  {
    // A. Validação do Dataset Padrão Canônico
    const defaults = demoDataService.getDefaultDataset();
    assert(defaults.accounts.length === INITIAL_ACCOUNTS.length, 'Contas padrão canônicas presentes');
    assert(defaults.categories.length === DEFAULT_CATEGORIES.length, 'Categorias padrão canônicas presentes');
    assert(defaults.creditCards.length === INITIAL_CREDIT_CARDS.length, 'Cartões padrão canônicos presentes');
    assert(defaults.budgets.length === INITIAL_BUDGETS.length, 'Orçamentos padrão canônicos presentes');
    assert(defaults.goals.length === INITIAL_GOALS.length, 'Metas padrão canônicas presentes');
    assert(defaults.goalMovements.length === INITIAL_GOAL_MOVEMENTS.length, 'Movimentações padrão canônicas presentes');
    assert(defaults.installmentPlans.length === INITIAL_INSTALLMENT_PLANS.length, 'Parcelamentos padrão canônicos presentes');
    assert(defaults.transactions.length === INITIAL_TRANSACTIONS.length, 'Transações padrão canônicas presentes');
    assert(defaults.investments.length === INITIAL_INVESTMENTS.length, 'Investimentos padrão canônicos presentes');
    assert(defaults.investmentTransactions.length === INITIAL_INVESTMENT_TRANSACTIONS.length, 'Transações de investimento canônicas presentes');

    // B. Simulação de gravação de Seed com Mock
    const customDemoService = new DemoDataService({} as any);

    // Testa chamada de seed com uid vazio (deve retornar imediatamente sem erros)
    await customDemoService.seed('');
    console.log('  ✅ Seed padrão e dataset canônico validados com sucesso.');
  }

  // =========================================================================
  // 5. TESTES DE DEMODATA SERVICE - LIMPEZA DEMO (SAMPLE DATA)
  // =========================================================================
  console.log('--- 5. Testando DemoDataService (Limpeza e Filtro Demo) ---');
  {
    // A. Detecção de dados demo ativos na UI
    assert(
      demoDataService.isDemoActive(INITIAL_ACCOUNTS, INITIAL_TRANSACTIONS, false) === true,
      'isDemoActive detecta contas e transações de demonstração'
    );
    assert(
      demoDataService.isDemoActive(INITIAL_ACCOUNTS, INITIAL_TRANSACTIONS, true) === false,
      'isDemoActive respeita flag demoClearedFlag'
    );

    const userRealAccounts: Account[] = [
      {
        id: 'acc-real-santander',
        name: 'Santander Corrente',
        bankName: 'Santander',
        type: 'checking',
        color: '#cc0000',
        initialBalance: 12000,
        currentBalance: 12000,
        icon: 'Building2',
      },
    ];
    const userRealTransactions: Transaction[] = [
      {
        id: 'tx-real-1',
        description: 'Supermercado Mensal',
        amount: 850,
        type: 'expense',
        categoryId: 'cat-alimentacao',
        accountId: 'acc-real-santander',
        paymentMethod: 'debit_card',
        date: '2026-10-09',
        status: 'completed',
        createdAt: new Date().toISOString(),
      },
    ];

    assert(
      demoDataService.isDemoActive(userRealAccounts, userRealTransactions, false) === false,
      'isDemoActive retorna false para dados estritamente do usuário'
    );

    // B. Identificação de Documentos de Exemplo
    assert(demoDataService.isSampleDataDocument('accounts', 'acc-itau') === true, 'acc-itau é documento de exemplo');
    assert(demoDataService.isSampleDataDocument('accounts', 'acc-nubank') === true, 'acc-nubank é documento de exemplo');
    assert(demoDataService.isSampleDataDocument('accounts', 'acc-real-santander') === false, 'acc-real-santander NÃO é documento de exemplo');
    assert(demoDataService.isSampleDataDocument('transactions', 'tx-1') === true, 'tx-1 é documento de exemplo');
    assert(demoDataService.isSampleDataDocument('transactions', 'tx-real-1') === false, 'tx-real-1 NÃO é documento de exemplo');

    // C. Filtro de Dados de Exemplo (filterSampleData)
    const mixedDataset = {
      categories: [...DEFAULT_CATEGORIES],
      accounts: [...INITIAL_ACCOUNTS, ...userRealAccounts],
      creditCards: [...INITIAL_CREDIT_CARDS],
      budgets: [...INITIAL_BUDGETS],
      goals: [...INITIAL_GOALS],
      goalMovements: [...INITIAL_GOAL_MOVEMENTS],
      installmentPlans: [...INITIAL_INSTALLMENT_PLANS],
      transactions: [...INITIAL_TRANSACTIONS, ...userRealTransactions],
      investments: [...INITIAL_INVESTMENTS],
      investmentTransactions: [...INITIAL_INVESTMENT_TRANSACTIONS],
    };

    const filtered = demoDataService.filterSampleData(mixedDataset);
    assert(filtered.accounts.length === 1 && filtered.accounts[0].id === 'acc-real-santander', 'Contas demo removidas e conta real mantida');
    assert(filtered.transactions.length === 1 && filtered.transactions[0].id === 'tx-real-1', 'Transações demo removidas e transação real mantida');
    assert(filtered.goals.length === 0, 'Metas demo removidas completamente');
    assert(filtered.budgets.length === 0, 'Orçamentos demo removidos');
    assert(filtered.investments.length === 0, 'Investimentos demo removidos');
    assert(filtered.installmentPlans.length === 0, 'Planos demo removidos');
    assert(filtered.categories.length === DEFAULT_CATEGORIES.length, 'Categorias canônicas preservadas para uso do usuário');

    // D. Chamada com UID vazio não falha
    await demoDataService.clear(undefined);
    await demoDataService.clearAll('');
    console.log('  ✅ Limpeza, isolamento de sample data e filtragem validados com sucesso.');
  }

  console.log('🎉 TODOS OS TESTES DE BACKUPSERVICE E DEMODATASERVICE PASSARAM COM SUCESSO!');
}

runBackupAndDemoServiceTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro durante a execução dos testes:', err);
    process.exit(1);
  });
