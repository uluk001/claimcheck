const STOPWORDS = new Set(
  (
    'a an and any are as at be been being by can could do does for from had has have he her his i if in into is it its ' +
    'me my no not of on or our she so such than that the their them then there these they this those to under up us ' +
    'was we were what when where which while who will with would you your yours am after before about over also only ' +
    'each every per other we\'ll it\'s'
  ).split(/\s+/),
);

export function normalizeSpace(text: string): string {
  return text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [])
    .map((t) => t.replace(/'s$/, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

export function splitSentences(text: string): string[] {
  return normalizeSpace(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '') + '…';
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90,
};

export function parseCount(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return NUMBER_WORDS[trimmed] ?? null;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
