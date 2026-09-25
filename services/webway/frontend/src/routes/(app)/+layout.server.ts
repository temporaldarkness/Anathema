import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	if (!token) {
		throw redirect(302, '/');
	}
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	const response = await fetch(`${backendUrl}/api/me`, {
        headers: {
            'Cookie': `access_token=${token}`
        }
    });

	if (!response.ok) {
		throw redirect(302, '/');
	}

	const user = await response.json();
	return { user };
};