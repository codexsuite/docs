# Hosting checklist

This is the one-time setup the repository owner does. The site is built by GitHub Actions and published to Cloudflare Pages with Direct Upload. The workflow is `.github/workflows/deploy.yml`. It follows the pattern of the `codexsuite.app` deploy workflow.

Current state: the Pages project, the custom domain and the organisation secrets exist. Steps 6 and 7 are open: the ruleset waits for the first push to `main`, and `codex-worker` is still private. The other steps stay here so the setup can be repeated or audited.

## What the workflow uses

| Name | Kind | Where it is set |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Organisation secret on `codexsuite`, shared with `codexsuite/docs` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Organisation secret on `codexsuite`, shared with `codexsuite/docs` |
| `production` | Environment | Repository `codexsuite/docs`, created by the first deploy run if absent |
| `codex-docs` | Pages project | Passed as `--project-name codex-docs` |

`deploy.yml` reads no other secret. `GITHUB_TOKEN` needs only `contents: read`.

## Steps

1. Create the Pages project.
   - Choose Direct Upload. You cannot switch a Direct Upload project to Git integration later.
   - Name it `codex-docs` and set the production branch to `main`.
   - The name `codex-docs.pages.dev` was taken, so the project is at `codex-docs-72v.pages.dev`. Deploys still use `--project-name codex-docs`.
   - Dashboard: Workers & Pages, Create application, drag and drop. Or run `npx wrangler pages project create`.
   - Source: https://developers.cloudflare.com/pages/get-started/direct-upload/

2. Create a scoped API token.
   - Cloudflare dashboard, Manage Account, Account API Tokens, Create Token, Custom token.
   - Give it one permission: Account, Cloudflare Pages, Edit. Limit it to this account.
   - Copy the secret when it is shown. Cloudflare shows it once.
   - Sources: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ and https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

3. Add the two secrets.
   - On the `codexsuite` organisation, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and give the `docs` repository access to them.
   - Find the account ID on a zone's Overview page, in the API section of the right-hand menu.
   - Never paste either value into an issue, a comment or a file in this repository.
   - Source: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

4. Create the `production` environment.
   - Repository Settings, Environments, New environment, name it `production`.
   - Source: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment

5. Attach `docs.codexsuite.app`.
   - Workers & Pages, the `codex-docs` project, Custom domains, Set up a domain, enter `docs.codexsuite.app`.
   - The `codexsuite.app` zone is on Cloudflare, so confirming the DNS record adds a proxied CNAME to `codex-docs-72v.pages.dev`.
   - Do this in the Pages dashboard before you add the CNAME by hand. A CNAME added first returns a 522 error.
   - Source: https://developers.cloudflare.com/pages/configuration/custom-domains/

6. Add the `main` ruleset, after the first push to `main`.
   - Repository Settings, Rules, Rulesets, New ruleset, New branch ruleset. Target `main` and set enforcement to Active.
   - Turn on Require status checks before merging, and add these checks by their exact names:
     - `build` (workflow Build)
     - `Search and 390px width` (workflow Site checks)
     - `External links` (workflow Site checks)
     - `Unslop copy and repository documents` (workflow Site checks)
   - A check must have run once before GitHub offers its name.
   - Do not add `paths-ignore` to any of these workflows. A skipped workflow never reports its check, and the ruleset then blocks the merge.
   - Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

7. Make the worker image public.
   - GitHub, the `codexsuite` organisation, Packages, `codex-worker`, Package settings, Danger Zone, Change visibility, Public.
   - Do this before the quick start is tested. The `codex` image is already public, and anonymous pulls of `codex-worker` return 403 until you change it.
   - You cannot make a public package private again.
   - Source: https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility

## Check it worked

- Run the Deploy site workflow from the Actions tab with Run workflow. It should end green and print a deployment URL.
- Open https://docs.codexsuite.app. The certificate can take a few minutes after the domain is attached.
- Open a pull request and confirm all four required checks report.
