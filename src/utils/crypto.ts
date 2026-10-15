/**
 * Utility functions for client-side security:
 * - SHA-256 hashing for PIN codes (legacy)
 * - PBKDF2-SHA256 (210,000 iterations) with versioned string format for secure PIN codes
 * - Constant-time comparison & progressive lockout helpers
 * - AES-GCM 256-bit encryption & decryption for encrypted backups
 */

const PIN_ITERATIONS = 210000;
const MAX_LOCKOUT_SECONDS = 15 * 60; // 15 minutos = 900 segundos

// Helper to convert Uint8Array to Base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Constant-time byte array comparison
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// Constant-time string comparison
export function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Legacy hash for backward compatibility (SHA-256 with fixed salt)
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value + '_finflow_secure_salt_2025');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if a stored hash is in the legacy SHA-256 hex format (64 chars, not starting with pbkdf2$)
export function isLegacyPinHash(hash?: string): boolean {
  if (!hash || typeof hash !== 'string') return false;
  return !hash.startsWith('pbkdf2$') && /^[0-9a-f]{64}$/i.test(hash);
}

// Hash a PIN using PBKDF2-SHA256 (210,000 iterations) with 16-byte salt
export async function hashPin(pin: string, saltBase64?: string): Promise<string> {
  const salt = saltBase64 ? base64ToUint8Array(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PIN_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 32 bytes
  );

  const saltOut = uint8ArrayToBase64(salt);
  const hashOut = uint8ArrayToBase64(new Uint8Array(derivedBits));

  // Formato versionado: pbkdf2$v1$<iterações>$<saltBase64>$<hashBase64>
  return `pbkdf2$v1$${PIN_ITERATIONS}$${saltOut}$${hashOut}`;
}

// Verify a PIN against a stored versioned PBKDF2 hash using constant-time comparison
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'v1') {
    return false;
  }

  const iterations = parseInt(parts[2], 10);
  if (isNaN(iterations) || iterations <= 0) {
    return false;
  }

  try {
    const salt = base64ToUint8Array(parts[3]);
    const expectedHash = base64ToUint8Array(parts[4]);

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      expectedHash.length * 8
    );

    const actualHash = new Uint8Array(derivedBits);
    return constantTimeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

// Verify PIN supporting transparent migration from legacy SHA-256 to PBKDF2
export async function verifyAndMigratePin(
  pin: string,
  storedHash: string
): Promise<{ isValid: boolean; migratedHash?: string }> {
  if (!storedHash) {
    return { isValid: false };
  }

  if (isLegacyPinHash(storedHash)) {
    const legacyCalculated = await hashString(pin);
    const isValid = constantTimeStringEqual(legacyCalculated, storedHash);
    if (isValid) {
      const newHash = await hashPin(pin);
      return { isValid: true, migratedHash: newHash };
    }
    return { isValid: false };
  }

  const isValid = await verifyPin(pin, storedHash);
  return { isValid };
}

// Progressive lockout calculation:
// < 5 errors: 0
// 5 errors: 30s
// Each subsequent error doubles time (60s, 120s, 240s...), capped at 15 minutes (900s)
export function calculateLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < 5) {
    return 0;
  }
  const lockIndex = failedAttempts - 5;
  const durationSeconds = Math.min(30 * Math.pow(2, lockIndex), MAX_LOCKOUT_SECONDS);
  return durationSeconds * 1000;
}

export function isLockedOut(lockedUntil?: number, now: number = Date.now()): boolean {
  return typeof lockedUntil === 'number' && lockedUntil > now;
}

export function recordFailedAttempt(
  currentFailedAttempts: number = 0,
  now: number = Date.now()
): { failedAttempts: number; lockedUntil?: number; lockDurationMs: number } {
  const failedAttempts = currentFailedAttempts + 1;
  const lockDurationMs = calculateLockoutDurationMs(failedAttempts);
  const lockedUntil = lockDurationMs > 0 ? now + lockDurationMs : undefined;
  return { failedAttempts, lockedUntil, lockDurationMs };
}

export function resetLockout(): { failedAttempts: 0; lockedUntil: undefined } {
  return { failedAttempts: 0, lockedUntil: undefined };
}

const BACKUP_V1_MAGIC = new Uint8Array([0x46, 0x46, 0x42, 0x31]); // "FFB1"
const BACKUP_V1_ITERATIONS = 600000;
const BACKUP_MIN_ITERATIONS = 100000;
const BACKUP_MAX_ITERATIONS = 5000000;
const BACKUP_LEGACY_ITERATIONS = 100000;

// Derive a cryptographic AES-GCM key from a passphrase using PBKDF2-SHA256
async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number = BACKUP_LEGACY_ITERATIONS): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext payload with a password (format v1: [magic "FFB1" 4B][iterations 4B big-endian][salt 16B][iv 12B][ciphertext])
export async function encryptData(payload: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, BACKUP_V1_ITERATIONS);

  // Cabeçalho binário: [magic "FFB1" (4 bytes)][iterações (4 bytes big-endian)][salt (16 bytes)]
  const header = new Uint8Array(4 + 4 + 16);
  header.set(BACKUP_V1_MAGIC, 0);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint32(4, BACKUP_V1_ITERATIONS, false); // big-endian
  header.set(salt, 8);

  const enc = new TextEncoder();
  // Autenticação do cabeçalho via additionalData no AES-GCM
  const encryptedContent = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: header as unknown as BufferSource
    },
    key,
    enc.encode(payload)
  );

  // [header 24 bytes][iv 12 bytes][dados cifrados]
  const combined = new Uint8Array(header.byteLength + iv.byteLength + encryptedContent.byteLength);
  combined.set(header, 0);
  combined.set(iv, header.byteLength);
  combined.set(new Uint8Array(encryptedContent), header.byteLength + iv.byteLength);

  return uint8ArrayToBase64(combined);
}

// Decrypt base64 encrypted payload with passphrase (supports v1 FFB1 format and legacy format)
export async function decryptData(encryptedBase64: string, passphrase: string): Promise<string> {
  try {
    const bytes = base64ToUint8Array(encryptedBase64);

    // Detectar formato pelo magic "FFB1" (0x46, 0x46, 0x42, 0x31)
    const isV1 =
      bytes.length >= 4 &&
      bytes[0] === 0x46 &&
      bytes[1] === 0x46 &&
      bytes[2] === 0x42 &&
      bytes[3] === 0x31;

    if (isV1) {
      if (bytes.length < 36) {
        throw new Error('Arquivo de backup truncado.');
      }

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const iterations = view.getUint32(4, false); // big-endian

      // Validação do número de iterações para evitar DoS
      if (iterations < BACKUP_MIN_ITERATIONS || iterations > BACKUP_MAX_ITERATIONS) {
        throw new Error('Número de iterações fora do limite permitido.');
      }

      const header = bytes.slice(0, 24);
      const salt = bytes.slice(8, 24);
      const iv = bytes.slice(24, 36);
      const data = bytes.slice(36);

      const key = await deriveKey(passphrase, salt, iterations);
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as unknown as BufferSource,
          additionalData: header as unknown as BufferSource
        },
        key,
        data as unknown as BufferSource
      );

      const dec = new TextDecoder();
      return dec.decode(decryptedBuffer);
    } else {
      // Formato legado: [salt 16 bytes][iv 12 bytes][dados], 100.000 iterações, sem cabeçalho
      if (bytes.length < 28) {
        throw new Error('Arquivo de backup legado corrompido.');
      }

      const salt = bytes.slice(0, 16);
      const iv = bytes.slice(16, 28);
      const data = bytes.slice(28);

      const key = await deriveKey(passphrase, salt, BACKUP_LEGACY_ITERATIONS);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        data as unknown as BufferSource
      );

      const dec = new TextDecoder();
      return dec.decode(decryptedBuffer);
    }
  } catch {
    throw new Error('Senha incorreta ou arquivo de backup corrompido.');
  }
}
