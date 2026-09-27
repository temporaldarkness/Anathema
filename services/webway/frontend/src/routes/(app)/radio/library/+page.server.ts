import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const headers = { Cookie: `access_token=${token}` };
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	const [songsRes, queueRes] = await Promise.all([
		fetch(`${backendUrl}/api/radio/songs?limit=500`, { headers }),
		fetch(`${backendUrl}/api/radio/queue`, { headers })
	]);

	return {
		songs: songsRes.ok ? await songsRes.json() : { items: [], total: 0 },
		queue: queueRes.ok ? await queueRes.json() : { items: [] }
	};
};