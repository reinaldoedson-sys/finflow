import {
  buildConflictLogEntry,
  extractVisibleEntityFields,
  getResolvedConflictEntries,
  recordResolvedConflictEntry,
  formatConflictSnapshotText,
  RESOLVED_CONFLICTS_STORAGE_KEY,
} from '../src/domain/conflictLog';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

class FakeStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

async function runTests() {
  console.log('🧪 Iniciando testes de conflictLogEntry (Passo 4)...');

  // =========================================================================
  // 1. Apenas campos permitidos entram e campos fora da lista são ignorados
  // =========================================================================
  console.log('\n--- 1. Validação de campos permitidos e filtragem de campos internos ---');
  {
    const longDesc = 'A'.repeat(150);
    const rawTx = {
      id: 'tx_123',
      description: longDesc,
      amount: 150.5,
      type: 'expense',
      date: '2026-10-25',
      accountId: 'acc_wallet',
      categoryId: 'cat_food',
      // Campos proibidos / internos que NUNCA podem aparecer:
      userId: 'secret_user_uid_123',
      ownerUid: 'secret_user_uid_123',
      revision: 4,
      tombstoneRevision: 2,
      payload: { secret: 'nested_data' },
      internalMeta: 'do_not_leak',
    };

    const snapshot = extractVisibleEntityFields('transactions', rawTx);
    assert(snapshot !== undefined, 'Snapshot deve ser gerado');
    assert(snapshot!.description === 'A'.repeat(120), 'description longa deve ser truncada em 120 caracteres');
    assert(snapshot!.description!.length === 120, `Tamanho da description deve ser 120, tem ${snapshot!.description!.length}`);
    assert(snapshot!.amount === 150.5, 'amount deve ser preservado');
    assert(snapshot!.type === 'expense', 'type deve ser preservado');
    assert(snapshot!.date === '2026-10-25', 'date deve ser preservada');
    assert(snapshot!.accountId === 'acc_wallet', 'accountId deve ser preservado');
    assert(snapshot!.categoryId === 'cat_food', 'categoryId deve ser preservado');

    // Confirmação estrita: campos proibidos NÃO existem
    assert(!('userId' in snapshot!), 'userId NÃO deve estar presente no snapshot');
    assert(!('ownerUid' in snapshot!), 'ownerUid NÃO deve estar presente no snapshot');
    assert(!('revision' in snapshot!), 'revision NÃO deve estar presente no snapshot');
    assert(!('payload' in snapshot!), 'payload NÃO deve estar presente no snapshot');
    assert(!('internalMeta' in snapshot!), 'internalMeta NÃO deve estar presente no snapshot');
    assert(!('id' in snapshot!), 'id do documento não deve estar na lista de campos do snapshot');

    console.log('  ✅ Transações: campos visíveis preservados, campos internos bloqueados.');
  }

  // =========================================================================
  // 2. Validação para investmentTransactions
  // =========================================================================
  console.log('\n--- 2. Validação para investmentTransactions ---');
  {
    const longNotes = 'Nota importante sobre o aporte: '.padEnd(160, 'X');
    const rawInvTx = {
      id: 'inv_tx_99',
      type: 'buy',
      date: '2026-10-25',
      quantity: 50,
      price: 10.5,
      totalAmount: 525,
      assetId: 'asset_fii_1',
      notes: longNotes,
      // Proibidos:
      userId: 'usr_abc',
      internalFlag: true,
    };

    const snapshot = extractVisibleEntityFields('investmentTransactions', rawInvTx);
    assert(snapshot !== undefined, 'Snapshot deve existir');
    assert(snapshot!.type === 'buy', 'type deve bater');
    assert(snapshot!.quantity === 50, 'quantity deve bater');
    assert(snapshot!.price === 10.5, 'price deve bater');
    assert(snapshot!.totalAmount === 525, 'totalAmount deve bater');
    assert(snapshot!.assetId === 'asset_fii_1', 'assetId deve bater');
    assert(snapshot!.notes?.length === 120, 'notes deve ser truncado em 120');
    assert(!('userId' in snapshot!), 'userId não deve aparecer');
    assert(!('internalFlag' in snapshot!), 'internalFlag não deve aparecer');

    console.log('  ✅ investmentTransactions: campos visíveis validados.');
  }

  // =========================================================================
  // 3. Validação para goalMovements e demais entidades
  // =========================================================================
  console.log('\n--- 3. Validação para goalMovements e entidades gerais ---');
  {
    const rawMov = {
      id: 'mov_1',
      type: 'deposit',
      amount: 200,
      date: '2026-10-25',
      notes: 'Depósito semanal',
      goalId: 'goal_car', // goalMovements não lista goalId nos permitidos, apenas type, amount, date, notes
      userId: 'user_1',
    };
    const movSnapshot = extractVisibleEntityFields('goalMovements', rawMov);
    assert(movSnapshot!.type === 'deposit', 'type deve bater');
    assert(movSnapshot!.amount === 200, 'amount deve bater');
    assert(movSnapshot!.notes === 'Depósito semanal', 'notes deve bater');
    assert(!('goalId' in movSnapshot!), 'goalId não está na lista de campos permitidos');
    assert(!('userId' in movSnapshot!), 'userId não deve aparecer');

    const rawAccount = {
      id: 'acc_1',
      name: 'Conta Corrente Banco Inter com Nome Longo '.padEnd(150, '.'),
      description: 'Conta para despesas diárias',
      balance: 10000,
      userId: 'user_1',
    };
    const accSnapshot = extractVisibleEntityFields('accounts', rawAccount);
    assert(accSnapshot!.name?.length === 120, 'name deve ser truncado em 120');
    assert(accSnapshot!.description === 'Conta para despesas diárias', 'description deve bater');
    assert(!('balance' in accSnapshot!), 'balance não está na lista permitida de demais entidades');
    assert(!('userId' in accSnapshot!), 'userId não deve aparecer');

    console.log('  ✅ goalMovements e demais entidades validadas.');
  }

  // =========================================================================
  // 4. buildConflictLogEntry integra kept e discarded
  // =========================================================================
  console.log('\n--- 4. buildConflictLogEntry monta entrada com kept e discarded ---');
  {
    const kept = {
      id: 'tx_55',
      description: 'Mercado Vencedor',
      amount: 200,
      type: 'expense',
      date: '2026-10-25',
      userId: 'usr_secret',
    };
    const discarded = {
      id: 'tx_55',
      description: 'Mercado Descartado',
      amount: 150,
      type: 'expense',
      date: '2026-10-25',
      userId: 'usr_secret',
    };

    const entry = buildConflictLogEntry('transactions', kept, discarded, {
      entityId: 'tx_55',
      action: 'use_remote',
      reason: 'Versão remota venceu por desempate canônico',
    });

    assert(entry.entityName === 'transactions', 'entityName correto');
    assert(entry.entityId === 'tx_55', 'entityId correto');
    assert(entry.action === 'use_remote', 'action correta');
    assert(entry.kept?.amount === 200, 'kept amount deve ser 200');
    assert(entry.discarded?.amount === 150, 'discarded amount deve ser 150');
    assert(!('userId' in entry.kept!), 'kept não deve vazar userId');
    assert(!('userId' in entry.discarded!), 'discarded não deve vazar userId');

    console.log('  ✅ buildConflictLogEntry validada.');
  }

  // =========================================================================
  // 5. Limite estrito de 20 entradas no storage
  // =========================================================================
  console.log('\n--- 5. Limite máximo de 20 entradas no storage ---');
  {
    const storage = new FakeStorage();

    for (let i = 1; i <= 25; i++) {
      recordResolvedConflictEntry(
        {
          entityName: 'transactions',
          entityId: `tx_${i}`,
          action: 'use_remote',
          reason: `Conflito ${i}`,
          description: `Transação ${i}`,
          kept: { amount: i * 10 },
          discarded: { amount: i * 5 },
        },
        storage
      );
    }

    const entries = getResolvedConflictEntries(storage);
    assert(entries.length === 20, `Deve conter no máximo 20 entradas, encontrou ${entries.length}`);
    // A mais recente inserida (tx_25) deve estar na primeira posição
    assert(entries[0].entityId === 'tx_25', `Primeiro item deve ser o mais recente (tx_25), recebeu ${entries[0].entityId}`);
    assert(entries[19].entityId === 'tx_6', `Último item deve ser tx_6 (tx_1 a tx_5 foram descartados), recebeu ${entries[19].entityId}`);

    console.log('  ✅ Limite de 20 entradas respeitado com expiração das mais antigas.');
  }

  // =========================================================================
  // 6. Entradas antigas sem kept/discarded são lidas sem erro
  // =========================================================================
  console.log('\n--- 6. Compatibilidade com entradas antigas (sem kept/discarded) ---');
  {
    const storage = new FakeStorage();
    const legacyEntries = [
      {
        id: 'legacy_1',
        entityName: 'transactions',
        entityId: 'tx_old_1',
        description: 'Compra Antiga',
        resolvedAt: '2026-10-20T10:00:00Z',
        action: 'use_local',
        reason: 'Conflito legado',
      },
    ];

    storage.setItem(RESOLVED_CONFLICTS_STORAGE_KEY, JSON.stringify(legacyEntries));

    const loaded = getResolvedConflictEntries(storage);
    assert(loaded.length === 1, 'Deve ler entrada antiga com sucesso');
    assert(loaded[0].id === 'legacy_1', 'ID bate');
    assert(loaded[0].kept === undefined, 'kept deve ser undefined em entrada legada');
    assert(loaded[0].discarded === undefined, 'discarded deve ser undefined em entrada legada');

    // Teste de formatação com entrada legada
    const formatted = formatConflictSnapshotText('transactions', loaded[0].kept);
    assert(formatted === '', 'Formatação de snapshot indefinido deve retornar string vazia');

    console.log('  ✅ Compatibilidade retroativa com entradas legadas confirmada.');
  }

  // =========================================================================
  // 7. Formatação de snapshot para exibição na UI
  // =========================================================================
  console.log('\n--- 7. Formatação textual de snapshot para a UI ---');
  {
    const txSnapshot = {
      description: 'Jantar',
      amount: 120.5,
      date: '2026-10-25',
      type: 'expense',
    };
    const formattedTx = formatConflictSnapshotText('transactions', txSnapshot, 'BRL');
    assert(formattedTx.includes('Jantar'), 'Deve conter descrição');
    assert(formattedTx.includes('120,50') || formattedTx.includes('120.50'), 'Deve conter valor formatado');
    assert(formattedTx.includes('25/10/2026'), 'Deve conter data no formato brasileiro');
    assert(formattedTx.includes('Despesa'), 'Deve conter tipo');

    const invSnapshot = {
      type: 'buy',
      quantity: 100,
      price: 15.0,
      totalAmount: 1500.0,
      date: '2026-10-25',
    };
    const formattedInv = formatConflictSnapshotText('investmentTransactions', invSnapshot, 'BRL');
    assert(formattedInv.includes('Compra'), 'Deve conter Compra');
    assert(formattedInv.includes('100 cotas'), 'Deve conter quantidade de cotas');
    assert(formattedInv.includes('25/10/2026'), 'Deve conter data brasileira');

    console.log('  ✅ Formatação textual de snapshots validada com sucesso.');
  }

  console.log('\n🎉 Todos os testes de conflictLogEntry passaram com sucesso!');
}

runTests().catch(err => {
  console.error('\n❌ Falha nos testes de conflictLogEntry:', err);
  process.exit(1);
});
