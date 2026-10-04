import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	const cookieHeader = cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ');
	const headers = { Cookie: cookieHeader };
	const backendUrl = env.BACKEND_URL ?? 'http://webway_backend:8000';

	const [kwRes, urRes, emotesRes, usersRes] = await Promise.all([
		fetch(`${backendUrl}/api/keywords`, { headers }),
		fetch(`${backendUrl}/api/user_reactions`, { headers }),
		fetch(`${backendUrl}/api/emotes`, { headers }),
		fetch(`${backendUrl}/api/users`, { headers })
	]);

	return {
		keywords: kwRes.ok ? await kwRes.json() : [],
		userReactions: urRes.ok ? await urRes.json() : [],
		emotes: emotesRes.ok ? await emotesRes.json() : [],
		users: usersRes.ok ? await usersRes.json() : []
	};
};