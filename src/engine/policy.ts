import type { Clause, PolicyWording, SectionKind } from './types';
import { normalizeSpace } from './text';

interface Block {
  type: 'heading' | 'para' | 'li';
  level: number;
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', euro: '€', pound: '£',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Splits Confluence storage format (XHTML) into headings, paragraphs and list items. */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const stack: string[] = [];
  let buffer = '';

  const flush = (tag: string | undefined) => {
    const text = normalizeSpace(decodeEntities(buffer));
    buffer = '';
    if (!text || !tag) return;
    if (/^h[1-6]$/.test(tag)) {
      blocks.push({ type: 'heading', level: Number(tag[1]), text });
    } else if (tag === 'li' || (tag === 'p' && stack.includes('li'))) {
      blocks.push({ type: 'li', level: stack.filter((t) => t === 'li').length, text });
    } else {
      blocks.push({ type: 'para', level: 0, text });
    }
  };

  const tokenRe = /<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>|([^<]+)/g;
  for (const match of html.matchAll(tokenRe)) {
    const [, closing, rawTag, selfClosing, text] = match;
    if (text !== undefined) {
      buffer += text;
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (tag === 'br') {
      buffer += ' ';
      continue;
    }
    const isBlock = /^(h[1-6]|p|li|td|th|blockquote)$/.test(tag);
    const isList = tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'tr';
    if (!isBlock && !isList) continue;
    if (closing) {
      flush(stack[stack.length - 1]);
      const at = stack.lastIndexOf(tag);
      if (at >= 0) stack.splice(at, 1);
    } else if (!selfClosing) {
      flush(stack[stack.length - 1] ?? 'p');
      if (isBlock) stack.push(tag === 'td' || tag === 'th' || tag === 'blockquote' ? 'p' : tag);
      else stack.push(tag);
    }
  }
  flush(stack[stack.length - 1] ?? 'p');
  return blocks;
}

/** Splits Markdown-like plain text into blocks. Used for stored and built-in wordings. */
export function textToBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: normalizeSpace(heading[2]) });
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\([a-z]\)|[a-z]\))\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: 'li', level: 1, text: normalizeSpace(bullet[0].replace(/^[-*•]\s+/, '')) });
      continue;
    }
    blocks.push({ type: 'para', level: 0, text: normalizeSpace(line) });
  }
  return blocks;
}

export function classifySection(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/exclu|not covered|we do not cover|what is not|general exceptions/.test(h)) return 'exclusions';
  if (/waiting|qualifying period/.test(h)) return 'waiting';
  if (/document|evidence|what we need|proof/.test(h)) return 'documents';
  if (/notif|notice|report|making a claim|how to claim|claims? procedure|claims? process/.test(h)) return 'notification';
  if (/deductible|excess|franchise/.test(h) && !/limit|sum insured/.test(h)) return 'deductible';
  if (/limit|sum insured|maximum|deductible|excess/.test(h)) return 'limits';
  if (/cover|insured (events|risks|perils)|scope|what we (pay|insure)|benefit/.test(h)) return 'cover';
  return 'general';
}

function clauseKind(text: string, sectionKind: SectionKind): SectionKind {
  const t = text.toLowerCase();
  if (sectionKind === 'exclusions' || sectionKind === 'documents') return sectionKind;
  if (/waiting period|qualifying period/.test(t)) return 'waiting';
  if (/(notify|report|tell|inform|contact)\b[^.]*\bwithin\b/.test(t)) return 'notification';
  if (/\b(deductible|excess|franchise)\b/.test(t)) return 'deductible';
  if (/\b(sum insured|limit of indemnity|maximum (we|amount|payable)|we will pay up to|limit)\b/.test(t)) return 'limits';
  if (/\bwe (do not|don't|will not|won't) (cover|pay)\b/.test(t)) return 'exclusions';
  return sectionKind;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function blocksToWording(blocks: Block[], source: PolicyWording['source'], fallbackTitle: string): PolicyWording {
  const clauses: Clause[] = [];
  let title = '';
  let section = '';
  let sectionKind: SectionKind = 'general';
  let sectionNumber = '';
  let parentRef: string | null = null;
  let childIndex = 0;
  let autoIndex = 0;
  let globalIndex = 0;

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (!title && (block.level === 1 || clauses.length === 0) && classifySection(block.text) === 'general' && !/^\d/.test(block.text)) {
        title = block.text;
        continue;
      }
      section = block.text.replace(/^\d+[.)]?\s+/, '');
      sectionKind = classifySection(block.text);
      sectionNumber = block.text.match(/^(\d+)[.)]?\s/)?.[1] ?? '';
      parentRef = null;
      childIndex = 0;
      autoIndex = 0;
      continue;
    }

    let ref: string;
    let body = block.text;
    const numbered = body.match(/^(\d+(?:\.\d+)+)\.?\s+([\s\S]+)$/);
    if (numbered) {
      ref = numbered[1];
      body = numbered[2];
      parentRef = body.trim().endsWith(':') ? ref : null;
      childIndex = 0;
      const segments = ref.split('.');
      if (segments.length === 2 && segments[0] === sectionNumber) autoIndex = Math.max(autoIndex, Number(segments[1]));
    } else if (block.type === 'li' && parentRef) {
      const marker = body.match(/^\(?([a-z])\)\s+([\s\S]+)$/);
      if (marker) {
        ref = `${parentRef}(${marker[1]})`;
        body = marker[2];
        childIndex = LETTERS.indexOf(marker[1]) + 1;
      } else {
        ref = `${parentRef}(${LETTERS[childIndex % 26]})`;
        childIndex += 1;
      }
    } else {
      autoIndex += 1;
      globalIndex += 1;
      ref = sectionNumber ? `${sectionNumber}.${autoIndex}` : `¶${globalIndex}`;
      parentRef = body.trim().endsWith(':') ? ref : null;
      childIndex = 0;
    }

    body = body.trim();
    if (body.length < 3) continue;
    clauses.push({ ref, text: body, section: section || 'General', kind: clauseKind(body, sectionKind) });
  }

  return { title: title || fallbackTitle, clauses, source };
}

export function parsePolicyHtml(html: string, source: PolicyWording['source'], fallbackTitle = 'Policy wording'): PolicyWording {
  return blocksToWording(htmlToBlocks(html), source, fallbackTitle);
}

export function parsePolicyText(text: string, source: PolicyWording['source'], fallbackTitle = 'Policy wording'): PolicyWording {
  return blocksToWording(textToBlocks(text), source, fallbackTitle);
}

/** Converts Markdown-like wording into Confluence storage format, used when the demo installer creates pages. */
export function textToStorage(text: string): string {
  const out: string[] = [];
  let inList = false;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const block of textToBlocks(text)) {
    if (block.type !== 'li' && inList) {
      out.push('</ul>');
      inList = false;
    }
    if (block.type === 'heading') {
      if (block.level === 1) continue;
      out.push(`<h${block.level}>${esc(block.text)}</h${block.level}>`);
    } else if (block.type === 'li') {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li><p>${esc(block.text)}</p></li>`);
    } else {
      out.push(`<p>${esc(block.text)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

export function clausesOfKind(wording: PolicyWording, ...kinds: SectionKind[]): Clause[] {
  return wording.clauses.filter((c) => kinds.includes(c.kind));
}
