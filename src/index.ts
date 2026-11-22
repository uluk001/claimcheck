import Resolver from '@forge/resolver';
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

async function safely<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

const resolver = new Resolver();

function issueKeyFromContext(context: any): string {
  const key = context?.extension?.issue?.key;
  if (typeof key !== 'string' || !ISSUE_KEY_RE.test(key)) throw new UserFacingError('Open Claim Check from a Jira issue.');
  return key;
}

resolver.define('assess', ({ context }) => safely(() => assessIssue(issueKeyFromContext(context), context.accountId)));

resolver.define('postAssessment', ({ payload, context }) =>
  safely(() => postAssessment(issueKeyFromContext(context), context.accountId, typeof payload?.note === 'string' ? payload.note.slice(0, 2000) : undefined)),
);

resolver.define('requestDocuments', ({ context }) => safely(() => requestMissingDocuments(issueKeyFromContext(context), context.accountId)));

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

/** Rovo action inputs are extracted by the model, so the issue key is validated and falls back to the issue in context. */
function actionIssueKey(payload: any): string {
  const fromInput = typeof payload?.issueKey === 'string' ? payload.issueKey.trim().toUpperCase() : '';
  if (ISSUE_KEY_RE.test(fromInput)) return fromInput;
  const fromContext = payload?.context?.jira?.issueKey;
  if (typeof fromContext === 'string' && ISSUE_KEY_RE.test(fromContext)) return fromContext;
  throw new UserFacingError('Tell me which claim to look at, for example "CLM-12", or open the claim issue first.');
}

async function action<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export const assessClaimAction = (payload: any, context: any) =>
  action(async () => forAgent(await assessIssue(actionIssueKey(payload), context?.principal?.accountId ?? context?.accountId)));

export const policyClausesAction = (payload: any, context: any) =>
  action(() => {
    const topic = typeof payload?.topic === 'string' ? payload.topic : null;
    const product = typeof payload?.product === 'string' ? payload.product : null;
    let issueKey: string | null = null;
    try {
      issueKey = actionIssueKey(payload);
    } catch {
      if (!product) throw new UserFacingError('Give me a claim issue key or a product name (motor, home or travel).');
    }
    return policyClauses(issueKey, product, topic, context?.principal?.accountId ?? context?.accountId);
  });

export const postAssessmentAction = (payload: any, context: any) =>
  action(() =>
    postAssessment(
      actionIssueKey(payload),
      context?.principal?.accountId ?? context?.accountId,
      typeof payload?.note === 'string' ? payload.note.slice(0, 2000) : undefined,
    ),
  );

export const requestDocumentsAction = (payload: any, context: any) =>
  action(() =>
    requestMissingDocuments(
      actionIssueKey(payload),
      context?.principal?.accountId ?? context?.accountId,
      typeof payload?.message === 'string' ? payload.message.slice(0, 2000) : undefined,
    ),
  );
