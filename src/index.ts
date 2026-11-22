import Resolver from '@forge/resolver';
import { isForgePlatformError, NeedsAuthenticationError } from '@forge/api';
import { ISSUE_KEY_RE } from './atlassian/jira';
import {
  UserFacingError,
  assessIssue,
  forAgent,
  getSetup,
  installDemo,
  linkPolicyPage,
  policyClauses,
  postAssessment,
  requestMissingDocuments,
} from './service';

function errorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  console.error(error);
  return 'Claim Check could not complete this request. Check the app logs for details.';
}

/** Forge platform errors, such as a request for the user's consent, must reach the platform so it can prompt the user. */
function isPlatformError(error: unknown): boolean {
  return error instanceof NeedsAuthenticationError || (error instanceof Error && isForgePlatformError(error));
}

async function safely<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (isPlatformError(error)) throw error;
    return { ok: false, error: errorMessage(error) };
  }
}

const TRUSTED = { trusted: true };

const resolver = new Resolver();

function issueKeyFromContext(context: any): string {
  const key = context?.extension?.issue?.key;
  if (typeof key !== 'string' || !ISSUE_KEY_RE.test(key)) throw new UserFacingError('Open Claim Check from a Jira issue.');
  return key;
}

resolver.define('assess', ({ context }) => safely(() => assessIssue(issueKeyFromContext(context), TRUSTED)));

resolver.define('postAssessment', ({ payload, context }) =>
  safely(() => postAssessment(issueKeyFromContext(context), TRUSTED, typeof payload?.note === 'string' ? payload.note.slice(0, 2000) : undefined)),
);

resolver.define('requestDocuments', ({ context }) => safely(() => requestMissingDocuments(issueKeyFromContext(context), TRUSTED)));

resolver.define('getSetup', () => safely(() => getSetup()));

resolver.define('installDemo', ({ payload }) =>
  safely(async () => {
    const projectId = String(payload?.projectId ?? '');
    if (!/^\d+$/.test(projectId)) throw new UserFacingError('Choose a Jira project for the sample claims.');
    const spaceId = payload?.spaceId ? String(payload.spaceId) : null;
    if (spaceId && !/^\d+$/.test(spaceId)) throw new UserFacingError('Choose a valid Confluence space.');
    return installDemo(projectId, spaceId);
  }),
);

resolver.define('linkPolicy', ({ payload }) =>
  safely(() => linkPolicyPage(String(payload?.productId ?? ''), String(payload?.pageRef ?? ''))),
);

export const handler = resolver.getDefinitions();

/**
 * Rovo action inputs are extracted by the model, so the issue key is validated. The issue in the Jira context is trusted
 * because the user is viewing it; any other issue is checked against the user's own Jira permissions.
 */
function actionTarget(payload: any): { issueKey: string; access: { trusted: boolean } } {
  const fromContext = typeof payload?.context?.jira?.issueKey === 'string' ? payload.context.jira.issueKey : '';
  const fromInput = typeof payload?.issueKey === 'string' ? payload.issueKey.trim().toUpperCase() : '';
  if (ISSUE_KEY_RE.test(fromInput)) return { issueKey: fromInput, access: { trusted: fromInput === fromContext } };
  if (ISSUE_KEY_RE.test(fromContext)) return { issueKey: fromContext, access: { trusted: true } };
  throw new UserFacingError('Tell me which claim to look at, for example "CLM-12", or open the claim issue first.');
}

async function action<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (error) {
    if (isPlatformError(error)) throw error;
    return { error: errorMessage(error) };
  }
}

export const assessClaimAction = (payload: any) =>
  action(async () => {
    const target = actionTarget(payload);
    return forAgent(await assessIssue(target.issueKey, target.access));
  });

export const policyClausesAction = (payload: any) =>
  action(() => {
    const topic = typeof payload?.topic === 'string' ? payload.topic : null;
    const product = typeof payload?.product === 'string' ? payload.product : null;
    let target: ReturnType<typeof actionTarget> | null = null;
    try {
      target = actionTarget(payload);
    } catch {
      if (!product) throw new UserFacingError('Give me a claim issue key or a product name (motor, home or travel).');
    }
    return policyClauses(target?.issueKey ?? null, product, topic, target?.access ?? { trusted: false });
  });

export const postAssessmentAction = (payload: any) =>
  action(() => {
    const target = actionTarget(payload);
    return postAssessment(target.issueKey, target.access, typeof payload?.note === 'string' ? payload.note.slice(0, 2000) : undefined);
  });

export const requestDocumentsAction = (payload: any) =>
  action(() => {
    const target = actionTarget(payload);
    return requestMissingDocuments(target.issueKey, target.access, typeof payload?.message === 'string' ? payload.message.slice(0, 2000) : undefined);
  });
