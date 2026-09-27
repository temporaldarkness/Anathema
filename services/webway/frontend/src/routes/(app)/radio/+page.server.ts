import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const headers = { Cookie: `access_token=${token}` };
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	const [nowRes, historyRes, songsRes] = await Promise.all([
		fetch(`${backendUrl}/api/radio/now`, { headers }),
		fetch(`${backendUrl}/api/radio/history?limit=20`, { headers }),
		fetch(`${backendUrl}/api/radio/songs?limit=1`, { headers })
	]);

	return {
		now: nowRes.ok ? await nowRes.json() : { status: 'idle' },
		history: historyRes.ok ? await historyRes.json() : { items: [] },
		songsCount: songsRes.ok ? (await songsRes.json()).total : 0
	};
};