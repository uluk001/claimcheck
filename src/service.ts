import { kvs } from '@forge/kvs';
import { assessClaim } from './engine/assess';
import { parseClaim } from './engine/claim';
import { parsePolicyHtml, parsePolicyText, textToStorage } from './engine/policy';
import type { Assessment, Check, ClaimFacts, PolicyWording } from './engine/types';
import { formatMoney } from './engine/values';
import { createPage, getPage, listSpaces, pageIdFrom, type SpaceSummary } from './atlassian/confluence';
import { addComment, addLabel, createIssue, currentUserCan, getIssue, listProjects, siteBaseUrl, type IssueData, type ProjectSummary } from './atlassian/jira';
import { SAMPLE_CLAIMS } from './samples/claims';
import { SAMPLE_POLICIES, samplePolicyFor, type SamplePolicy } from './samples/policies';

export const CLAIM_LABEL = 'insurance-claim';
export const DOCS_REQUESTED_LABEL = 'docs-requested';
const SOURCES_KEY = 'policy-sources';

export interface PolicySource {
  productId: string;
  product: string;
  aliases: string[];
  pageId?: string;
  url?: string;
  title: string;
}

export class UserFacingError extends Error {}

export async function getPolicySources(): Promise<PolicySource[]> {
  return (await kvs.get<PolicySource[]>(SOURCES_KEY)) ?? [];
}

export async function savePolicySources(sources: PolicySource[]): Promise<void> {
  await kvs.set(SOURCES_KEY, sources);
}

function builtinWording(sample: SamplePolicy): PolicyWording {
  return parsePolicyText(sample.wording, { type: 'builtin', label: `${sample.title} (built-in sample)` }, sample.title);
}

async function confluenceWording(pageId: string): Promise<PolicyWording> {
  const base = await siteBaseUrl();
  const page = await getPage(pageId, base);
  const wording = parsePolicyHtml(page.storage, { type: 'confluence', url: page.url, pageId: page.id, label: page.title }, page.title);
  if (wording.clauses.length === 0) throw new UserFacingError(`The Confluence page "${page.title}" has no readable clauses.`);
  return wording;
}

/**
 * Finds the policy wording for a claim, most specific source first:
 * a wording link in the claim, a Confluence link on the issue, the product mapping from setup, then the built-in sample.
 */
export async function resolveWording(facts: ClaimFacts, issue?: IssueData): Promise<{ wording: PolicyWording; warnings: string[] }> {
  const warnings: string[] = [];
  const candidates: string[] = [];
  const fromField = pageIdFrom(facts.policyWordingRef);
  if (fromField) candidates.push(fromField);
  for (const link of issue?.remoteLinks ?? []) {
    const id = /\/wiki\//.test(link) ? pageIdFrom(link) : null;
    if (id) candidates.push(id);
  }
  const product = (facts.product ?? '').toLowerCase();
  const sources = await getPolicySources();
  const mapped = sources.find((s) => s.aliases.some((a) => product.includes(a.toLowerCase())));
  if (mapped?.pageId) candidates.push(mapped.pageId);

  for (const pageId of [...new Set(candidates)]) {
    try {
      return { wording: await confluenceWording(pageId), warnings };
    } catch (error) {
      warnings.push(`Could not read Confluence page ${pageId}: ${(error as Error).message}`);
    }
  }

  const sample = samplePolicyFor(facts.product);
  if (sample) {
    if (candidates.length === 0) warnings.push('Using the built-in sample wording. Link a Confluence page in setup to use your own wording.');
    return { wording: builtinWording(sample), warnings };
  }
  throw new UserFacingError(
    'No policy wording found for this claim. Add a "Product:" line that matches a product in Claim Check setup, or a "Policy wording:" line with a Confluence page link.',
  );
}

export interface AssessmentResult {
  assessment: Assessment;
  issue: { key: string; url: string; summary: string };
  warnings: string[];
}

export interface Access {
  /** True when the issue key comes from the Jira context the user is viewing, so Jira has already checked access. */
  trusted: boolean;
}

async function ensureCanView(issueKey: string, access: Access) {
  if (access.trusted) return;
  if (!(await currentUserCan(issueKey, 'BROWSE_PROJECTS'))) {
    throw new UserFacingError(`You do not have permission to view ${issueKey}.`);
  }
}

export async function assessIssue(issueKey: string, access: Access): Promise<AssessmentResult> {
  await ensureCanView(issueKey, access);
  const issue = await getIssue(issueKey);
  const facts = parseClaim({
    issueKey: issue.key,
    summary: issue.summary,
    description: issue.description,
    created: issue.created,
    attachments: issue.attachments,
  });
  const { wording, warnings } = await resolveWording(facts, issue);
  const assessment = assessClaim(facts, wording);
  return { assessment, issue: { key: issue.key, url: issue.url, summary: issue.summary }, warnings };
}

const STATUS_MARK: Record<Check['status'], string> = { pass: '✅', review: '⚠️', risk: '⛔', info: 'ℹ️' };

function text(value: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) {
  return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function paragraph(...content: unknown[]) {
  return { type: 'paragraph', content };
}

function sourceNode(assessment: Assessment) {
  const src = assessment.policy.source;
  return src.url ? text(src.label, [{ type: 'link', attrs: { href: src.url } }]) : text(src.label);
}

export function assessmentComment(assessment: Assessment, note?: string) {
  const items = assessment.checks.map((check) => {
    const content: unknown[] = [
      paragraph(text(`${STATUS_MARK[check.status]} `), text(check.title, [{ type: 'strong' }]), text(`: ${check.detail}`)),
    ];
    if (check.clause) content.push(paragraph(text(`Clause ${check.clause.ref}: `), text(`“${check.clause.quote}”`, [{ type: 'em' }])));
    if (check.evidence) content.push(paragraph(text('Claim says: '), text(`“${check.evidence}”`, [{ type: 'em' }])));
    return { type: 'listItem', content };
  });
  const doc: any = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [text(`Claim Check: ${assessment.verdictLabel}`)] },
      paragraph(text(assessment.summary)),
      paragraph(text('Policy wording: '), sourceNode(assessment)),
      { type: 'bulletList', content: items },
    ],
  };
  if (assessment.missingDocuments.length) {
    doc.content.push(paragraph(text('Missing documents: ', [{ type: 'strong' }]), text(assessment.missingDocuments.join('; '))));
  }
  if (note?.trim()) doc.content.push(paragraph(text('Handler note: ', [{ type: 'strong' }]), text(note.trim())));
  doc.content.push(
    paragraph(text('Generated by Claim Check from the policy wording. The coverage decision stays with the claims handler.', [{ type: 'em' }])),
  );
  return doc;
}

export function documentRequestComment(assessment: Assessment, message?: string) {
  const intro =
    message?.trim() ||
    `To continue with this claim we need the documents below, as listed in the policy wording (${assessment.policy.title}).`;
  return {
    type: 'doc',
    version: 1,
    content: [
      paragraph(text(intro)),
      {
        type: 'bulletList',
        content: assessment.missingDocuments.map((d) => ({ type: 'listItem', content: [paragraph(text(d))] })),
      },
      paragraph(text('Please attach them to this request. Requested via Claim Check.', [{ type: 'em' }])),
    ],
  };
}

export async function postAssessment(issueKey: string, access: Access, note?: string) {
  const result = await assessIssue(issueKey, access);
  const url = await addComment(result.issue.key, assessmentComment(result.assessment, note));
  return { url, verdict: result.assessment.verdictLabel };
}

export async function requestMissingDocuments(issueKey: string, access: Access, message?: string) {
  const result = await assessIssue(issueKey, access);
  if (result.assessment.missingDocuments.length === 0) {
    return { url: null, requested: [] as string[], note: 'No documents are missing, so nothing was requested.' };
  }
  const url = await addComment(result.issue.key, documentRequestComment(result.assessment, message));
  await addLabel(result.issue.key, DOCS_REQUESTED_LABEL);
  return { url, requested: result.assessment.missingDocuments, note: `Added the ${DOCS_REQUESTED_LABEL} label.` };
}

/** A compact, LLM-friendly view of an assessment for Rovo actions. */
export function forAgent(result: AssessmentResult) {
  const a = result.assessment;
  return {
    issue: result.issue,
    verdict: a.verdictLabel,
    summary: a.summary,
    policy: { title: a.policy.title, source: a.policy.source.label, url: a.policy.source.url ?? null },
    facts: {
      policyNumber: a.facts.policyNumber ?? null,
      product: a.facts.product ?? null,
      insured: a.facts.insured ?? null,
      policyPeriod: a.facts.policyStart && a.facts.policyEnd ? `${a.facts.policyStart} to ${a.facts.policyEnd}` : null,
      dateOfLoss: a.facts.dateOfLoss ?? null,
      dateReported: a.facts.dateReported ?? null,
      claimedAmount: a.facts.claimedAmount ? formatMoney(a.facts.claimedAmount) : null,
      incident: a.facts.incident ?? null,
      documentsProvided: a.facts.documentsProvided,
      missingFields: a.facts.missingFields,
    },
    checks: a.checks.map((c) => ({
      check: c.title,
      status: c.status,
      finding: c.detail,
      clauseRef: c.clause?.ref ?? null,
      clauseQuote: c.clause?.quote ?? null,
      claimEvidence: c.evidence ?? null,
    })),
    missingDocuments: a.missingDocuments,
    indicativePayable: a.estimate ? formatMoney(a.estimate.payable) : null,
    warnings: result.warnings,
  };
}

export interface SetupData {
  projects: ProjectSummary[];
  spaces: SpaceSummary[];
  confluenceAvailable: boolean;
  sources: PolicySource[];
  samples: Array<{ id: string; product: string; title: string }>;
}

export async function getSetup(): Promise<SetupData> {
  const projects = await listProjects().catch(() => [] as ProjectSummary[]);
  let spaces: SpaceSummary[] = [];
  let confluenceAvailable = true;
  try {
    spaces = await listSpaces();
  } catch {
    confluenceAvailable = false;
  }
  return {
    projects,
    spaces,
    confluenceAvailable,
    sources: await getPolicySources(),
    samples: SAMPLE_POLICIES.map((s) => ({ id: s.id, product: s.product, title: s.title })),
  };
}

function claimDescription(lines: string[], wordingUrl?: string) {
  const all = wordingUrl ? [...lines, `Policy wording: ${wordingUrl}`] : lines;
  return { type: 'doc', version: 1, content: all.map((line) => paragraph(text(line))) };
}

export async function installDemo(projectId: string, spaceId: string | null) {
  const base = await siteBaseUrl();
  const sources: PolicySource[] = [];
  const pages: Array<{ title: string; url: string }> = [];
  for (const sample of SAMPLE_POLICIES) {
    let pageId: string | undefined;
    let url: string | undefined;
    if (spaceId) {
      pageId = await createPage(spaceId, sample.title, textToStorage(sample.wording));
      url = (await getPage(pageId, base)).url;
      pages.push({ title: sample.title, url });
    }
    sources.push({ productId: sample.id, product: sample.product, aliases: sample.aliases, pageId, url, title: sample.title });
  }
  const existing = await getPolicySources();
  const merged = [...sources, ...existing.filter((e) => !sources.some((s) => s.productId === e.productId))];
  await savePolicySources(merged);

  const issues: Array<{ key: string; url: string; summary: string }> = [];
  for (const claim of SAMPLE_CLAIMS) {
    const key = await createIssue(projectId, `Claim: ${claim.summary}`, claimDescription(claim.lines), [CLAIM_LABEL]);
    issues.push({ key, url: `${base}/browse/${key}`, summary: claim.summary });
  }
  return { pages, issues };
}

export async function linkPolicyPage(productId: string, pageRef: string) {
  const pageId = pageIdFrom(pageRef);
  if (!pageId) throw new UserFacingError('Paste a Confluence page link or page id.');
  const base = await siteBaseUrl();
  const page = await getPage(pageId, base);
  const wording = parsePolicyHtml(page.storage, { type: 'confluence', url: page.url, pageId, label: page.title }, page.title);
  const sample = SAMPLE_POLICIES.find((s) => s.id === productId);
  const sources = await getPolicySources();
  const entry: PolicySource = {
    productId,
    product: sample?.product ?? productId,
    aliases: sample?.aliases ?? [productId],
    pageId,
    url: page.url,
    title: page.title,
  };
  await savePolicySources([entry, ...sources.filter((s) => s.productId !== productId)]);
  return { title: page.title, url: page.url, clauses: wording.clauses.length };
}

export async function policyClauses(issueKey: string | null, product: string | null, topic: string | null, access: Access) {
  let wording: PolicyWording;
  if (issueKey) {
    await ensureCanView(issueKey, access);
    const issue = await getIssue(issueKey);
    const facts = parseClaim({ issueKey, description: issue.description, created: issue.created, attachments: issue.attachments });
    wording = (await resolveWording(facts, issue)).wording;
  } else {
    wording = (await resolveWording({ product: product ?? '', documentsProvided: [], missingFields: [] })).wording;
  }
  const kinds: Record<string, string[]> = {
    exclusions: ['exclusions'],
    documents: ['documents'],
    notification: ['notification'],
    limits: ['limits', 'deductible'],
    deductible: ['deductible'],
    cover: ['cover'],
    waiting: ['waiting'],
  };
  const wanted = topic ? kinds[topic.toLowerCase()] : undefined;
  const clauses = wanted ? wording.clauses.filter((c) => wanted.includes(c.kind)) : wording.clauses;
  return {
    policy: wording.title,
    source: wording.source.label,
    url: wording.source.url ?? null,
    clauses: clauses.map((c) => ({ ref: c.ref, section: c.section, kind: c.kind, text: c.text })),
  };
}
