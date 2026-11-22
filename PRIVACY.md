# Privacy policy

Last updated: 22 November 2026

Claim Check is a Forge app for Jira and Confluence, developed by Ulukman Ismailov. This policy explains what data the app uses and where it goes.

## What the app reads

When a user opens the Claim Check panel on a Jira issue, uses the Claim Review Assistant in Rovo, or opens the setup page, the app reads, on the Atlassian site where it is installed:

- the Jira issue the user is working on (summary, description, creation date, attachment names and remote links);
- the Confluence page that holds the policy wording for that claim;
- for the setup page, the list of Jira projects and Confluence spaces the user can see.

This data is used only to calculate the checks shown to the user. It is processed inside Atlassian's Forge platform.

## What the app stores

The app stores one record in Forge storage on Atlassian's infrastructure: the list of insurance products and the Confluence page linked to each one (product name, page ID, page title and URL). It does not store claim contents, names, account IDs or any other personal data.

## What the app writes

When a user asks for it, the app adds a comment and a label to a Jira issue, and the setup page can create sample Confluence pages and Jira issues. These writes are made with the user's own permissions and stay on the user's site.

## What leaves Atlassian

Nothing. The app makes no calls to external servers, uses no external AI model, and has no analytics or tracking. The Rovo agent runs on Atlassian Rovo under Atlassian's own terms.

## Logs

If an error happens, a technical error message is written to Forge logs. The developer can see these logs only for sites whose administrators allow log access, as described in Atlassian's Forge documentation.

## Deleting data

Uninstalling the app removes its Forge storage according to the Forge platform's data retention rules. Comments, labels and sample content the app created on your site stay there until you delete them.

## Contact

Questions about privacy: open an issue at https://github.com/uluk001/claimcheck/issues
