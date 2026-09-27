export function formatUptime(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined) return '—';
	if (seconds < 60) return `${seconds}с`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}м`;
	if (seconds < 86400) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return `${h}ч ${m}м`;
	}
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	return `${d}д ${h}ч`;
}

export function formatNumber(n: number): string {
	return new Intl.NumberFormat('ru-RU').format(n);
}

export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleString('ru-RU', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatUSD(amount: number | null | undefined): string {
	if (amount === null || amount === undefined) return '—';
	if (amount === 0) return '$0';
	if (amount < 0.01) return `$${amount.toFixed(4)}`;
	if (amount < 1) return `$${amount.toFixed(3)}`;
	return `$${amount.toFixed(2)}`;
}

export function formatRUB(amount: number | null | undefined): string {
	if (amount === null || amount === undefined) return '—';
	if (amount === 0) return '₽0';
	if (amount < 0.01) return `$₽{amount.toFixed(4)}`;
	if (amount < 1) return `$₽{amount.toFixed(3)}`;
	return `$${amount.toFixed(2)}`;
}