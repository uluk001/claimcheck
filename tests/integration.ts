import assert from 'node:assert/strict';
import { calls, state } from './mocks/forge-api';
import { assessClaimAction, postAssessmentAction, requestDocumentsAction, policyClausesAction } from '../src/index';
import { textToStorage } from '../src/engine/policy';
import { SAMPLE_CLAIMS } from '../src/samples/claims';
import { SAMPLE_POLICIES } from '../src/samples/policies';

const adf = (lines: string[]) => ({ type: 'doc', version: 1, content: lines.map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })) });

state.confluence['98765'] = {
  id: '98765',
  title: 'NorthPeak Motor Insurance (KASKO): Policy Wording',
  body: { storage: { value: textToStorage(SAMPLE_POLICIES[0].wording) } },
  _links: { webui: '/spaces/CLAIMS/pages/98765/NorthPeak+Motor' },
};
state.jira['CLM-2'] = {
  issue: {
    id: '10002',
    key: 'CLM-2',
    fields: {
      summary: SAMPLE_CLAIMS[1].summary,
      description: adf(SAMPLE_CLAIMS[1].lines),
      created: '2026-11-12T09:00:00.000+0000',
      attachment: [{ filename: 'registration_certificate.pdf' }],
      labels: ['insurance-claim'],
      project: { id: '10000' },
    },
  },
  remoteLinks: [{ object: { url: 'https://demo.atlassian.net/wiki/spaces/CLAIMS/pages/98765/NorthPeak+Motor' } }],
};

(async () => {
  const assessed: any = await assessClaimAction({ issueKey: 'clm-2', context: { jira: { issueKey: 'CLM-2' } } });
  assert.equal(assessed.error, undefined, assessed.error);
  assert.equal(assessed.verdict, 'Coverage at risk');
  assert.equal(assessed.policy.url, 'https://demo.atlassian.net/wiki/spaces/CLAIMS/pages/98765/NorthPeak+Motor');
  assert.ok(assessed.checks.some((c: any) => c.clauseRef === '4.1' && c.status === 'risk'));
  assert.ok(!assessed.missingDocuments.includes('vehicle registration certificate'), 'attachment counts as provided');

  const clauses: any = await policyClausesAction({ topic: 'exclusions', context: { jira: { issueKey: 'CLM-2' } } });
  assert.equal(clauses.clauses.length, 7);

  const posted: any = await postAssessmentAction({ note: 'Asked the driver for a statement.', context: { jira: { issueKey: 'CLM-2' } } });
  assert.equal(posted.url, 'https://demo.atlassian.net/browse/CLM-2?focusedCommentId=10001');
  const comment = calls.find((c) => c.method === 'POST' && c.path.endsWith('/comment'));
  assert.equal(comment?.body.body.type, 'doc');
  assert.match(JSON.stringify(comment?.body.body), /Handler note/);

  const requested: any = await requestDocumentsAction({ context: { jira: { issueKey: 'CLM-2' } } });
  assert.ok(requested.requested.length > 0);
  assert.ok(calls.some((c) => c.method === 'PUT' && c.body?.update?.labels?.[0]?.add === 'docs-requested'));

  assert.ok(calls.some((c) => c.product === 'actor' && c.method === 'user' && c.path.endsWith('/comment')), 'comments are posted as the user');

  const bad: any = await assessClaimAction({ issueKey: 'not a key' });
  assert.match(bad.error, /which claim/);

  // An issue the user is not viewing is checked against the user's own permissions.
  state.allow = false;
  const denied: any = await assessClaimAction({ issueKey: 'CLM-2' });
  assert.match(denied.error, /permission/);
  // The issue in context is trusted: Jira already checked the user can view it.
  const inContext: any = await assessClaimAction({ context: { jira: { issueKey: 'CLM-2' } } });
  assert.equal(inContext.verdict, 'Coverage at risk');
  console.log('integration ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
