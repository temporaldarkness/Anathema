import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const token = cookies.get('access_token');
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';
	const resp = await fetch(`${backendUrl}/api/eyes/channels`, {
		headers: { Cookie: `access_token=${token}` }
	});
	const data = resp.ok ? await resp.json() : { channels: [], guild_id: 0 };
	return { channels: data.channels, guildId: data.guild_id };
};