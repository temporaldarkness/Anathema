export type ParsedEmote =
	| { kind: 'unicode'; source: string }
	| { kind: 'custom'; source: string; name: string; animated: boolean }
	| null;

/**
 * Парсит Discord-эмодзи.
 * Поддерживает:
 *  - обычный Unicode-глиф ("👍", "🐸")
 *  - <:name:id>      (статичный кастомный)
 *  - <a:name:id>     (анимированный кастомный)
 */
export function parseEmote(raw: string): ParsedEmote {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	// <a:name:id> или <:name:id>
	const custom = trimmed.match(/^<(a?):([\w-]+):(\d+)>$/);
	if (custom) {
		return {
			kind: 'custom',
			source: custom[3],
			name: custom[2],
			animated: custom[1] === 'a'
		};
	}

	// Только ID (обычно скопированный вручную)
	if (/^\d{15,}$/.test(trimmed)) {
		return { kind: 'custom', source: trimmed, name: 'emote', animated: false };
	}

	// Одиночный глиф (1–2 code units, но мы не будем строго валидировать)
	if (trimmed.length <= 8) {
		return { kind: 'unicode', source: trimmed };
	}

	return null;
}

/**
 * Возвращает URL картинки для кастомного эмодзи.
 */
export function emoteCdnUrl(id: string, size = 44): string {
	return `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&quality=lossless`;
}

/**
 * Возвращает «технический код», который надо вставить в сообщение бота,
 * чтобы Discord показал этот эмодзи.
 */
export function emoteDisplayCode(source: string, name = 'emote', animated = false): string {
	if (/^\d+$/.test(source)) {
		return `<${animated ? 'a' : ''}:${name}:${source}>`;
	}
	return source;
}