import type { ClaimFacts } from './types';
import { normalizeSpace } from './text';
import { formatDate, parseDate, parseDateRange, parseMoney } from './values';

type Field =
  | 'policyNumber'
  | 'product'
  | 'insured'
  | 'period'
  | 'policyStart'
  | 'policyEnd'
  | 'dateOfLoss'
  | 'dateReported'
  | 'claimedAmount'
  | 'incident'
  | 'documents'
  | 'wording';

const LABELS: Array<[Field, RegExp]> = [
  ['policyNumber', /^(policy (number|no\.?|#)|policy id|certificate (number|no\.?))$/],
  ['product', /^(product|policy type|cover type|type of cover|line of business|insurance type)$/],
  ['insured', /^(insured|policyholder|policy holder|customer|client)$/],
  ['period', /^(policy period|period of insurance|cover period|insurance period|period of cover)$/],
  ['policyStart', /^(policy start|start date|inception( date)?|cover start|effective date)$/],
  ['policyEnd', /^(policy end|end date|expiry( date)?|expiration( date)?|cover end)$/],
  ['dateOfLoss', /^(date of loss|loss date|incident date|date of (the )?incident|accident date|date of accident|event date|date of event)$/],
  ['dateReported', /^(date reported|reported( on)?|notification date|date notified|claim reported|date of notification|reported to insurer)$/],
  ['claimedAmount', /^(claimed amount|claim amount|amount claimed|estimated loss|loss amount|amount|claim value|estimated damage)$/],
  ['incident', /^(incident|description|circumstances|what happened|loss description|incident description|details)$/],
  ['documents', /^(documents provided|documents|attached documents|documents attached|attachments|evidence provided)$/],
  ['wording', /^(policy wording|wording|policy terms|terms|wording page)$/],
];

function fieldFor(label: string): Field | null {
  const normalized = label.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [field, re] of LABELS) if (re.test(normalized)) return field;
  return null;
}

export interface ClaimSource {
  issueKey?: string;
  summary?: string;
  /** Plain text of the issue description. */
  description: string;
  /** Issue creation time, used when the claim has no explicit "Date reported". */
  created?: string;
  attachments?: string[];
}

export function splitList(value: string): string[] {
  return value
    .split(/[;,\n]|\s+•\s+/)
    .map((item) => item.replace(/^[-*•\s]+/, '').trim())
    .filter((item) => item.length > 1);
}

export function parseClaim(source: ClaimSource): ClaimFacts {
  const values: Partial<Record<Field, string>> = {};
  const unlabeled: string[] = [];
  let current: Field | null = null;

  for (const rawLine of source.description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      current = current === 'incident' || current === 'documents' ? current : null;
      continue;
    }
    const labeled = line.match(/^([A-Za-z][A-Za-z .#/()-]{1,40}?)\s*[:：]\s*(.*)$/);
    const field = labeled ? fieldFor(labeled[1]) : null;
    if (labeled && field) {
      values[field] = labeled[2].trim();
      current = field;
      continue;
    }
    if (current === 'incident') {
      values.incident = `${values.incident ?? ''} ${line}`.trim();
    } else if (current === 'documents' && /^[-*•]/.test(line)) {
      values.documents = `${values.documents ?? ''}; ${line}`;
    } else {
      current = null;
      unlabeled.push(line);
    }
  }

  const facts: ClaimFacts = { issueKey: source.issueKey, documentsProvided: [], missingFields: [] };
  if (values.policyNumber) facts.policyNumber = values.policyNumber;
  if (values.product) facts.product = values.product;
  if (values.insured) facts.insured = values.insured;

  const range = values.period ? parseDateRange(values.period) : null;
  const start = range?.start ?? (values.policyStart ? parseDate(values.policyStart) : null);
  const end = range?.end ?? (values.policyEnd ? parseDate(values.policyEnd) : null);
  if (start) facts.policyStart = formatDate(start);
  if (end) facts.policyEnd = formatDate(end);

  const loss = values.dateOfLoss ? parseDate(values.dateOfLoss) : null;
  if (loss) facts.dateOfLoss = formatDate(loss);
  const reported = values.dateReported ? parseDate(values.dateReported) : source.created ? parseDate(source.created) : null;
  if (reported) facts.dateReported = formatDate(reported);

  const amount = values.claimedAmount ? parseMoney(values.claimedAmount) : null;
  if (amount) facts.claimedAmount = amount;

  const incident = values.incident || unlabeled.join(' ');
  if (incident) facts.incident = normalizeSpace(incident);

  const documents = [...(values.documents ? splitList(values.documents) : []), ...(source.attachments ?? [])];
  facts.documentsProvided = [...new Set(documents)];
  if (values.wording) facts.policyWordingRef = values.wording;

  if (!facts.product && !facts.policyWordingRef) facts.missingFields.push('Product');
  if (!facts.dateOfLoss) facts.missingFields.push('Date of loss');
  if (!facts.claimedAmount) facts.missingFields.push('Claimed amount');
  if (!facts.incident) facts.missingFields.push('Incident');
  if (!facts.policyStart || !facts.policyEnd) facts.missingFields.push('Policy period');
  return facts;
}

/** Converts Atlassian Document Format to plain text with one line per paragraph or list item. */
export function adfToText(node: unknown): string {
  const lines: string[] = [];
  let line = '';
  let bullet = false;
  const push = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  const append = (text: string) => {
    if (bullet && !line) {
      line = '- ';
      bullet = false;
    }
    line += text;
  };
  const walk = (n: any, depth: number) => {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'text':
        append(n.text ?? '');
        return;
      case 'hardBreak':
        push();
        return;
      case 'mention':
        append(n.attrs?.text ?? '');
        return;
      case 'inlineCard':
        append(n.attrs?.url ?? '');
        return;
      case 'emoji':
        append(n.attrs?.text ?? '');
        return;
      default:
        break;
    }
    const isBlock = ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableCell', 'tableHeader', 'panel'].includes(n.type);
    if (isBlock) push();
    if (n.type === 'listItem') bullet = true;
    (n.content ?? []).forEach((child: unknown) => walk(child, depth + 1));
    if (isBlock) push();
  };
  walk(node, 0);
  push();
  return lines.join('\n');
}
