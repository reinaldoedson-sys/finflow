/**
 * Gerador de IDs seguros e resistentes a colisão para uso local e offline.
 * Utiliza crypto.randomUUID() garantindo entropia de 128 bits.
 */

export function generateId(prefix: string = ''): string {
  let uuid: string;

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID();
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    uuid = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Fallback de emergência (raro em browsers modernos)
    uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Se o prefixo já tiver hífen no final, anexa direto; caso contrário, adiciona hífen
  if (!prefix) return uuid;
  return prefix.endsWith('-') ? `${prefix}${uuid}` : `${prefix}-${uuid}`;
}
