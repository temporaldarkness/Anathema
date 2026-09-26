import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
	const token = cookies.get('access_token');
	const params = new URLSearchParams();
	params.set('limit', url.searchParams.get('limit') ?? '50');
	params.set('offset', url.searchParams.get('offset') ?? '0');

	for (const k of ['actor_id', 'entity_type', 'entity_id', 'action', 'success', 'source_service', 'search']) {
		const v = url.searchParams.get(k);
		if (v) params.set(k, v);
	}
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	const [listRes, statsRes] = await Promise.all([
		fetch(`${backendUrl}/api/audit?${params}`, { headers: { Cookie: `access_token=${token}` } }),
		fetch(`${backendUrl}/api/audit/stats`, { headers: { Cookie: `access_token=${token}` } })
	]);

	return {
		audit: listRes.ok
			? await listRes.json()
			: { items: [], total: 0, limit: 50, offset: 0 },
		stats: statsRes.ok ? await statsRes.json() : null
	};
};