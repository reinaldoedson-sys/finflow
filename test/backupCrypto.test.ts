import { encryptData, decryptData } from '../src/utils/crypto';

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

// Helpers binários para manipulação nos testes
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Réplica da implementação legada de criptografia (100.000 iterações, sem cabeçalho)
async function encryptLegacy(payload: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(payload)
  );

  const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return bytesToBase64(combined);
}

// Helper para gerar um pacote v1 com contagem arbitrária de iterações
async function encryptV1CustomIterations(payload: string, passphrase: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const header = new Uint8Array(4 + 4 + 16);
  header[0] = 0x46; // 'F'
  header[1] = 0x46; // 'F'
  header[2] = 0x42; // 'B'
  header[3] = 0x31; // '1'
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint32(4, iterations, false);
  header.set(salt, 8);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encryptedContent = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: header
    },
    key,
    enc.encode(payload)
  );

  const combined = new Uint8Array(header.byteLength + iv.byteLength + encryptedContent.byteLength);
  combined.set(header, 0);
  combined.set(iv, header.byteLength);
  combined.set(new Uint8Array(encryptedContent), header.byteLength + iv.byteLength);

  return bytesToBase64(combined);
}

async function runTests() {
  console.log('--- INICIANDO TESTES DE CRIPTOGRAFIA DE BACKUP (v1 FFB1 & LEGADO) ---');

  const samplePayload = JSON.stringify({
    version: '1.0.0',
    exportedAt: '2026-10-10T12:00:00Z',
    accounts: [{ id: 'acc-1', name: 'Conta Principal', balance: 15420.50 }],
    transactions: [{ id: 'tx-1', amount: 120.0, description: 'Supermercado' }]
  });
  const passphrase = 'SenhaSegura!FinFlow@2026';

  // 1. Ida e volta no formato novo (v1)
  {
    console.log('\n[1] Ida e volta no formato novo (v1):');
    const encrypted = await encryptData(samplePayload, passphrase);
    assert(typeof encrypted === 'string' && encrypted.length > 0, 'encryptData retorna uma string base64');

    const bytes = base64ToBytes(encrypted);
    assert(bytes.length >= 36, `Tamanho binário suficiente para cabeçalho v1: ${bytes.length} bytes`);

    // Validação da assinatura mágica "FFB1"
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    assert(magic === 'FFB1', `Magic number é 'FFB1': ${magic}`);

    // Validação das 600.000 iterações no cabeçalho (big-endian)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const iterations = view.getUint32(4, false);
    assert(iterations === 600000, `Número de iterações gravado é 600.000: ${iterations}`);

    // Descriptografia com sucesso
    const decrypted = await decryptData(encrypted, passphrase);
    assert(decrypted === samplePayload, 'decryptData decifra o payload original idêntico');
  }

  // 2. Senha errada rejeitada
  {
    console.log('\n[2] Senha errada rejeitada:');
    const encrypted = await encryptData(samplePayload, passphrase);
    let threw = false;
    let errorMessage = '';

    try {
      await decryptData(encrypted, 'SenhaTotalmenteErrada');
    } catch (err: unknown) {
      threw = true;
      errorMessage = (err as Error).message;
    }

    assert(threw === true, 'decryptData lança erro ao tentar decifrar com senha incorreta');
    assert(
      errorMessage === 'Senha incorreta ou arquivo de backup corrompido.',
      `Mensagem de erro padronizada: "${errorMessage}"`
    );
  }

  // 3. Backup legado sendo aberto corretamente
  {
    console.log('\n[3] Backup legado (100.000 iterações, sem cabeçalho) aberto corretamente:');
    const legacyEncrypted = await encryptLegacy(samplePayload, passphrase);
    const legacyBytes = base64ToBytes(legacyEncrypted);
    const legacyMagic = String.fromCharCode(legacyBytes[0], legacyBytes[1], legacyBytes[2], legacyBytes[3]);
    assert(legacyMagic !== 'FFB1', 'Backup legado não possui magic FFB1');

    const decryptedLegacy = await decryptData(legacyEncrypted, passphrase);
    assert(decryptedLegacy === samplePayload, 'decryptData decifra backup em formato legado com sucesso');

    // Senha errada no backup legado também é rejeitada
    let legacyThrew = false;
    let legacyErrorMessage = '';
    try {
      await decryptData(legacyEncrypted, 'SenhaIncorretaParaLegado');
    } catch (err: unknown) {
      legacyThrew = true;
      legacyErrorMessage = (err as Error).message;
    }
    assert(legacyThrew === true, 'Senha incorreta no backup legado é rejeitada');
    assert(
      legacyErrorMessage === 'Senha incorreta ou arquivo de backup corrompido.',
      `Mensagem de erro no legado padronizada: "${legacyErrorMessage}"`
    );
  }

  // 4. Cabeçalho adulterado sendo rejeitado
  {
    console.log('\n[4] Cabeçalho adulterado sendo rejeitado (authenticated additionalData):');
    const encrypted = await encryptData(samplePayload, passphrase);

    // 4a. Alterar byte do número de iterações
    {
      const tamperedBytes = base64ToBytes(encrypted);
      tamperedBytes[5] ^= 0x01; // inverte 1 bit no campo de iterações
      const tamperedBase64 = bytesToBase64(tamperedBytes);

      let threw = false;
      try {
        await decryptData(tamperedBase64, passphrase);
      } catch {
        threw = true;
      }
      assert(threw === true, 'Adulteração de 1 bit nas iterações faz a decriptação falhar');
    }

    // 4b. Alterar byte do salt
    {
      const tamperedBytes = base64ToBytes(encrypted);
      tamperedBytes[12] ^= 0x01; // inverte 1 bit no salt
      const tamperedBase64 = bytesToBase64(tamperedBytes);

      let threw = false;
      try {
        await decryptData(tamperedBase64, passphrase);
      } catch {
        threw = true;
      }
      assert(threw === true, 'Adulteração de 1 bit no salt faz a decriptação falhar');
    }

    // 4c. Alterar byte do magic
    {
      const tamperedBytes = base64ToBytes(encrypted);
      tamperedBytes[0] = 0x58; // altera 'F' para 'X'
      const tamperedBase64 = bytesToBase64(tamperedBytes);

      let threw = false;
      try {
        await decryptData(tamperedBase64, passphrase);
      } catch {
        threw = true;
      }
      assert(threw === true, 'Adulteração do magic number faz a decriptação falhar');
    }
  }

  // 5. Iterações fora da faixa rejeitadas
  {
    console.log('\n[5] Iterações fora da faixa [100.000, 5.000.000] rejeitadas:');

    // 5a. Iterações abaixo do limite (ex: 50.000)
    {
      const lowIterEncrypted = await encryptV1CustomIterations(samplePayload, passphrase, 50000);
      let threw = false;
      try {
        await decryptData(lowIterEncrypted, passphrase);
      } catch {
        threw = true;
      }
      assert(threw === true, 'Iterações abaixo do mínimo (50.000 < 100.000) são rejeitadas');
    }

    // 5b. Iterações acima do limite (ex: 6.000.000)
    {
      // Apenas forjamos o cabeçalho com 6.000.000 para não despender tempo gerando
      const encrypted = await encryptData(samplePayload, passphrase);
      const bytes = base64ToBytes(encrypted);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      view.setUint32(4, 6000000, false);
      const highIterBase64 = bytesToBase64(bytes);

      let threw = false;
      try {
        await decryptData(highIterBase64, passphrase);
      } catch {
        threw = true;
      }
      assert(threw === true, 'Iterações acima do máximo (6.000.000 > 5.000.000) são rejeitadas');
    }
  }

  // 6. Dois backups do mesmo texto com a mesma senha gerando saídas diferentes
  {
    console.log('\n[6] Dois backups do mesmo texto com a mesma senha geram saídas distintas (salt & IV aleatórios):');
    const backup1 = await encryptData(samplePayload, passphrase);
    const backup2 = await encryptData(samplePayload, passphrase);

    assert(backup1 !== backup2, 'Os dois ciphertexts gerados são completamente diferentes');

    // Ambos devem decifrar com perfeição
    const dec1 = await decryptData(backup1, passphrase);
    const dec2 = await decryptData(backup2, passphrase);
    assert(dec1 === samplePayload, 'Primeiro backup decifra para o payload original');
    assert(dec2 === samplePayload, 'Segundo backup decifra para o payload original');
  }

  console.log('\n========================================');
  console.log(`TOTAL DE TESTES: ${passed + failed}`);
  console.log(`PASSOU: ${passed}`);
  console.log(`FALHOU: ${failed}`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal ao rodar testes:', err);
  process.exit(1);
});
