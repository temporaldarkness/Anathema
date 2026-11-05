import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const cookieHeader = cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ');
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';
	
	const resp = await fetch(`${backendUrl}/api/settings`, {
		headers: { Cookie: cookieHeader }
	});
	
	const raw = resp.ok ? await resp.json() : [];
	const values = Object.fromEntries(raw.map((s: any) => [s.key, s.value]));
	return { values };
};