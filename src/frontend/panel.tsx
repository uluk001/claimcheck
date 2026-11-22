import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Em,
  EmptyState,
  Heading,
  Inline,
  Link,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Tag,
  TagGroup,
  Text,
  xcss,
} from '@forge/react';
import { rovo } from '@forge/bridge';
import { call } from './call';
import type { Assessment, Check } from '../engine/types';

interface AssessmentResult {
  assessment: Assessment;
  issue: { key: string; url: string; summary: string };
  warnings: string[];
}

const AGENT = { name: 'Claim Review Assistant', key: 'claim-review-assistant' };

const VERDICT_APPEARANCE: Record<Assessment['verdict'], 'success' | 'moved' | 'removed' | 'default'> = {
  clear: 'success',
  review: 'moved',
  risk: 'removed',
  incomplete: 'default',
};

const STATUS: Record<Check['status'], { label: string; appearance: 'success' | 'moved' | 'removed' | 'default' }> = {
  pass: { label: 'OK', appearance: 'success' },
  review: { label: 'Review', appearance: 'moved' },
  risk: { label: 'Risk', appearance: 'removed' },
  info: { label: 'Info', appearance: 'default' },
};

const ORDER: Record<Check['status'], number> = { risk: 0, review: 1, info: 2, pass: 3 };

const quoteStyle = xcss({
  borderLeftWidth: 'border.width.selected',
  borderLeftStyle: 'solid',
  borderLeftColor: 'color.border.accent.blue',
  paddingInlineStart: 'space.100',
});

const cardStyle = xcss({
  padding: 'space.100',
  borderRadius: 'radius.medium',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
});

function money(m?: { amount: number; currency: string }) {
  return m ? `${m.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.currency}` : '—';
}

function CheckCard({ check }: { check: Check }) {
  const status = STATUS[check.status];
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.050">
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance={status.appearance}>{status.label}</Lozenge>
          <Strong>{check.title}</Strong>
        </Inline>
        <Text>{check.detail}</Text>
        {check.clause ? (
          <Box xcss={quoteStyle}>
            <Text>
              <Strong>Clause {check.clause.ref}: </Strong>
              <Em>“{check.clause.quote}”</Em>
            </Text>
          </Box>
        ) : null}
        {check.evidence ? (
          <Text>
            <Strong>Claim says: </Strong>
            <Em>“{check.evidence}”</Em>
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}

function App() {
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'post' | 'docs' | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await call<AssessmentResult>('assess');
    if (res.ok) setResult(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async () => {
    setBusy('post');
    const res = await call<{ url: string }>('postAssessment', {});
    setBusy(null);
    setNotice(res.ok ? { text: 'Assessment posted as a comment.', url: res.data.url } : { text: res.error });
  };

  const requestDocs = async () => {
    setBusy('docs');
    const res = await call<{ url: string | null; note: string }>('requestDocuments');
    setBusy(null);
    setNotice(res.ok ? { text: `Documents requested. ${res.data.note}`, url: res.data.url } : { text: res.error });
  };

  const askAgent = async () => {
    const key = result?.issue.key ?? 'this claim';
    await rovo.open({
      type: 'forge',
      agentName: AGENT.name,
      agentKey: AGENT.key,
      prompt: `Assess claim ${key} against the policy wording and tell me what to do next.`,
    });
  };

  if (loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text>Checking the claim against the policy wording…</Text>
      </Inline>
    );
  }

  if (error || !result) {
    return (
      <Stack space="space.100">
        <EmptyState header="Claim Check could not read this issue" description={error ?? 'Unknown error'} />
        <Text>
          Claim issues need labelled lines such as <Strong>Product:</Strong>, <Strong>Date of loss:</Strong>,{' '}
          <Strong>Claimed amount:</Strong> and <Strong>Incident:</Strong>. Open <Strong>Apps → Claim Check setup</Strong> to load sample claims.
        </Text>
        <Button onClick={load}>Try again</Button>
      </Stack>
    );
  }

  const a = result.assessment;
  const checks = [...a.checks].sort((x, y) => ORDER[x.status] - ORDER[y.status]);

  return (
    <Stack space="space.200">
      <Stack space="space.075">
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance={VERDICT_APPEARANCE[a.verdict]} isBold>
            {a.verdictLabel}
          </Lozenge>
          {a.estimate ? <Text>Indicative payable: <Strong>{money(a.estimate.payable)}</Strong></Text> : null}
        </Inline>
        <Text>{a.summary}</Text>
        <Text>
          Policy wording:{' '}
          {a.policy.source.url ? <Link href={a.policy.source.url} openNewTab>{a.policy.source.label}</Link> : a.policy.source.label} ·{' '}
          {a.policy.clauseCount} clauses read
        </Text>
      </Stack>

      <TagGroup>
        {a.facts.policyNumber ? <Tag text={a.facts.policyNumber} /> : null}
        {a.facts.product ? <Tag text={a.facts.product} /> : null}
        {a.facts.dateOfLoss ? <Tag text={`Loss ${a.facts.dateOfLoss}`} /> : null}
        {a.facts.dateReported ? <Tag text={`Reported ${a.facts.dateReported}`} /> : null}
        {a.facts.claimedAmount ? <Tag text={`Claimed ${money(a.facts.claimedAmount)}`} /> : null}
      </TagGroup>

      {a.facts.missingFields.length ? (
        <SectionMessage appearance="information" title="Some claim details are missing">
          <Text>Add these lines to the issue description for a complete check: {a.facts.missingFields.join(', ')}.</Text>
        </SectionMessage>
      ) : null}

      {result.warnings.map((w) => (
        <SectionMessage key={w} appearance="warning">
          <Text>{w}</Text>
        </SectionMessage>
      ))}

      <Stack space="space.100">
        <Heading size="small">Checks</Heading>
        {checks.map((check) => (
          <CheckCard key={check.id} check={check} />
        ))}
      </Stack>

      {a.missingDocuments.length ? (
        <SectionMessage appearance="warning" title="Missing documents">
          <Stack space="space.050">
            {a.missingDocuments.map((d) => (
              <Text key={d}>• {d}</Text>
            ))}
          </Stack>
        </SectionMessage>
      ) : null}

      {a.estimate ? (
        <Text>
          <Em>
            Claimed {money(a.estimate.claimed)} · limit {money(a.estimate.limit)} · deductible {money(a.estimate.deductible)} →
            payable {money(a.estimate.payable)}. {a.estimate.note}
          </Em>
        </Text>
      ) : null}

      {notice ? (
        <SectionMessage appearance="success">
          <Text>
            {notice.text} {notice.url ? <Link href={notice.url}>Open</Link> : null}
          </Text>
        </SectionMessage>
      ) : null}

      <ButtonGroup>
        <Button appearance="primary" onClick={askAgent}>
          Ask the Claim Review Assistant
        </Button>
        <LoadingButton isLoading={busy === 'post'} onClick={post}>
          Post assessment
        </LoadingButton>
        {a.missingDocuments.length ? (
          <LoadingButton isLoading={busy === 'docs'} onClick={requestDocs}>
            Request missing documents
          </LoadingButton>
        ) : null}
        <Button appearance="subtle" onClick={load}>
          Re-check
        </Button>
      </ButtonGroup>
      <Text>
        <Em>Claim Check reads the policy wording and quotes it. The coverage decision stays with the claims handler.</Em>
      </Text>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
