# Claim Check

Claim Check is a Forge app for insurance teams that handle claims in Jira and keep policy wordings in Confluence. It reads the
policy wording, checks each claim against it and quotes the exact clause behind every finding. A Rovo agent, the **Claim Review
Assistant**, uses the same checks to explain a claim, draft customer messages, post the assessment and request missing
documents.

The coverage decision always stays with the claims handler. Claim Check does the reading.

## What it checks

| Check | How |
| --- | --- |
| Policy period | Date of loss against the policy period on the claim |
| Waiting period | "Waiting period of N days" clauses, only for the perils they name |
| Notification deadline | "Notify us within N days/hours" clauses; police-only and medical-only deadlines are skipped when they do not apply; deadlines counted from the return home are flagged for review |
| Insured event | Matches the incident to cover clauses by peril (collision, theft, water, storm, glass, medical…) |
| Exclusions | Alcohol, unlicensed driving, commercial use, racing, wear and tear, unattended belongings, gradual leaks and more, with negation handling and the claim sentence that triggered it |
| Limits and deductible | Sum insured, peril sub-limits (glass, escape of water, belongings), single item limits, deductible waivers, indicative payable amount |
| Required documents | Parses the documents list, evaluates conditions such as "police report (for theft or damage above 1,000 USD)" and compares with the documents and attachments on the claim |

Every quote is copied from the wording, so it can be checked against the Confluence page.

## Where it appears

- **Jira issue panel "Claim Check"**: verdict, checks with clause quotes, missing documents, indicative payable amount, and buttons to post the assessment, request missing documents or open the agent.
- **Rovo agent "Claim Review Assistant"** with four actions: `assess-claim`, `get-policy-clauses`, `post-assessment`, `request-missing-documents`.
- **Jira global page "Claim Check setup"**: creates sample policy pages in Confluence and sample claims in Jira, and links your own Confluence wording to a product.

## Claim format

Claims are ordinary Jira issues with labelled lines in the description:

```
Policy number: NP-KASKO-2026-00417
Product: Motor (KASKO)
Policy period: 2026-03-01 to 2027-02-28
Date of loss: 2026-11-09
Date reported: 2026-11-10
Claimed amount: 2,400 USD
Incident: I was stopped at a red light when another car hit the rear of my vehicle...
Documents provided: claim form, driving licence copy, photos of the damage
Policy wording: https://your-site.atlassian.net/wiki/spaces/CLAIMS/pages/123456
```

Attachments count as provided documents. Without a "Date reported" line the issue creation date is used. The policy
wording is found from the "Policy wording" link, a Confluence link on the issue, the product mapping in setup, or a
built-in sample wording for motor, home and travel.

## Security

The app reads Jira and Confluence as the app, so every resolver and Rovo action first checks the requesting user's Jira
permission for that issue (`BROWSE_PROJECTS` to read, `ADD_COMMENTS` to post) with the bulk permissions API. Issue keys
from the agent are validated and fall back to the issue in context. No data leaves Atlassian: there is no egress and no
external model; the agent runs on Rovo.

## Develop

```
npm install
npm run check        # type check, unit tests, integration test with mocked Forge APIs, manifest validation
```

Deployment runs in GitHub Actions (`.github/workflows/forge.yml`) when the `FORGE_EMAIL` and `FORGE_API_TOKEN` secrets are
set. Set the `FORGE_SITE` repository variable to install on your own site, otherwise the Forge demo site is used.

## License

Apache 2.0
