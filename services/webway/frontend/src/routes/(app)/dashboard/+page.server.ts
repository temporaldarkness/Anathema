import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const headers = { Cookie: `access_token=${token}` };
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';
	
	const [overviewRes, analyticsRes] = await Promise.all([
		fetch(`${backendUrl}/api/dashboard/overview`, { headers }),
		fetch(`${backendUrl}/api/dashboard/analytics?hours=24&days=7`, { headers })
	]);
	
	return {
		overview: overviewRes.ok ? await overviewRes.json() : null,
		analytics: analyticsRes.ok ? await analyticsRes.json() : null
	};
};