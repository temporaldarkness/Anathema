/**
 * Динамическая загрузка тем. Все css-файлы в styles/themes/*
 * подхватываются Vite через import.meta.glob (?raw), чтобы
 * комментарии с метаданными не вырезались минификатором.
 *
 * Метаданные читаются из первого комментария вида:
 *   /* @theme
 *      name: 8-Bit
 *      description: Ретро-аркада...
 *      light: false
 *   * /
 */

const modules = import.meta.glob<string>('../styles/themes/*.css', {
  query: '?raw',
  import: 'default',
});

export const DEFAULT_THEME = 'default';

export interface ThemePreview {
  bg: string;
  card: string;
  border: string;
  text: string;
  textSoft: string;
  accent: string;
  accentDark: string;
  title: string;
  danger: string;
  warning: string;
  success: string;
}

export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  light: boolean;
  preview: ThemePreview;
}

const DEFAULT_PREVIEW: ThemePreview = {
  bg: '#0a0c10',
  card: '#14171c',
  border: '#22262e',
  text: '#e6e6e6',
  textSoft: '#8a8f99',
  accent: '#3b82f6',
  accentDark: '#1e3a5f',
  title: '#fbbf24',
  danger: '#ef4444',
  warning: '#fbbf24',
  success: '#22c55e',
};

const BUILTIN_DEFAULT: ThemeMeta = {
  id: DEFAULT_THEME,
  name: 'По умолчанию',
  description: 'Базовая тёмная палитра Аспектов.',
  light: false,
  preview: { ...DEFAULT_PREVIEW },
};

// ─── Парсинг CSS ───

function parseThemeHeader(css: string, id: string): ThemeMeta {
  const meta: ThemeMeta = {
    id,
    name: id,
    description: 'Описание не задано',
    light: false,
    preview: { ...DEFAULT_PREVIEW },
  };

  const themeBlock = css.match(/\/\*\s*@theme\s*([\s\S]*?)\*\//);
  if (themeBlock) {
    const body = themeBlock[1];
    const nameMatch = body.match(/name:\s*(.+)/i);
    const descMatch = body.match(/description:\s*(.+)/i);
    const lightMatch = body.match(/light:\s*(true|false)/i);
    if (nameMatch) meta.name = nameMatch[1].trim();
    if (descMatch) meta.description = descMatch[1].trim();
    if (lightMatch) meta.light = lightMatch[1].toLowerCase() === 'true';
  }

  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (rootMatch) {
    const vars: Record<string, string> = {};
    for (const line of rootMatch[1].split(';')) {
      const m = line.match(/--clr-([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/);
      if (m) vars[m[1]] = m[2].trim();
    }
    const p = meta.preview;
    if (vars['background']) p.bg = vars['background'];
    if (vars['element-bg']) p.card = vars['element-bg'];
    if (vars['border']) p.border = vars['border'];
    if (vars['text']) p.text = vars['text'];
    if (vars['text-soft']) p.textSoft = vars['text-soft'];
    else if (vars['element-muted']) p.textSoft = vars['element-muted'];
    if (vars['accent']) p.accent = vars['accent'];
    if (vars['accent-dark']) p.accentDark = vars['accent-dark'];
    else p.accentDark = p.accent;
    if (vars['title']) p.title = vars['title'];
    else p.title = p.accent;
    if (vars['danger']) p.danger = vars['danger'];
    if (vars['warning']) p.warning = vars['warning'];
    else if (vars['title']) p.warning = vars['title'];
    if (vars['success']) p.success = vars['success'];
  }

  return meta;
}

// ─── Кэш метаданных ───

let metaCache: Promise<ThemeMeta[]> | null = null;

async function loadAllMeta(): Promise<ThemeMeta[]> {
  const paths = Object.keys(modules);
  const metas: ThemeMeta[] = [];

  for (const path of paths) {
    const id = path.replace('../styles/themes/', '').replace('.css', '');
    try {
      const css = await modules[path]();
      metas.push(parseThemeHeader(css, id));
    } catch (e) {
      console.warn(`[theme] meta load failed: ${id}`, e);
      metas.push({
        id,
        name: id,
        description: 'Ошибка загрузки',
        light: false,
        preview: { ...DEFAULT_PREVIEW },
      });
    }
  }

  metas.sort((a, b) => a.name.localeCompare(b.name));
  return [BUILTIN_DEFAULT, ...metas];
}

export function loadThemeMeta(): Promise<ThemeMeta[]> {
  if (!metaCache) metaCache = loadAllMeta();
  return metaCache;
}

// ─── Применение темы ───

let injectedStyleEl: HTMLStyleElement | null = null;

function ensureStyleEl(): HTMLStyleElement {
  if (injectedStyleEl && document.head.contains(injectedStyleEl)) {
    return injectedStyleEl;
  }
  let el = document.getElementById('aspects-theme') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'aspects-theme';
    document.head.appendChild(el);
  }
  injectedStyleEl = el;
  return el;
}

export async function applyTheme(name: string): Promise<void> {
  const el = ensureStyleEl();

  if (name === DEFAULT_THEME) {
    el.textContent = '';
    return;
  }

  const path = `../styles/themes/${name}.css`;
  const loader = modules[path];
  if (!loader) {
    console.warn(`[theme] not found: ${name}`);
    el.textContent = '';
    return;
  }

  try {
    const css = await loader();
    el.textContent = css;
  } catch (e) {
    console.warn(`[theme] load failed: ${name}`, e);
    el.textContent = '';
  }
}