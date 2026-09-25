import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	const contentType = response.headers.get('content-type');
	if (contentType?.startsWith('text/html')) {
		response.headers.set('content-type', 'text/html; charset=utf-8');
	}

	return response;
};