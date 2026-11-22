import type { Money } from './values';

export type SectionKind =
  | 'cover'
  | 'exclusions'
  | 'limits'
  | 'deductible'
  | 'notification'
  | 'documents'
  | 'waiting'
  | 'general';

export interface Clause {
  /** Clause number as written in the wording, e.g. "4.2". Generated when the wording has no numbering. */
  ref: string;
  /** Exact clause text from the policy wording. */
  text: string;
  section: string;
  kind: SectionKind;
}

export interface PolicyWording {
  title: string;
  clauses: Clause[];
  /** Where the wording came from, so every quote can be traced. */
  source: { type: 'confluence' | 'stored' | 'builtin'; url?: string; pageId?: string; label: string };
}

export interface ClaimFacts {
  issueKey?: string;
  policyNumber?: string;
  product?: string;
  insured?: string;
  policyStart?: string;
  policyEnd?: string;
  dateOfLoss?: string;
  dateReported?: string;
  claimedAmount?: Money;
  incident?: string;
  documentsProvided: string[];
  policyWordingRef?: string;
  /** Labels the parser could not read, so the panel can tell the handler what to fill in. */
  missingFields: string[];
}

export type CheckStatus = 'pass' | 'review' | 'risk' | 'info';

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  /** Exact wording from the policy that supports this check. */
  clause?: { ref: string; quote: string };
  /** Exact words from the claim that triggered this check. */
  evidence?: string;
}

export type Verdict = 'clear' | 'review' | 'risk' | 'incomplete';

export interface Assessment {
  facts: ClaimFacts;
  policy: { title: string; source: PolicyWording['source']; clauseCount: number };
  verdict: Verdict;
  verdictLabel: string;
  summary: string;
  checks: Check[];
  missingDocuments: string[];
  estimate?: {
    claimed: Money;
    deductible?: Money;
    limit?: Money;
    payable: Money;
    note: string;
  };
  generatedAt: string;
}
