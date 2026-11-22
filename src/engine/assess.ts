import type { Assessment, Check, ClaimFacts, Clause, PolicyWording, Verdict } from './types';
import { clausesOfKind } from './policy';
import { escapeRegExp, parseCount, splitSentences, tokenSet, tokens, truncate } from './text';
import { daysBetween, findMoney, formatMoney, parseDate, type Money } from './values';

interface Concept {
  id: string;
  label: string;
  /** Words in the incident description that point at this concept. */
  incident: RegExp;
  /** Words in an exclusion clause that cover this concept. */
  clause: RegExp;
  /** Strong concepts usually void cover on their own; weak ones need a closer look. */
  strong: boolean;
  /** The trigger already contains a negation (e.g. "without a licence"), so negation checks are skipped. */
  negationInTrigger?: boolean;
}

export const CONCEPTS: Concept[] = [
  {
    id: 'alcohol',
    label: 'alcohol or drugs',
    incident: /\b(alcohol\w*|drunk|intoxicat\w*|beers?|wine|vodka|drinks?|drinking|drank|under the influence|breathaly[sz]\w*|narcotics?|drugs?)\b/i,
    clause: /alcohol|intoxicat|under the influence|narcotic|drug/i,
    strong: true,
  },
  {
    id: 'licence',
    label: 'driving without a valid licence',
    incident: /\b(no|without( a)?|expired|suspended|revoked|invalid)\s+(valid\s+)?(driving\s+|driver'?s?\s+)?licen[cs]e\b|\bunlicen[cs]ed\b|\blearner driver\b/i,
    clause: /licen[cs]e/i,
    strong: true,
    negationInTrigger: true,
  },
  {
    id: 'commercial',
    label: 'commercial use (taxi, ride-hailing, delivery)',
    incident: /\b(taxi|ride[- ]?hailing|uber|yandex|bolt|indrive|courier|delivery (job|work|shift|order|app)|for hire|paying passengers?|fare)\b/i,
    clause: /taxi|hire|reward|ride[- ]?hailing|commercial|courier|delivery/i,
    strong: true,
  },
  {
    id: 'racing',
    label: 'racing or speed events',
    incident: /\b(rac(e|ing)|track day|rally|speed test|drift(ing)?)\b/i,
    clause: /\brac(e|ing)|rally|speed (test|trial)|competition/i,
    strong: true,
  },
  {
    id: 'intentional',
    label: 'deliberate damage',
    incident: /\b(deliberate(ly)?|intentional(ly)?|on purpose|staged|set fire to)\b/i,
    clause: /deliberate|intentional|wil?ful|fraud/i,
    strong: true,
  },
  {
    id: 'wear',
    label: 'wear and tear or breakdown',
    incident: /\b(wear and tear|worn|corrosion|rust(ed|y)?|gradual(ly)?|deteriorat\w*|(mechanical|electrical) (failure|fault|breakdown)|engine (failure|seized|broke( down)?)|broke down|breakdown|old age)\b/i,
    clause: /wear|tear|breakdown|corrosion|rust|gradual|deteriorat|mechanical|electrical/i,
    strong: false,
  },
  {
    id: 'unattended-vehicle',
    label: 'vehicle left unlocked or with keys inside',
    incident: /\b(keys? (were |was )?(left )?(in|inside) the (car|vehicle|ignition)|left (the )?(car|vehicle) (unlocked|running|open)|unlocked|engine running)\b/i,
    clause: /unlocked|keys?\b|unattended|engine running|running/i,
    strong: false,
  },
  {
    id: 'flood',
    label: 'flood or water entry',
    incident: /\b(flood(ed|ing|water)?|water (entered|ingress)|submerged|drove (into|through) (deep )?water)\b/i,
    clause: /flood|water/i,
    strong: false,
  },
  {
    id: 'unrest',
    label: 'war, riot or civil commotion',
    incident: /\b(war|riots?|civil commotion|terror\w*|protests?|unrest)\b/i,
    clause: /\bwar\b|riot|terror|commotion|unrest/i,
    strong: false,
  },
  {
    id: 'pre-existing',
    label: 'pre-existing medical condition',
    incident: /\b(pre-?existing|chronic|already (had|diagnosed)|known condition|ongoing treatment|diagnosed (last|in) )\b/i,
    clause: /pre-?existing|known (medical )?condition|chronic/i,
    strong: false,
  },
  {
    id: 'unattended-belongings',
    label: 'belongings left unattended',
    incident: /\b(unattended|left (my |the |our )?(bag|backpack|luggage|suitcase|phone|laptop|camera|belongings|wallet)( \w+){0,4} (on|at|in|outside))\b/i,
    clause: /unattended/i,
    strong: false,
  },
  {
    id: 'hazardous-sport',
    label: 'hazardous or winter sports',
    incident: /\b(off[- ]piste|skydiv\w*|bungee|paraglid\w*|scuba|mountaineering|heli-?skiing|motocross)\b/i,
    clause: /hazardous|extreme|winter sports|off[- ]piste|professional sport|dangerous activit/i,
    strong: false,
  },
  {
    id: 'seismic',
    label: 'earthquake or landslide',
    incident: /\b(earthquake|landslide|mudflow|tremor)\b/i,
    clause: /earthquake|seismic|landslide|mudflow/i,
    strong: false,
  },
  {
    id: 'gradual-water',
    label: 'gradual leak, seepage or mould',
    incident: /\b(leak(ed|ing)? for (weeks|months)|slow leak|gradual leak|seepage|mou?ld|damp(ness)?)\b/i,
    clause: /gradual|seepage|mou?ld|damp|maintenance/i,
    strong: false,
  },
  {
    id: 'vacancy',
    label: 'unoccupied property',
    incident: /\b(vacant|unoccupied|empty for|nobody (was )?living|no one (was )?living)\b/i,
    clause: /unoccupied|vacant/i,
    strong: false,
  },
];

interface Peril {
  id: string;
  incident: RegExp;
  clause: RegExp;
}

/** Insured perils, used to match an incident to cover clauses and to peril-specific limits. */
export const PERILS: Peril[] = [
  { id: 'collision', incident: /\b(hit|crash\w*|collid\w*|collision|rear-ended|impact|ran into|lost control|accident|struck|bumped)\b/i, clause: /collision|impact|overturn|accident/i },
  { id: 'theft', incident: /\b(stole|stolen|theft|robbed|robbery|burglar\w*|break-in|broke into|pickpocket\w*|snatched)\b/i, clause: /theft|stolen|burglary|robbery/i },
  { id: 'fire', incident: /\b(fire|burn\w*|smoke|explosion|lightning)\b/i, clause: /fire|smoke|explosion|lightning/i },
  { id: 'water', incident: /\b(leak\w*|pipes?|hose|burst|flood\w*|water)\b/i, clause: /water|leak|pipes?\b/i },
  { id: 'storm', incident: /\b(storm|hail(storm|stones?)?|wind(storm)?|snow|gale)\b/i, clause: /\b(storms?|hail|snow|wind)\b/i },
  { id: 'glass', incident: /\b(windscreen|windshield|glass|window)\b/i, clause: /windscreen|glass|window/i },
  { id: 'vandalism', incident: /\b(vandal\w*|scratched|keyed|graffiti|smashed)\b/i, clause: /vandal|malicious/i },
  { id: 'medical', incident: /\b(hospital\w*|clinic|doctor|injur\w*|ill|illness|sick|treatment|fracture\w*|ambulance)\b/i, clause: /medical|treatment|illness|injury|hospital/i },
  { id: 'delay', incident: /\b(delay\w*|cancel\w*|missed (my |the )?(flight|connection))\b/i, clause: /delay|cancel/i },
  { id: 'belongings', incident: /\b(phones?|laptops?|camera|bags?|luggage|baggage|suitcases?|wallet|belongings|watch|tablet|jewel\w*)\b/i, clause: /belongings|baggage|luggage|personal (items|effects|possessions)/i },
];

export function incidentPerils(incident: string): Peril[] {
  return PERILS.filter((p) => p.incident.test(incident));
}

const NEGATION = /\b(not|no|never|without|denies|denied|n't|none)\b/i;
const GENERIC_TERMS = new Set(
  tokens(
    'damage damaged vehicle car insured insurer cover covered loss claim claims policy property caused cause result resulting due ' +
    'person people use used period date day days time event events following including include whether occur occurred ' +
    'driver driven drive driving amount pay paid payable',
  ),
);

function sentenceContaining(text: string, index: number): string {
  const sentences = splitSentences(text);
  let offset = 0;
  for (const sentence of sentences) {
    const at = text.indexOf(sentence, offset);
    if (at <= index && index < at + sentence.length) return sentence;
    offset = at >= 0 ? at + sentence.length : offset;
  }
  return text;
}

function isNegated(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 40), index);
  const words = before.split(/\s+/).slice(-4).join(' ');
  return NEGATION.test(words);
}

function quote(clause: Clause, max = 260): { ref: string; quote: string } {
  return { ref: clause.ref, quote: truncate(clause.text, max) };
}

function significant(text: string): Set<string> {
  return new Set([...tokenSet(text)].filter((t) => !GENERIC_TERMS.has(t)));
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((t) => b.has(t));
}

function checkPolicyPeriod(facts: ClaimFacts): Check {
  if (!facts.dateOfLoss) {
    return { id: 'period', title: 'Policy period', status: 'info', detail: 'The claim has no date of loss, so the policy period cannot be checked.' };
  }
  if (!facts.policyStart || !facts.policyEnd) {
    return {
      id: 'period',
      title: 'Policy period',
      status: 'review',
      detail: 'The claim does not state the policy period. Confirm the policy was in force on the date of loss.',
    };
  }
  const loss = parseDate(facts.dateOfLoss)!;
  const start = parseDate(facts.policyStart)!;
  const end = parseDate(facts.policyEnd)!;
  if (loss < start || loss > end) {
    return {
      id: 'period',
      title: 'Policy period',
      status: 'risk',
      detail: `The loss on ${facts.dateOfLoss} is outside the policy period ${facts.policyStart} to ${facts.policyEnd}.`,
    };
  }
  return {
    id: 'period',
    title: 'Policy period',
    status: 'pass',
    detail: `The loss on ${facts.dateOfLoss} falls inside the policy period ${facts.policyStart} to ${facts.policyEnd}.`,
  };
}

const PERIOD_RE = /\bwithin\s+(\d+|[a-z]+)(?:\s*\((\d+)\))?\s+(calendar\s+|working\s+|business\s+)?(days?|hours?)\b/i;

const MEDICAL_INCIDENT = /hospital|clinic|doctor|treatment|injur|admitted|medical|ambulance|surgery|fracture/i;

export function findNotificationLimit(
  wording: PolicyWording,
  incident = '',
): { clause: Clause; days: number; label: string; anchor: 'loss' | 'return' } | null {
  const candidates = [...clausesOfKind(wording, 'notification'), ...wording.clauses.filter((c) => c.kind !== 'notification')];
  for (const clause of candidates) {
    if (!/(notify|report|tell|inform|contact|notice)/i.test(clause.text)) continue;
    // Police reporting deadlines are not deadlines for telling the insurer.
    if (/police/i.test(clause.text)) continue;
    // Medical-only deadlines apply only when the incident involves treatment.
    if (/hospital|admission|medical|treatment/i.test(clause.text) && !MEDICAL_INCIDENT.test(incident)) continue;
    const m = clause.text.match(PERIOD_RE);
    if (!m) continue;
    const count = parseCount(m[2] ?? m[1]);
    if (count === null) continue;
    const unit = m[4].toLowerCase();
    const working = /working|business/i.test(m[3] ?? '');
    const days = unit.startsWith('hour') ? count / 24 : working ? Math.ceil((count * 7) / 5) : count;
    const label = `${count} ${working ? 'working ' : ''}${unit.startsWith('hour') ? (count === 1 ? 'hour' : 'hours') : count === 1 ? 'day' : 'days'}`;
    const anchor = /\breturn/i.test(clause.text.slice(m.index ?? 0)) ? 'return' : 'loss';
    return { clause, days, label, anchor };
  }
  return null;
}

function checkNotification(facts: ClaimFacts, wording: PolicyWording): Check | null {
  const limit = findNotificationLimit(wording, facts.incident ?? '');
  if (!limit) return null;
  if (!facts.dateOfLoss || !facts.dateReported) {
    return {
      id: 'notification',
      title: 'Notification deadline',
      status: 'info',
      detail: `The policy asks for notification within ${limit.label}, but the claim dates are incomplete.`,
      clause: quote(limit.clause),
    };
  }
  const delay = daysBetween(parseDate(facts.dateOfLoss)!, parseDate(facts.dateReported)!);
  if (delay < 0) {
    return {
      id: 'notification',
      title: 'Notification deadline',
      status: 'review',
      detail: `The reported date (${facts.dateReported}) is before the date of loss (${facts.dateOfLoss}). Check the dates.`,
      clause: quote(limit.clause),
    };
  }
  const late = delay > limit.days;
  if (late && limit.anchor === 'return') {
    return {
      id: 'notification',
      title: 'Notification deadline',
      status: 'review',
      detail: `Reported ${delay} days after the loss. The ${limit.label} deadline counts from the return home, so confirm the return date.`,
      clause: quote(limit.clause),
    };
  }
  return {
    id: 'notification',
    title: 'Notification deadline',
    status: late ? 'risk' : 'pass',
    detail: late
      ? `Reported ${delay} days after the loss; the policy asks for notification within ${limit.label}. Check whether the wording allows the claim to be declined or only reduced for late notice, and record the reason for the delay.`
      : `Reported ${delay} ${delay === 1 ? 'day' : 'days'} after the loss, within the ${limit.label} the policy allows.`,
    clause: quote(limit.clause),
  };
}

function checkWaitingPeriod(facts: ClaimFacts, wording: PolicyWording): Check | null {
  const re = /\b(?:waiting period|qualifying period|first)\s+(?:of\s+)?(\d+|[a-z]+)\s+days\b|\bwithin\s+(\d+|[a-z]+)\s+days\s+(?:of|from|after)\s+(?:the\s+)?(?:policy\s+)?(?:start|inception|purchase|commencement)/i;
  for (const clause of wording.clauses) {
    if (clause.kind !== 'waiting' && !/waiting period|qualifying period/i.test(clause.text)) continue;
    const m = clause.text.match(re);
    if (!m) continue;
    const days = parseCount(m[1] ?? m[2]);
    if (days === null) continue;
    // "for storm, flood and escape of water claims": the waiting period only applies to those perils.
    const perils = clause.text.match(/\bfor ([^.]+?) claims\b/i);
    if (perils) {
      const perilTokens = significant(perils[1].replace(/\bescape\b/gi, ' '));
      const incidentTokens = significant(facts.incident ?? '');
      if (/leak|pipe|hose|burst|radiator|tank/i.test(facts.incident ?? '')) incidentTokens.add('water');
      if (/wind|hail|gale|hurricane/i.test(facts.incident ?? '')) incidentTokens.add('storm');
      if (overlap(perilTokens, incidentTokens).length === 0) continue;
    }
    if (!facts.policyStart || !facts.dateOfLoss) {
      return {
        id: 'waiting',
        title: 'Waiting period',
        status: 'info',
        detail: `The policy has a ${days}-day waiting period, but the policy start or loss date is missing.`,
        clause: quote(clause),
      };
    }
    const sinceStart = daysBetween(parseDate(facts.policyStart)!, parseDate(facts.dateOfLoss)!);
    const inside = sinceStart >= 0 && sinceStart < days;
    return {
      id: 'waiting',
      title: 'Waiting period',
      status: inside ? 'risk' : 'pass',
      detail: inside
        ? `The loss happened ${sinceStart} days after the policy started, inside the ${days}-day waiting period.`
        : `The loss happened ${sinceStart} days after the policy started, after the ${days}-day waiting period.`,
      clause: quote(clause),
    };
  }
  return null;
}

function moneyIn(clause: Clause): Money | null {
  const [first] = findMoney(clause.text);
  return first ? { amount: first.amount, currency: first.currency } : null;
}

const LIMIT_GENERIC = /sum insured|per (claim|event|occurrence|policy period|period of insurance)|any one (claim|event)|in total|aggregate|maximum (we|amount)|limit of indemnity|we will pay up to/i;

export function findDeductible(wording: PolicyWording, claimed?: Money, incident = ''): { clause: Clause; money: Money; waived?: boolean } | null {
  const perils = incidentPerils(incident);
  for (const clause of clausesOfKind(wording, 'deductible', 'limits')) {
    if (!/deductible|excess|franchise/i.test(clause.text)) continue;
    const except = clause.text.match(/\bexcept (?:for )?([^.]+?)(?: claims)?[.]?$/i);
    if (except && perils.some((p) => p.clause.test(except[1]))) {
      const money = moneyIn(clause);
      if (money) return { clause, money: { amount: 0, currency: money.currency }, waived: true };
    }
    const money = moneyIn(clause);
    const pct = clause.text.match(/(\d+(?:\.\d+)?)\s?%/);
    if (money && pct && claimed && /higher|greater/i.test(clause.text)) {
      const fromPct = (claimed.amount * Number(pct[1])) / 100;
      return { clause, money: { amount: Math.max(money.amount, fromPct), currency: money.currency } };
    }
    if (money) return { clause, money };
    if (pct && claimed) return { clause, money: { amount: (claimed.amount * Number(pct[1])) / 100, currency: claimed.currency } };
  }
  return null;
}

export function findLimit(
  wording: PolicyWording,
  incident: string,
): { clause: Clause; money: Money; specific: boolean; itemLimit?: Money } | null {
  const incidentTokens = significant(incident);
  const perils = incidentPerils(incident);
  let generic: { clause: Clause; money: Money } | null = null;
  let specific: { clause: Clause; money: Money; score: number } | null = null;
  for (const clause of clausesOfKind(wording, 'limits', 'cover')) {
    if (/deductible|excess|franchise/i.test(clause.text) && !/limit|sum insured|maximum/i.test(clause.text)) continue;
    const money = moneyIn(clause);
    if (!money) continue;
    if (!/limit|sum insured|maximum|up to|we pay|we will pay/i.test(clause.text)) continue;
    if (/sum insured/i.test(clause.text)) {
      if (!generic) generic = { clause, money };
      continue;
    }
    const clauseTokens = significant(clause.text.replace(LIMIT_GENERIC, ' '));
    const shared = overlap(clauseTokens, incidentTokens).filter((t) => !['limit', 'maximum', 'insur', 'sum'].includes(t));
    const perilHits = perils.filter((p) => p.clause.test(clause.text)).length;
    const score = perilHits * 3 + shared.length;
    if (score > 0 && (!specific || score > specific.score)) specific = { clause, money, score };
    else if (score === 0 && LIMIT_GENERIC.test(clause.text) && !generic && !/medical|belongings|glass|windscreen|delay|contents|water/i.test(clause.text)) {
      generic = { clause, money };
    }
  }
  const pick = specific ? { clause: specific.clause, money: specific.money, specific: true } : generic ? { ...generic, specific: false } : null;
  if (!pick) return null;
  const item = pick.clause.text.match(/single (item|article) limit (?:of )?([^.,;]+)/i);
  const itemMoney = item ? findMoney(item[2])[0] : undefined;
  return itemMoney ? { ...pick, itemLimit: { amount: itemMoney.amount, currency: itemMoney.currency } } : pick;
}

function checkAmount(facts: ClaimFacts, wording: PolicyWording): { check: Check | null; estimate?: Assessment['estimate'] } {
  if (!facts.claimedAmount) return { check: null };
  const claimed = facts.claimedAmount;
  const limit = findLimit(wording, facts.incident ?? '');
  const deductible = findDeductible(wording, claimed, facts.incident ?? '');
  const currencies = [limit?.money.currency, deductible?.money.currency].filter(Boolean);
  if (currencies.some((c) => c !== claimed.currency)) {
    return {
      check: {
        id: 'amount',
        title: 'Limit and deductible',
        status: 'review',
        detail: `The claim is in ${claimed.currency} but the policy amounts are in ${currencies.join('/')}. Convert before settling.`,
        clause: limit ? quote(limit.clause) : deductible ? quote(deductible.clause) : undefined,
      },
    };
  }
  const itemCap = limit?.itemLimit && limit.itemLimit.currency === claimed.currency ? limit.itemLimit.amount : Infinity;
  const capped = Math.min(claimed.amount, limit ? limit.money.amount : Infinity, itemCap);
  const payable = Math.max(0, capped - (deductible?.money.amount ?? 0));
  const estimate: Assessment['estimate'] = {
    claimed,
    deductible: deductible?.money,
    limit: limit?.money,
    payable: { amount: payable, currency: claimed.currency },
    note: 'Indicative only: before loss adjustment, depreciation and any other policy conditions.',
  };
  const overLimit = limit && (claimed.amount > limit.money.amount || claimed.amount > itemCap);
  const parts: string[] = [`Claimed ${formatMoney(claimed)}.`];
  if (limit) parts.push(`${limit.specific ? 'Applicable sub-limit' : 'Limit'} ${formatMoney(limit.money)} (clause ${limit.clause.ref}).`);
  if (limit?.itemLimit && claimed.amount > itemCap) parts.push(`Single item limit ${formatMoney(limit.itemLimit)} applies if the claim is for one item.`);
  if (deductible?.waived) parts.push(`No deductible for this type of claim (clause ${deductible.clause.ref}).`);
  else if (deductible) parts.push(`Deductible ${formatMoney(deductible.money)} (clause ${deductible.clause.ref}).`);
  parts.push(`Indicative payable ${formatMoney(estimate.payable)}.`);
  if (!limit && !deductible) parts.push('No limit or deductible was found in the wording.');
  return {
    check: {
      id: 'amount',
      title: 'Limit and deductible',
      status: overLimit ? 'review' : limit || deductible ? 'pass' : 'info',
      detail: overLimit
        ? `The claimed amount is above the ${limit && claimed.amount > limit.money.amount ? 'limit' : 'single item limit'}. ${parts.join(' ')}`
        : parts.join(' '),
      clause: limit ? quote(limit.clause) : deductible ? quote(deductible.clause) : undefined,
    },
    estimate,
  };
}

export function matchExclusions(facts: ClaimFacts, wording: PolicyWording): Check[] {
  const incident = facts.incident ?? '';
  if (!incident) return [];
  const checks: Check[] = [];
  const incidentTokens = significant(incident);

  // Each concept is attributed to the exclusion that describes it most specifically.
  const owner = new Map<string, string>();
  for (const concept of CONCEPTS) {
    let bestRef = '';
    let bestHits = 0;
    for (const clause of clausesOfKind(wording, 'exclusions')) {
      const hits = new Set((clause.text.match(new RegExp(concept.clause.source, 'gi')) ?? []).map((h) => h.toLowerCase())).size;
      if (hits > bestHits) {
        bestHits = hits;
        bestRef = clause.ref;
      }
    }
    if (bestRef) owner.set(concept.id, bestRef);
  }

  for (const clause of clausesOfKind(wording, 'exclusions')) {
    let best: Check | null = null;
    for (const concept of CONCEPTS) {
      if (owner.get(concept.id) !== clause.ref) continue;
      const m = incident.match(concept.incident);
      if (!m || m.index === undefined) continue;
      const negated = !concept.negationInTrigger && isNegated(incident, m.index);
      const evidence = sentenceContaining(incident, m.index);
      const status = negated ? 'review' : concept.strong ? 'risk' : 'review';
      const detail = negated
        ? `The incident mentions ${concept.label}, but with a negation ("${m[0]}"). Confirm the facts before relying on this exclusion.`
        : `The incident mentions ${concept.label} ("${m[0]}"), which this exclusion covers.`;
      const candidate: Check = { id: `exclusion-${clause.ref}`, title: `Exclusion ${clause.ref}`, status, detail, clause: quote(clause), evidence };
      if (!best || (best.status !== 'risk' && status === 'risk')) best = candidate;
    }
    if (!best) {
      const shared = overlap(significant(clause.text), incidentTokens).filter((t) => t.length > 3);
      if (shared.length >= 2) {
        const word = shared[0];
        const hit = incident.search(new RegExp(`\\b${escapeRegExp(word)}`, 'i'));
        best = {
          id: `exclusion-${clause.ref}`,
          title: `Exclusion ${clause.ref}`,
          status: 'review',
          detail: `The incident and this exclusion share key terms (${shared.slice(0, 4).join(', ')}). Check whether it applies.`,
          clause: quote(clause),
          evidence: hit >= 0 ? sentenceContaining(incident, hit) : undefined,
        };
      }
    }
    if (best) checks.push(best);
  }
  return checks;
}

function checkCover(facts: ClaimFacts, wording: PolicyWording): Check | null {
  const incident = facts.incident ?? '';
  const cover = clausesOfKind(wording, 'cover');
  if (!incident || cover.length === 0) return null;
  const incidentTokens = significant(incident);
  const perils = incidentPerils(incident);
  let best: { clause: Clause; shared: string[]; perils: string[]; score: number } | null = null;
  for (const clause of cover) {
    if (moneyIn(clause) && /limit|up to|maximum/i.test(clause.text)) continue;
    const shared = overlap(significant(clause.text), incidentTokens);
    const matched = perils.filter((p) => p.clause.test(clause.text)).map((p) => p.id);
    const score = matched.length * 3 + shared.length;
    if (!best || score > best.score) best = { clause, shared, perils: matched, score };
  }
  if (!best || best.score === 0) {
    return {
      id: 'cover',
      title: 'Insured event',
      status: 'review',
      detail: 'No cover clause clearly matches the incident description. Confirm the loss is an insured event.',
    };
  }
  const why = best.perils.length ? `insured peril: ${best.perils.join(', ')}` : `shared terms: ${best.shared.slice(0, 4).join(', ')}`;
  return {
    id: 'cover',
    title: 'Insured event',
    status: 'pass',
    detail: `The incident matches cover clause ${best.clause.ref} (${why}).`,
    clause: quote(best.clause),
  };
}

const DOC_SYNONYMS: Record<string, string> = {
  licence: 'license', photograph: 'photo', picture: 'photo', image: 'photo', pic: 'photo', jpg: 'photo', jpeg: 'photo', png: 'photo',
  invoice: 'receipt', bill: 'receipt', quotation: 'estimate', quote: 'estimate', passport: 'id', identity: 'id',
  statement: 'report', certificate: 'certificate', registration: 'registration', techpassport: 'registration',
  medical: 'medical', hospital: 'medical', doctor: 'medical', boarding: 'boarding', ticket: 'ticket', tickets: 'ticket',
};
const DOC_GENERIC = new Set(tokens('copy copies completed original document documents signed valid full all any proof our your evidence the of from for driver driving vehicle insured customer damage damaged'));

function docTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of tokens(text.replace(/[_.]/g, ' '))) {
    const t = DOC_SYNONYMS[raw] ?? raw;
    if (!DOC_GENERIC.has(t)) out.add(t);
  }
  return out;
}

function conditionApplies(condition: string, facts: ClaimFacts): boolean | null {
  const c = condition.toLowerCase();
  const incident = (facts.incident ?? '').toLowerCase();
  const results: boolean[] = [];
  const money = findMoney(condition)[0];
  if (money && /(above|over|exceed|more than|greater than)/.test(c) && facts.claimedAmount) {
    results.push(facts.claimedAmount.currency === money.currency ? facts.claimedAmount.amount > money.amount : true);
  }
  if (/theft|stolen|burglary|robbery/.test(c)) results.push(/theft|stolen|stole|burglar|robbed|robbery|break-in|broke into/.test(incident));
  if (/third part|other (vehicle|driver|party)|another (vehicle|driver)|collision with/.test(c)) {
    results.push(/third party|other (car|vehicle|driver)|another (car|vehicle|driver)|collided|hit by|rear-ended|crashed into/.test(incident));
  }
  if (/medical|injur|hospital|treatment/.test(c)) results.push(/hospital|doctor|clinic|injur|treatment|medical|fracture/.test(incident));
  if (/fire/.test(c)) results.push(/fire|burn|smoke/.test(incident));
  if (/water|flood|leak/.test(c)) results.push(/water|flood|leak/.test(incident));
  if (/delay|cancel/.test(c)) results.push(/delay|cancel/.test(incident));
  if (results.length === 0) return null;
  return results.some(Boolean);
}

export interface RequiredDocument {
  name: string;
  ref: string;
  condition?: string;
  required: boolean | null;
  provided: boolean;
}

export function requiredDocuments(facts: ClaimFacts, wording: PolicyWording): RequiredDocument[] {
  const docClauses = clausesOfKind(wording, 'documents');
  const items: Array<{ text: string; ref: string }> = [];
  for (const clause of docClauses) {
    const hasChildren = docClauses.some((c) => c.ref.startsWith(`${clause.ref}(`));
    if (hasChildren) continue;
    if (clause.text.includes(':') && !clause.ref.includes('(')) {
      const list = clause.text.slice(clause.text.indexOf(':') + 1);
      list
        .split(/;\s*|,\s+(?![^()]*\))/)
        .map((s) => s.replace(/^\s*(and|or)\s+/i, '').replace(/[.;]\s*$/, '').trim())
        .filter((s) => s.length > 2)
        .forEach((text) => items.push({ text, ref: clause.ref }));
    } else {
      items.push({ text: clause.text.replace(/[.;]\s*$/, ''), ref: clause.ref });
    }
  }

  const provided = facts.documentsProvided.map((d) => docTokens(d));
  return items.map(({ text, ref }) => {
    const cond = text.match(/\((?:only\s+)?(?:for|if|where|when)\s+([^)]+)\)|\b(?:if|where|when)\s+(.+)$/i);
    const condition = cond ? (cond[1] ?? cond[2]).trim() : undefined;
    const name = cond ? text.replace(cond[0], '').trim().replace(/[,;]$/, '') : text;
    const required = condition ? conditionApplies(condition, facts) : true;
    const keys = docTokens(name);
    const need = Math.max(1, Math.ceil(keys.size * 0.5));
    const isProvided = keys.size > 0 && provided.some((p) => [...keys].filter((k) => p.has(k)).length >= need);
    return { name, ref, condition, required, provided: isProvided };
  });
}

function checkDocuments(facts: ClaimFacts, wording: PolicyWording): { check: Check | null; missing: string[] } {
  const docs = requiredDocuments(facts, wording);
  if (docs.length === 0) return { check: null, missing: [] };
  const missing = docs.filter((d) => d.required === true && !d.provided).map((d) => d.name);
  const unclear = docs.filter((d) => d.required === null && !d.provided).map((d) => `${d.name} (if ${d.condition})`);
  const firstRef = docs[0].ref.replace(/\(.*$/, '');
  const clause = wording.clauses.find((c) => c.ref === firstRef) ?? wording.clauses.find((c) => c.ref === docs[0].ref);
  const providedCount = docs.filter((d) => d.provided).length;
  let detail = `${providedCount} of ${docs.length} listed documents provided.`;
  if (missing.length) detail += ` Missing: ${missing.join('; ')}.`;
  if (unclear.length) detail += ` May also be needed: ${unclear.join('; ')}.`;
  return {
    check: {
      id: 'documents',
      title: 'Required documents',
      status: missing.length ? 'review' : unclear.length ? 'info' : 'pass',
      detail,
      clause: clause ? quote(clause) : undefined,
    },
    missing,
  };
}

const VERDICT_LABELS: Record<Verdict, string> = {
  clear: 'Clear to proceed',
  review: 'Needs review',
  risk: 'Coverage at risk',
  incomplete: 'Incomplete claim data',
};

export function assessClaim(facts: ClaimFacts, wording: PolicyWording, now: Date = new Date()): Assessment {
  const checks: Check[] = [];
  const push = (check: Check | null) => {
    if (check) checks.push(check);
  };

  push(checkPolicyPeriod(facts));
  push(checkWaitingPeriod(facts, wording));
  push(checkNotification(facts, wording));
  push(checkCover(facts, wording));
  const exclusionChecks = matchExclusions(facts, wording);
  checks.push(...exclusionChecks);
  const amount = checkAmount(facts, wording);
  push(amount.check);
  const docs = checkDocuments(facts, wording);
  push(docs.check);

  if (exclusionChecks.length === 0 && facts.incident && clausesOfKind(wording, 'exclusions').length > 0) {
    checks.push({
      id: 'exclusions',
      title: 'Exclusions',
      status: 'pass',
      detail: `None of the ${clausesOfKind(wording, 'exclusions').length} exclusions matched the incident description.`,
    });
  }

  const blocking = facts.missingFields.filter((f) => f === 'Date of loss' || f === 'Incident');
  let verdict: Verdict;
  if (blocking.length) verdict = 'incomplete';
  else if (checks.some((c) => c.status === 'risk')) verdict = 'risk';
  else if (checks.some((c) => c.status === 'review') || docs.missing.length) verdict = 'review';
  else verdict = 'clear';

  const risks = checks.filter((c) => c.status === 'risk').length;
  const reviews = checks.filter((c) => c.status === 'review').length;
  const passes = checks.filter((c) => c.status === 'pass').length;
  const summaryParts = [`${passes} passed`, `${reviews} to review`, `${risks} at risk`];
  let summary = `${VERDICT_LABELS[verdict]}: ${summaryParts.join(', ')}.`;
  if (blocking.length) summary = `Fill in ${blocking.join(' and ')} to run the full check.`;
  if (amount.estimate) summary += ` Indicative payable ${formatMoney(amount.estimate.payable)}.`;

  return {
    facts,
    policy: { title: wording.title, source: wording.source, clauseCount: wording.clauses.length },
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    summary,
    checks,
    missingDocuments: docs.missing,
    estimate: amount.estimate,
    generatedAt: now.toISOString(),
  };
}
