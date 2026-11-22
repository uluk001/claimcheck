import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Em,
  Heading,
  Inline,
  Label,
  Link,
  LoadingButton,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Text,
  Textfield,
  xcss,
} from '@forge/react';
import { call } from './call';

interface Option {
  label: string;
  value: string;
}
interface SetupData {
  projects: Array<{ id: string; key: string; name: string }>;
  spaces: Array<{ id: string; key: string; name: string }>;
  confluenceAvailable: boolean;
  sources: Array<{ productId: string; product: string; title: string; url?: string; pageId?: string }>;
  samples: Array<{ id: string; product: string; title: string }>;
}
interface DemoResult {
  pages: Array<{ title: string; url: string }>;
  issues: Array<{ key: string; url: string; summary: string }>;
}

const section = xcss({
  padding: 'space.200',
  borderRadius: 'radius.medium',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
});

function App() {
  const [data, setData] = useState<SetupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Option | null>(null);
  const [space, setSpace] = useState<Option | null>(null);
  const [installing, setInstalling] = useState(false);
  const [demo, setDemo] = useState<DemoResult | null>(null);
  const [linkProduct, setLinkProduct] = useState<Option | null>(null);
  const [pageRef, setPageRef] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  const load = async () => {
    const res = await call<SetupData>('getSetup');
    if (res.ok) setData(res.data);
    else setError(res.error);
  };

  useEffect(() => {
    load();
  }, []);

  if (!data && !error) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text>Loading Claim Check setup…</Text>
      </Inline>
    );
  }
  if (!data) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;

  const projectOptions = data.projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.id }));
  const spaceOptions = data.spaces.map((s) => ({ label: `${s.name} (${s.key})`, value: s.id }));
  const productOptions = data.samples.map((s) => ({ label: s.product, value: s.id }));

  const install = async () => {
    if (!project) return;
    setInstalling(true);
    setError(null);
    const res = await call<DemoResult>('installDemo', { projectId: project.value, spaceId: space?.value ?? null });
    setInstalling(false);
    if (res.ok) {
      setDemo(res.data);
      load();
    } else setError(res.error);
  };

  const link = async () => {
    if (!linkProduct || !pageRef.trim()) return;
    setLinking(true);
    const res = await call<{ title: string; clauses: number }>('linkPolicy', { productId: linkProduct.value, pageRef });
    setLinking(false);
    setLinkResult(res.ok ? `Linked "${res.data.title}" (${res.data.clauses} clauses found).` : res.error);
    if (res.ok) load();
  };

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="large">Claim Check setup</Heading>
        <Text>
          Claim Check reads the policy wording in Confluence and checks each insurance claim in Jira against it: policy period,
          notification deadline, exclusions, limits, deductible and required documents, with every finding quoted from the wording.
        </Text>
      </Stack>

      {error ? (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      <Box xcss={section}>
        <Stack space="space.150">
          <Heading size="medium">1. Load sample policies and claims</Heading>
          <Text>
            Creates three policy wording pages (motor, home and travel) in the Confluence space you choose and five sample claims in
            the Jira project you choose. Open any of the claims to see the Claim Check panel.
          </Text>
          <Stack space="space.050">
            <Label labelFor="project">Jira project for sample claims</Label>
            <Select inputId="project" options={projectOptions} value={project} onChange={(v: Option) => setProject(v)} placeholder="Choose a project" />
          </Stack>
          {data.confluenceAvailable ? (
            <Stack space="space.050">
              <Label labelFor="space">Confluence space for policy wordings (optional)</Label>
              <Select inputId="space" options={spaceOptions} value={space} onChange={(v: Option) => setSpace(v)} placeholder="Choose a space" isClearable />
            </Stack>
          ) : (
            <SectionMessage appearance="information">
              <Text>
                Claim Check is not installed in Confluence on this site, so the built-in sample wordings will be used. Install the app
                in Confluence too to keep wordings as Confluence pages.
              </Text>
            </SectionMessage>
          )}
          <Inline>
            <LoadingButton appearance="primary" isLoading={installing} isDisabled={!project} onClick={install}>
              Create sample data
            </LoadingButton>
          </Inline>
          {demo ? (
            <SectionMessage appearance="success" title="Sample data created">
              <Stack space="space.050">
                {demo.pages.map((p) => (
                  <Text key={p.url}>
                    Policy page: <Link href={p.url} openNewTab>{p.title}</Link>
                  </Text>
                ))}
                {demo.issues.map((i) => (
                  <Text key={i.key}>
                    Claim: <Link href={i.url} openNewTab>{i.key}</Link> {i.summary}
                  </Text>
                ))}
              </Stack>
            </SectionMessage>
          ) : null}
        </Stack>
      </Box>

      <Box xcss={section}>
        <Stack space="space.150">
          <Heading size="medium">2. Use your own policy wording</Heading>
          <Text>
            Link a Confluence page to a product. Claims whose <Strong>Product:</Strong> line matches the product will be checked
            against that page. Number the clauses (1.1, 1.2…) and use headings such as Cover, Limits and deductible, Making a claim,
            Exclusions and Documents we need.
          </Text>
          <Stack space="space.050">
            <Label labelFor="product">Product</Label>
            <Select inputId="product" options={productOptions} value={linkProduct} onChange={(v: Option) => setLinkProduct(v)} placeholder="Choose a product" />
          </Stack>
          <Stack space="space.050">
            <Label labelFor="page">Confluence page link</Label>
            <Textfield id="page" value={pageRef} onChange={(e) => setPageRef(e.target.value)} placeholder="https://your-site.atlassian.net/wiki/spaces/…/pages/123456/…" />
          </Stack>
          <Inline>
            <LoadingButton isLoading={linking} isDisabled={!linkProduct || !pageRef.trim()} onClick={link}>
              Link page
            </LoadingButton>
          </Inline>
          {linkResult ? <Text>{linkResult}</Text> : null}
        </Stack>
      </Box>

      <Box xcss={section}>
        <Stack space="space.100">
          <Heading size="medium">Current policy sources</Heading>
          {data.sources.length === 0 ? (
            <Text>
              <Em>No pages linked yet. Claims fall back to the built-in sample wordings for motor, home and travel.</Em>
            </Text>
          ) : (
            data.sources.map((s) => (
              <Text key={s.productId}>
                <Strong>{s.product}</Strong>: {s.url ? <Link href={s.url} openNewTab>{s.title}</Link> : `${s.title} (built-in)`}
              </Text>
            ))
          )}
        </Stack>
      </Box>

      <Text>
        <Em>
          Tip: open a claim and choose <Strong>Ask the Claim Review Assistant</Strong> to talk to the Rovo agent, which uses the same checks and can post
          the assessment or request missing documents for you.
        </Em>
      </Text>
      <Button appearance="subtle" onClick={load}>
        Refresh
      </Button>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
