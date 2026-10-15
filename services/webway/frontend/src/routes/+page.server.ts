import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const sid = cookies.get('session_id');
	if (!sid) {
		return {};
	}

	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';
	const resp = await fetch(`${backendUrl}/api/me`, {
		headers: { Cookie: `session_id=${sid}` }
	});

	if (resp.ok) {
		throw redirect(302, '/dashboard');
	}

	return {};
};