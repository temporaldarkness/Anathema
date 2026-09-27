export async function extractError(resp: Response): Promise<string> {
	try {
		const data = await resp.json();
		const detail = data?.detail;

		if (typeof detail === 'string') return detail;

		if (Array.isArray(detail)) {
			return detail
				.map((e: any) => {
					const field = Array.isArray(e.loc) ? e.loc.filter((x: any) => x !== 'body').join('.') : '';
					return field ? `${field}: ${e.msg}` : e.msg;
				})
				.join('; ');
		}

		return `Ошибка ${resp.status}`;
	} catch {
		return `Ошибка ${resp.status}`;
	}
}