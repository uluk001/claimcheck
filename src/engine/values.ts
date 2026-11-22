export interface Money {
  amount: number;
  currency: string;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

/** Parses the first date found in the text. Supports ISO, dd.mm.yyyy, dd/mm/yyyy and written month formats. */
export function parseDate(text: string): Date | null {
  const iso = text.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dotted = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (dotted) return utcDate(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]));

  const dayFirst = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (dayFirst && MONTHS[dayFirst[2].toLowerCase()] !== undefined) {
    return utcDate(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
  }

  const monthFirst = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthFirst && MONTHS[monthFirst[1].toLowerCase()] !== undefined) {
    return utcDate(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
  }
  return null;
}

/** Parses "2026-03-01 to 2027-02-28" style ranges. */
export function parseDateRange(text: string): { start: Date; end: Date } | null {
  const parts = text.split(/\s+(?:to|until|till|through|-|–|—)\s+/i);
  if (parts.length < 2) return null;
  const start = parseDate(parts[0]);
  const end = parseDate(parts.slice(1).join(' '));
  return start && end ? { start, end } : null;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '₸': 'KZT', '₽': 'RUB' };
const CURRENCY_CODES = 'USD|EUR|GBP|KZT|KGS|RUB|UZS|TRY|AED';

function toNumber(raw: string): number {
  const compact = raw.replace(/[\s ,]/g, '');
  return Number(compact);
}

export interface MoneyMatch extends Money {
  index: number;
  text: string;
}

/** Finds every money amount with an explicit currency in the text. */
export function findMoney(text: string): MoneyMatch[] {
  const results: MoneyMatch[] = [];
  const number = '(\\d{1,3}(?:[,\\s\\u00a0]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
  const patterns: RegExp[] = [
    new RegExp(`(${CURRENCY_CODES})\\s?${number}`, 'g'),
    new RegExp(`${number}\\s?(${CURRENCY_CODES})\\b`, 'g'),
    new RegExp(`([$€£₸₽])\\s?${number}`, 'g'),
  ];
  patterns.forEach((pattern, kind) => {
    for (const m of text.matchAll(pattern)) {
      let amount: number;
      let currency: string;
      if (kind === 0) {
        currency = m[1];
        amount = toNumber(m[2]);
      } else if (kind === 1) {
        amount = toNumber(m[1]);
        currency = m[2];
      } else {
        currency = CURRENCY_SYMBOLS[m[1]];
        amount = toNumber(m[2]);
      }
      if (!Number.isFinite(amount)) continue;
      const index = m.index ?? 0;
      if (results.some((r) => Math.abs(r.index - index) < 3)) continue;
      results.push({ amount, currency, index, text: m[0].trim() });
    }
  });
  return results.sort((a, b) => a.index - b.index);
}

export function parseMoney(text: string): Money | null {
  const [first] = findMoney(text);
  return first ? { amount: first.amount, currency: first.currency } : null;
}

export function formatMoney(money: Money): string {
  const rounded = Math.round(money.amount * 100) / 100;
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${money.currency}`;
}
