export type HapticPattern = 'light' | 'medium' | 'success' | 'warning' | 'error';

const HAPTICS_STORAGE_KEY = 'ondefoi_haptics_enabled';

/**
 * Retorna se o feedback tátil está ativado nas preferências locais do usuário.
 * Padrão: ativado (true) se o navegador tiver suporte a navigator.vibrate.
 */
export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = localStorage.getItem(HAPTICS_STORAGE_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Define se o feedback tátil está ativado ou desativado.
 */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}

/**
 * Dispara microvibração tátil suave no dispositivo do usuário (se suportado e habilitado).
 * - 'light': toque sutil para digitação de PIN ou troca de aba (12ms)
 * - 'medium': toque moderado para ações secundárias (25ms)
 * - 'success': pulso duplo de confirmação ao salvar lançamento ([15, 35, 20]ms)
 * - 'warning': alerta suave ([30, 40, 30]ms)
 * - 'error': pulso triplo ao digitar PIN incorreto ([50, 40, 50, 40, 50]ms)
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): void {
  if (typeof window === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  if (!isHapticsEnabled()) return;

  try {
    switch (pattern) {
      case 'light':
        navigator.vibrate(12);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'success':
        navigator.vibrate([15, 35, 20]);
        break;
      case 'warning':
        navigator.vibrate([30, 40, 30]);
        break;
      case 'error':
        navigator.vibrate([50, 40, 50, 40, 50]);
        break;
    }
  } catch {
    // Os navegadores podem restringir a vibração se não houver gesto prévio do usuário
  }
}
