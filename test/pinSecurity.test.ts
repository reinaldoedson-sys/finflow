import {
  hashPin,
  verifyPin,
  hashString,
  isLegacyPinHash,
  verifyAndMigratePin,
  calculateLockoutDurationMs,
  isLockedOut,
  recordFailedAttempt,
  resetLockout,
  constantTimeEqual,
  constantTimeStringEqual
} from '../src/utils/crypto';

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

async function runTests() {
  console.log('--- INICIANDO TESTES DE SEGURANÇA DO BLOQUEIO POR PIN ---');

  // 1. Hash e verificação corretos (PBKDF2-SHA256, 210.000 iterações, string versionada)
  {
    console.log('\n[1] Hash e verificação corretos:');
    const pin = '1234';
    const hash = await hashPin(pin);

    assert(typeof hash === 'string', 'hashPin retorna uma string');
    assert(hash.startsWith('pbkdf2$v1$210000$'), `Formato correto com prefixo pbkdf2$v1$210000$: ${hash.substring(0, 25)}...`);

    const parts = hash.split('$');
    assert(parts.length === 5, `Hash possui 5 partes separadas por $: ${parts.length}`);
    assert(parts[2] === '210000', `Número de iterações é 210.000: ${parts[2]}`);
    assert(parts[3].length > 0, `Salt presente em base64: ${parts[3]}`);
    assert(parts[4].length > 0, `Hash presente em base64: ${parts[4]}`);

    const isValid = await verifyPin(pin, hash);
    assert(isValid === true, 'verifyPin valida PIN correto com sucesso');
  }

  // 2. PIN errado rejeitado
  {
    console.log('\n[2] PIN errado rejeitado:');
    const pin = '4321';
    const hash = await hashPin(pin);

    const wrongPin1 = await verifyPin('1234', hash);
    assert(wrongPin1 === false, 'verifyPin rejeita PIN diferente');

    const wrongPin2 = await verifyPin('4322', hash);
    assert(wrongPin2 === false, 'verifyPin rejeita PIN com um dígito diferente');

    const wrongPinEmpty = await verifyPin('', hash);
    assert(wrongPinEmpty === false, 'verifyPin rejeita PIN vazio');

    const malformedHash = await verifyPin(pin, 'invalid_hash_string');
    assert(malformedHash === false, 'verifyPin rejeita formato de hash malformado com segurança');

    const corruptedHash = await verifyPin(pin, 'pbkdf2$v1$210000$salt$invalidbase64@@@');
    assert(corruptedHash === false, 'verifyPin lida de forma segura com base64 inválido sem lançar exceção');
  }

  // 3. Salts diferentes gerando hashes diferentes
  {
    console.log('\n[3] Salts diferentes geram hashes diferentes:');
    const pin = '8888';
    const hashA = await hashPin(pin);
    const hashB = await hashPin(pin);

    assert(hashA !== hashB, 'Duas chamadas de hashPin com mesmo PIN geram hashes diferentes devido a salts aleatórios');
    const validA = await verifyPin(pin, hashA);
    const validB = await verifyPin(pin, hashB);
    assert(validA === true && validB === true, 'Ambos os hashes com salts distintos verificam o mesmo PIN com sucesso');

    // Teste com salt explícito
    const customSalt1 = btoa('1234567890123456');
    const customSalt2 = btoa('abcdefghijklmnop');
    const hashWithSalt1 = await hashPin(pin, customSalt1);
    const hashWithSalt2 = await hashPin(pin, customSalt2);
    assert(hashWithSalt1 !== hashWithSalt2, 'Hashes com salts manuais distintos são diferentes');
    assert(await verifyPin(pin, hashWithSalt1) === true, 'Hash com salt manual valida o PIN');
  }

  // 4. Migração transparente do formato antigo para o novo
  {
    console.log('\n[4] Migração sem quebrar quem já tem PIN:');
    const pin = '9512';
    // Gera hash no formato antigo (SHA-256 com salt fixo do código, 64 caracteres hex)
    const legacyHash = await hashString(pin);

    assert(legacyHash.length === 64, `Hash legado possui 64 caracteres hexadecimais: ${legacyHash}`);
    assert(!legacyHash.startsWith('pbkdf2$'), 'Hash legado não possui prefixo pbkdf2$');
    assert(isLegacyPinHash(legacyHash) === true, 'isLegacyPinHash identifica o formato legado corretamente');

    // Validação com PIN correto: deve validar e retornar o novo hash no formato pbkdf2
    const migrationResult = await verifyAndMigratePin(pin, legacyHash);
    assert(migrationResult.isValid === true, 'verifyAndMigratePin valida PIN correto com hash legado');
    assert(typeof migrationResult.migratedHash === 'string', 'verifyAndMigratePin retorna migratedHash');
    assert(
      migrationResult.migratedHash!.startsWith('pbkdf2$v1$210000$'),
      'migratedHash gerado está no novo formato PBKDF2 v1 com 210.000 iterações'
    );

    // O novo hash migrado deve ser verificável normalmente via verifyPin
    const verifyNewHash = await verifyPin(pin, migrationResult.migratedHash!);
    assert(verifyNewHash === true, 'O novo hash regravado valida o PIN perfeitamente');

    // PIN incorreto no hash legado: NÃO deve validar e NÃO deve migrar
    const wrongMigrationResult = await verifyAndMigratePin('0000', legacyHash);
    assert(wrongMigrationResult.isValid === false, 'verifyAndMigratePin rejeita PIN errado em hash legado');
    assert(wrongMigrationResult.migratedHash === undefined, 'PIN errado não produz hash migrado');

    // Hash já no novo formato não deve exigir regravação (migratedHash undefined)
    const modernResult = await verifyAndMigratePin(pin, migrationResult.migratedHash!);
    assert(modernResult.isValid === true, 'Hash já migrado valida com sucesso');
    assert(modernResult.migratedHash === undefined, 'Hash que já é PBKDF2 não precisa de nova migração');
  }

  // 5. Bloqueio progressivo após erros
  {
    console.log('\n[5] Bloqueio progressivo após erros (5 erros bloqueiam, tempo dobra, acerto zera):');

    // Erros 1 a 4: nenhum bloqueio (duração 0)
    for (let attempts = 1; attempts <= 4; attempts++) {
      const duration = calculateLockoutDurationMs(attempts);
      assert(duration === 0, `${attempts} tentativa(s) incorreta(s): não bloqueia (duração ${duration}ms)`);
    }

    // 5 erros seguidos: bloqueio inicial de 30 segundos
    const lock5 = calculateLockoutDurationMs(5);
    assert(lock5 === 30000, `5 erros seguidos: bloqueia por 30s (${lock5}ms)`);

    // A cada novo bloqueio o tempo dobra
    const lock6 = calculateLockoutDurationMs(6);
    assert(lock6 === 60000, `6 erros seguidos: tempo dobra para 60s (${lock6}ms)`);

    const lock7 = calculateLockoutDurationMs(7);
    assert(lock7 === 120000, `7 erros seguidos: tempo dobra para 120s (${lock7}ms)`);

    const lock8 = calculateLockoutDurationMs(8);
    assert(lock8 === 240000, `8 erros seguidos: tempo dobra para 240s (${lock8}ms)`);

    const lock9 = calculateLockoutDurationMs(9);
    assert(lock9 === 480000, `9 erros seguidos: tempo dobra para 480s (${lock9}ms)`);

    // 10 erros seguidos: 960s dobra além de 15m, mas é limitado ao teto de 15 minutos (900s = 900.000ms)
    const lock10 = calculateLockoutDurationMs(10);
    assert(lock10 === 900000, `10 erros seguidos: atinge teto máximo de 15 minutos (900s = ${lock10}ms)`);

    const lock15 = calculateLockoutDurationMs(15);
    assert(lock15 === 900000, `15 erros seguidos: mantém teto máximo de 15 minutos (${lock15}ms)`);

    // Teste de isLockedOut
    const now = 1000000;
    assert(isLockedOut(now + 15000, now) === true, 'isLockedOut é true enquanto timestamp é futuro');
    assert(isLockedOut(now - 1, now) === false, 'isLockedOut é false quando timestamp já expirou');
    assert(isLockedOut(undefined, now) === false, 'isLockedOut é false quando não há bloqueio ativo');

    // Fluxo sequencial de tentativas e reset com acerto
    let failedCount = 0;
    const baseTime = 2000000;

    // 4 falhas
    for (let i = 1; i <= 4; i++) {
      const step = recordFailedAttempt(failedCount, baseTime);
      failedCount = step.failedAttempts;
      assert(step.lockDurationMs === 0 && step.lockedUntil === undefined, `Tentativa ${i}: sem bloqueio`);
    }

    // 5ª falha: aciona bloqueio de 30s
    const step5 = recordFailedAttempt(failedCount, baseTime);
    failedCount = step5.failedAttempts;
    assert(failedCount === 5, 'failedAttempts alcança 5');
    assert(step5.lockDurationMs === 30000, '5ª falha bloqueia por 30s');
    assert(step5.lockedUntil === baseTime + 30000, 'lockedUntil é baseTime + 30.000ms');

    // Simula 6ª falha após expirar o primeiro bloqueio: dobra para 60s
    const step6 = recordFailedAttempt(failedCount, baseTime + 35000);
    failedCount = step6.failedAttempts;
    assert(failedCount === 6, 'failedAttempts incrementa para 6');
    assert(step6.lockDurationMs === 60000, '6ª falha dobra bloqueio para 60s');
    assert(step6.lockedUntil === baseTime + 35000 + 60000, 'lockedUntil é agora + 60.000ms');

    // Acerto zera tudo imediatamente
    const reset = resetLockout();
    assert(reset.failedAttempts === 0, 'Acerto zera failedAttempts para 0');
    assert(reset.lockedUntil === undefined, 'Acerto zera lockedUntil para undefined');

    // Próxima falha após acerto recomeça do zero
    const afterReset = recordFailedAttempt(reset.failedAttempts, baseTime + 100000);
    assert(afterReset.failedAttempts === 1, 'Após acerto, novo erro conta como 1ª tentativa');
    assert(afterReset.lockDurationMs === 0, 'Após acerto, 1ª tentativa não bloqueia');
  }

  // 6. Comparação em tempo constante
  {
    console.log('\n[6] Comparação em tempo constante:');
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    const c = new Uint8Array([1, 2, 3, 5]);
    const d = new Uint8Array([1, 2, 3]);

    assert(constantTimeEqual(a, b) === true, 'constantTimeEqual retorna true para buffers iguais');
    assert(constantTimeEqual(a, c) === false, 'constantTimeEqual retorna false para buffers diferentes');
    assert(constantTimeEqual(a, d) === false, 'constantTimeEqual retorna false para tamanhos diferentes');

    assert(constantTimeStringEqual('abc', 'abc') === true, 'constantTimeStringEqual retorna true para strings iguais');
    assert(constantTimeStringEqual('abc', 'abd') === false, 'constantTimeStringEqual retorna false para strings diferentes');
    assert(constantTimeStringEqual('abc', 'ab') === false, 'constantTimeStringEqual retorna false para comprimentos diferentes');
  }

  console.log(`\n========================================`);
  console.log(`Resultado Final: ${passed} passaram, ${failed} falharam.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro inesperado nos testes:', err);
  process.exit(1);
});
