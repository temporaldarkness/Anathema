export const GENDERS = [
	{ value: 0, label: 'Не указан' },
	{ value: 1, label: 'Мужской' },
	{ value: 2, label: 'Женский' },
	{ value: 3, label: 'Небинарный' },
	{ value: 4, label: 'Другое' }
] as const;

export const ORIENTATIONS = [
	{ value: 0, label: 'Не указана' },
	{ value: 1, label: 'Гетеросексуальная' },
	{ value: 2, label: 'Гомосексуальная' },
	{ value: 3, label: 'Бисексуальная' },
	{ value: 4, label: 'Асексуальная' },
	{ value: 5, label: 'Другое' }
] as const;

function toNum(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}
export function labelForGender(v: unknown): string {
	const n = toNum(v);
	if (n === null) return '—';
	return GENDERS.find((g) => g.value === n)?.label ?? '—';
}
export function labelForOrientation(v: unknown): string {
	const n = toNum(v);
	if (n === null) return '—';
	return ORIENTATIONS.find((o) => o.value === n)?.label ?? '—';
}

export const CHANNEL_TYPES: Record<number, string> = {
	0: 'Текстовый',
	2: 'Голосовой',
	4: 'Категория',
	5: 'Анонсы',
	13: 'Стрим',
	15: 'Форум',
	16: 'Медиа'
};

export function labelForChannelType(t: unknown): string {
	const n = toNum(t);
	if (n === null) return 'Неизвестно';
	return CHANNEL_TYPES.find((o) => o.value === n)?.label ?? 'Неизвестно';
}