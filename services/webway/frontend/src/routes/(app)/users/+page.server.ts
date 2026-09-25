import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';
	const resp = await fetch(`${backendUrl}/api/users`, {
		headers: { Cookie: `access_token=${token}` }
	});
	
	if (!resp.ok) return { users: [] };
	
	const raw = await resp.json();
	return { users: Array.isArray(raw) ? raw : [] };
};