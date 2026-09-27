import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	const resp = await fetch(`${backendUrl}/api/radio/songs?limit=500`, {
		headers: { Cookie: `access_token=${token}` }
	});

	if (!resp.ok) {
		console.error('[radio/library load] status=', resp.status, 'body=', await resp.text());
		return { songs: { items: [], total: 0 } };
	}

	try {
		return { songs: await resp.json() };
	} catch (e) {
		console.error('[radio/library load] json parse failed', e);
		return { songs: { items: [], total: 0 } };
	}
};