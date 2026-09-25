import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get('access_token');
	if (!token) return { items: [] };
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	try {
		const resp = await fetch(`${backendUrl}/api/ltm`, {
			headers: { Cookie: `access_token=${token}` }
		});
		if (!resp.ok) {
			console.error('LTM fetch failed:', resp.status, await resp.text());
			return { items: [] };
		}
		const json = await resp.json();
		const items = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
		return { items };
	} catch (e) {
		console.error('LTM fetch threw:', e);
		return { items: [] };
	}
};