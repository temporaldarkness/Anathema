import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';
	const resp = await fetch(`${backendUrl}/api/gallery?limit=60&offset=0`, {
		headers: { Cookie: `access_token=${token}` }
	});
	return { gallery: resp.ok ? await resp.json() : { items: [], total: 0 } };
};