export type SettingType = 'boolean' | 'number' | 'string' | 'select';

export interface SettingDef {
	key: string;
	type: SettingType;
	label: string;
	description?: string;
	// number
	min?: number;
	max?: number;
	// select
	options?: string[];
	// стиль
	dangerous?: boolean;
}

export interface SettingGroup {
	id: string;
	title: string;
	description?: string;
	items: SettingDef[];
}

export const SETTINGS_SCHEMA: SettingGroup[] = [
	{
		id: 'ai',
		title: 'AI',
		description: 'Модель и режим мышления',
		items: [
			{
				key: 'model',
				type: 'select',
				label: 'AI модель',
				description: 'Какая нейросеть обрабатывает диалоги. Free — самая дешёвая.',
				options: ['DeepSeek', 'Grok', 'Gemini', 'Anthropic', 'Free']
			},
			{
				key: 'thinking',
				type: 'boolean',
				label: 'Режим размышления',
				description: 'Модель тратит больше токенов, но даёт более обдуманные ответы.'
			},
			{
				key: 'hide_thinking',
				type: 'boolean',
				label: 'Скрывать размышления',
				description: 'Не показывать reasoning пользователям в Discord.'
			}
		]
	},
	{
		id: 'behavior',
		title: 'Поведение',
		description: 'Как бот взаимодействует с пользователями',
		items: [
			{
				key: 'locked',
				type: 'boolean',
				label: 'Жёсткая инструкция',
				description: 'Инструкции бота всегда важнее запроса пользователя.'
			},
			{
				key: 'awareness',
				type: 'boolean',
				label: 'Осведомлённость',
				description: 'Добавлять в промпт данные о пользователях и эмодзи сервера.'
			},
			{
				key: 'longterm',
				type: 'boolean',
				label: 'Долгосрочная память',
				description: 'Разрешить боту запоминать факты между диалогами.'
			},
			{
				key: 'longterm_limit',
				type: 'number',
				label: 'Лимит LTM',
				description: 'Максимум фактов в долгосрочной памяти.',
				min: 5,
				max: 200
			},
			{
				key: 'images',
				type: 'boolean',
				label: 'Изображения в контексте',
				description: 'Передавать вложения пользователей в AI.'
			}
		]
	},
	{
		id: 'caching',
		title: 'Кэш и контекст',
		description: 'Сколько истории бот помнит',
		items: [
			{
				key: 'channel_caching',
				type: 'boolean',
				label: 'Кэширование каналов',
				description: 'Загружать историю канала для контекста ответов.'
			},
			{
				key: 'caching_limit',
				type: 'number',
				label: 'Лимит кэша',
				description: 'Сколько последних сообщений канала передавать в AI.',
				min: 10,
				max: 500
			}
		]
	},
	{
		id: 'danger',
		title: 'Опасная зона',
		description: 'Изменяйте с осторожностью — эти параметры влияют на работу бота',
		items: [
			{
				key: 'preshutdown',
				type: 'boolean',
				label: 'Уведомление о выключении',
				description: 'Бот сообщит пользователю, что скоро будет отключён.',
				dangerous: true
			},
			{
				key: 'shutdown',
				type: 'boolean',
				label: 'Завершение работы',
				description: 'Бот перестанет отвечать на сообщения.',
				dangerous: true
			},
			{
				key: 'puppeteer',
				type: 'boolean',
				label: 'Puppeteer',
				description: 'Устаревший режим: команда sudo превращается в echo вместо exec.',
				dangerous: true
			}
		]
	}
];

// Значения по умолчанию (для кнопки сброса и индикации «изменено»)
export const SETTINGS_DEFAULTS: Record<string, string> = {
	thinking: 'false',
	puppeteer: 'true',
	awareness: 'true',
	hide_thinking: 'true',
	locked: 'true',
	channel_caching: 'true',
	caching_limit: '100',
	longterm_limit: '30',
	shutdown: 'false',
	longterm: 'true',
	model: 'Gemini',
	preshutdown: 'false',
	images: 'false'
};