const ANON_NAME_KEY = 'aspects.anon.name';

export function getAnonName(): string | null {
  return localStorage.getItem(ANON_NAME_KEY);
}

export function setAnonName(name: string): void {
  localStorage.setItem(ANON_NAME_KEY, name.trim().slice(0, 32) || 'Аноним');
}

/**
 * Снимает один-два слоя URL-энкодинга. Симметрично бэкендному
 * safeDecodeURIComponent — если кто-то сохранил имя дважды закодированным,
 * мы всё равно покажем читаемое значение.
 */
export function decodeAnonName(raw: string | null | undefined): string {
  if (!raw) return 'Аноним';
  let current = raw;
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(current)) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}