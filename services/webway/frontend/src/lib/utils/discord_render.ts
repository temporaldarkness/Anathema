export type ContentPart =
	| { type: 'text'; value: string }
	| { type: 'user'; id: string }
	| { type: 'role'; id: string }
	| { type: 'channel'; id: string }
	| { type: 'emoji'; id: string; name: string; animated: boolean };

const RE =
	/<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|<(a?):([\w-]+):(\d+)>|(https?:\/\/\S+)/g;

export function parseDiscordContent(content: string): ContentPart[] {
	const parts: ContentPart[] = [];
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	RE.lastIndex = 0;

	while ((m = RE.exec(content)) !== null) {
		if (m.index > lastIndex) {
			parts.push({ type: 'text', value: content.slice(lastIndex, m.index) });
		}
		if (m[1]) {
			parts.push({ type: 'user', id: m[1] });
		} else if (m[2]) {
			parts.push({ type: 'role', id: m[2] });
		} else if (m[3]) {
			parts.push({ type: 'channel', id: m[3] });
		} else if (m[6]) {
			parts.push({
				type: 'emoji',
				id: m[6],
				name: m[5],
				animated: m[4] === 'a',
			});
		} else if (m[7]) {
			parts.push({ type: 'text', value: m[7] });
		}
		lastIndex = m.index + m[0].length;
	}

	if (lastIndex < content.length) {
		parts.push({ type: 'text', value: content.slice(lastIndex) });
	}
	return parts;
}

export function extractUserMentionIds(content: string): string[] {
	const ids: string[] = [];
	const re = /<@!?(\d+)>/g;
	let m;
	while ((m = re.exec(content)) !== null) ids.push(m[1]);
	return ids;
}

export function extractChannelMentionIds(content: string): string[] {
	const ids: string[] = [];
	const re = /<#(\d+)>/g;
	let m;
	while ((m = re.exec(content)) !== null) ids.push(m[1]);
	return ids;
}