import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessClaim, findNotificationLimit, requiredDocuments } from '../src/engine/assess';
import { adfToText, parseClaim } from '../src/engine/claim';
import { parsePolicyHtml, parsePolicyText, textToStorage } from '../src/engine/policy';
import { findMoney, parseDate, parseDateRange } from '../src/engine/values';
import { SAMPLE_CLAIMS } from '../src/samples/claims';
import { SAMPLE_POLICIES, samplePolicyFor } from '../src/samples/policies';

const builtin = (id: string) => {
  const p = SAMPLE_POLICIES.find((s) => s.id === id)!;
  return parsePolicyText(p.wording, { type: 'builtin', label: p.title }, p.title);
};

test('parses dates and money in common formats', () => {
  assert.equal(parseDate('2026-11-02')?.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(parseDate('02.11.2026')?.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(parseDate('2 November 2026')?.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(parseDate('November 2, 2026')?.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(parseDate('2026-02-30'), null);
  const range = parseDateRange('2026-03-01 to 2027-02-28');
  assert.ok(range);
  assert.deepEqual(findMoney('Deductible: 300 USD, limit $25,000 and KZT 1 200 000').map((m) => [m.amount, m.currency]), [
    [300, 'USD'],
    [25000, 'USD'],
    [1200000, 'KZT'],
  ]);
});

test('parses policy wording into numbered clauses with section kinds', () => {
  const motor = builtin('motor');
  assert.equal(motor.title, 'NorthPeak Motor Insurance (KASKO): Policy Wording');
  const byRef = new Map(motor.clauses.map((c) => [c.ref, c]));
  assert.equal(byRef.get('4.1')?.kind, 'exclusions');
  assert.equal(byRef.get('2.2')?.kind, 'deductible');
  assert.equal(byRef.get('2.1')?.kind, 'limits');
  assert.equal(byRef.get('3.1')?.kind, 'notification');
  assert.equal(byRef.get('5.1(a)')?.text, 'completed claim form');
  assert.equal(byRef.get('5.1(e)')?.kind, 'documents');
  // Every clause text is an exact substring of the source wording.
  const wording = SAMPLE_POLICIES[0].wording;
  for (const clause of motor.clauses) assert.ok(wording.includes(clause.text), clause.ref);
});

test('parses Confluence storage format with nested list paragraphs', () => {
  const html =
    '<h2>3. Making a claim</h2><p>3.1 You must notify us within seven (7) days of the date of loss.</p>' +
    '<h2>5. Documents we need</h2><p>5.1 For every claim we need:</p><ul><li><p>completed claim form</p></li><li><p>photos &amp; video</p></li></ul>' +
    '<table><tbody><tr><td><p>Note</p></td></tr></tbody></table>';
  const wording = parsePolicyHtml(html, { type: 'confluence', label: 'Test page' }, 'Test page');
  assert.equal(wording.title, 'Test page');
  assert.deepEqual(
    wording.clauses.map((c) => [c.ref, c.text]),
    [
      ['3.1', 'You must notify us within seven (7) days of the date of loss.'],
      ['5.1', 'For every claim we need:'],
      ['5.1(a)', 'completed claim form'],
      ['5.1(b)', 'photos & video'],
      ['5.2', 'Note'],
    ],
  );
  const limit = findNotificationLimit(wording);
  assert.equal(limit?.days, 7);
});

test('round-trips sample wording through Confluence storage format', () => {
  for (const sample of SAMPLE_POLICIES) {
    const fromText = parsePolicyText(sample.wording, { type: 'builtin', label: sample.title }, sample.title);
    const fromHtml = parsePolicyHtml(textToStorage(sample.wording), { type: 'confluence', label: sample.title }, sample.title);
    assert.deepEqual(
      fromHtml.clauses.map((c) => [c.ref, c.kind, c.text]),
      fromText.clauses.map((c) => [c.ref, c.kind, c.text]),
      sample.id,
    );
  }
});

test('extracts claim facts from labelled description lines and ADF', () => {
  const adf = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Policy number: NP-1' }, { type: 'hardBreak' }, { type: 'text', text: 'Date of loss: 02.11.2026' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Claimed amount: USD 1,250' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Incident: Hail damaged the roof.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Documents provided:' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'photos' }] }] }] },
    ],
  };
  const text = adfToText(adf);
  assert.equal(text, 'Policy number: NP-1\nDate of loss: 02.11.2026\nClaimed amount: USD 1,250\nIncident: Hail damaged the roof.\nDocuments provided:\n- photos');
  const facts = parseClaim({ description: text, created: '2026-11-05T08:00:00.000+0000', attachments: ['claim_form.pdf'] });
  assert.equal(facts.policyNumber, 'NP-1');
  assert.equal(facts.dateOfLoss, '2026-11-02');
  assert.equal(facts.dateReported, '2026-11-05');
  assert.deepEqual(facts.claimedAmount, { amount: 1250, currency: 'USD' });
  assert.equal(facts.incident, 'Hail damaged the roof.');
  assert.deepEqual(facts.documentsProvided, ['photos', 'claim_form.pdf']);
  assert.ok(facts.missingFields.includes('Product'));
});

test('sample claims produce the expected verdicts', () => {
  for (const sample of SAMPLE_CLAIMS) {
    const facts = parseClaim({ description: sample.lines.join('\n') });
    const policy = samplePolicyFor(facts.product)!;
    const wording = parsePolicyText(policy.wording, { type: 'builtin', label: policy.title }, policy.title);
    const result = assessClaim(facts, wording, new Date('2026-11-20T00:00:00Z'));
    assert.equal(result.verdict, sample.expected, `${sample.summary}: ${JSON.stringify(result.checks.map((c) => [c.title, c.status]))}`);
    for (const check of result.checks) {
      if (check.clause && !check.clause.quote.endsWith('…')) assert.ok(policy.wording.includes(check.clause.quote), check.title);
      if (check.evidence) assert.ok(facts.incident!.includes(check.evidence), check.title);
    }
  }
});

test('flags alcohol exclusion and late notification with exact quotes', () => {
  const sample = SAMPLE_CLAIMS[1];
  const facts = parseClaim({ description: sample.lines.join('\n') });
  const result = assessClaim(facts, builtin('motor'));
  const alcohol = result.checks.find((c) => c.id === 'exclusion-4.1');
  assert.equal(alcohol?.status, 'risk');
  assert.match(alcohol!.evidence!, /two glasses of wine/);
  const notice = result.checks.find((c) => c.id === 'notification');
  assert.equal(notice?.status, 'risk');
  assert.match(notice!.detail, /12 days/);
  assert.ok(result.missingDocuments.includes('vehicle registration certificate'));
  assert.ok(result.missingDocuments.some((d) => d.startsWith('police report')));
});

test('applies deductible and limits to the indicative payable amount', () => {
  const facts = parseClaim({ description: SAMPLE_CLAIMS[0].lines.join('\n') });
  const result = assessClaim(facts, builtin('motor'));
  assert.equal(result.verdict, 'clear');
  assert.deepEqual(result.estimate?.payable, { amount: 2100, currency: 'USD' });

  const home = parseClaim({ description: SAMPLE_CLAIMS[3].lines.join('\n') });
  const homeResult = assessClaim(home, builtin('home'));
  assert.equal(homeResult.estimate?.limit?.amount, 5000, 'escape of water sub-limit');
  assert.deepEqual(homeResult.estimate?.payable, { amount: 4850, currency: 'USD' });
  assert.equal(homeResult.checks.find((c) => c.id === 'exclusion-5.1')?.status, 'review');
  assert.equal(homeResult.checks.find((c) => c.id === 'waiting')?.status, 'pass');
});

test('respects negation and conditional documents', () => {
  const facts = parseClaim({
    description: [
      'Product: Motor',
      'Policy period: 2026-01-01 to 2026-12-31',
      'Date of loss: 2026-05-01',
      'Date reported: 2026-05-02',
      'Claimed amount: 500 USD',
      'Incident: The driver had not consumed alcohol. A stone hit the bonnet on the highway.',
      'Documents provided: claim form; licence; registration certificate; photos',
    ].join('\n'),
  });
  const result = assessClaim(facts, builtin('motor'));
  assert.equal(result.checks.find((c) => c.id === 'exclusion-4.1')?.status, 'review');
  const docs = requiredDocuments(facts, builtin('motor'));
  assert.equal(docs.find((d) => d.name.startsWith('police report'))?.required, false);
  assert.deepEqual(result.missingDocuments, []);
});

test('travel deadline counts from the return home and medical-only deadlines are skipped', () => {
  const facts = parseClaim({ description: SAMPLE_CLAIMS[4].lines.join('\n') });
  const travel = builtin('travel');
  const limit = findNotificationLimit(travel, facts.incident);
  assert.equal(limit?.clause.ref, '3.2');
  assert.equal(limit?.anchor, 'return');
  const result = assessClaim(facts, travel);
  assert.equal(result.checks.find((c) => c.id === 'exclusion-4.2')?.status, 'review');
  assert.ok(result.missingDocuments.some((d) => d.startsWith('police report')));
});

test('glass claims use the glass limit and skip the deductible; ride-hailing is not a storm', () => {
  const glass = parseClaim({
    description: [
      'Product: Motor (KASKO)',
      'Policy period: 2026-01-01 to 2026-12-31',
      'Date of loss: 2026-05-01',
      'Date reported: 2026-05-03',
      'Claimed amount: 950 USD',
      'Incident: A stone thrown up by a truck cracked the windscreen on the highway.',
    ].join('\n'),
  });
  const result = assessClaim(glass, builtin('motor'));
  assert.equal(result.estimate?.limit?.amount, 800);
  assert.equal(result.estimate?.deductible?.amount, 0);
  assert.deepEqual(result.estimate?.payable, { amount: 800, currency: 'USD' });

  const ride = parseClaim({ description: SAMPLE_CLAIMS[2].lines.join('\n') });
  const rideResult = assessClaim(ride, builtin('motor'));
  assert.equal(rideResult.estimate?.limit?.amount, 25000);
  assert.equal(rideResult.estimate?.deductible?.amount, 300);
});
