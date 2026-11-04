# Hosting checklist

GitHub Actions builds the site and publishes it to Cloudflare Pages with Direct Upload. The workflow is `.github/workflows/deploy.yml`. It follows the pattern of the `codexsuite.app` deploy workflow.

Set up on 4 Nov 2026:

- The repository `codexsuite/docs`, public, with homepage https://docs.codexsuite.app.
- The Pages project `codex-docs`, at `codex-docs-72v.pages.dev`.
- A proxied CNAME for `docs.codexsuite.app`, and the same name as a custom domain on the project.
- The organisation secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, shared with the repository.

One step is left, the `main` ruleset in step 6. The owner adds it in wave 2, after the quick-start check has reported on pull request 1. Steps 1 to 5 and 7 stay below as a record, so you can repeat or audit the setup.

## What the workflow uses

| Name | Kind | Where it is set |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Organisation secret on `codexsuite`, shared with `codexsuite/docs` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Organisation secret on `codexsuite`, shared with `codexsuite/docs` |
| `production` | Environment | Repository `codexsuite/docs`, created by the first deploy run if absent |
| `codex-docs` | Pages project | Passed as `--project-name codex-docs` |

`deploy.yml` reads no other secret. `GITHUB_TOKEN` needs only `contents: read`.

## Steps

1. Create the Pages project. Done on 4 Nov.
   - Choose Direct Upload. You cannot switch a Direct Upload project to Git integration later.
   - Name it `codex-docs` and set the production branch to `main`.
   - The name `codex-docs.pages.dev` was taken, so the project is at `codex-docs-72v.pages.dev`. Deploys still use `--project-name codex-docs`.
   - Dashboard: Workers & Pages, Create application, drag and drop. Or run `npx wrangler pages project create`.
   - Source: https://developers.cloudflare.com/pages/get-started/direct-upload/

2. Create a scoped API token. Done on 4 Nov.
   - Cloudflare dashboard, Manage Account, Account API Tokens, Create Token, Custom token.
   - Give it one permission: Account, Cloudflare Pages, Edit. Limit it to this account.
   - Copy the secret when it is shown. Cloudflare shows it once.
   - Sources: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ and https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

3. Add the two secrets. Done on 4 Nov.
   - On the `codexsuite` organisation, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and give the `docs` repository access to them.
   - Find the account ID on a zone's Overview page, in the API section of the right-hand menu.
   - Never paste either value into an issue, a comment or a file in this repository.
   - Source: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

4. Create the `production` environment. The first deploy run creates it if it is absent, so this step needs no action.
   - Repository Settings, Environments, New environment, name it `production`.
   - Source: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment

5. Attach `docs.codexsuite.app`. Done on 4 Nov.
   - Workers & Pages, the `codex-docs` project, Custom domains, Set up a domain, enter `docs.codexsuite.app`.
   - The `codexsuite.app` zone is on Cloudflare, so confirming the DNS record adds a proxied CNAME to `codex-docs-72v.pages.dev`.
   - Do this in the Pages dashboard before you add the CNAME by hand. A CNAME added first returns a 522 error.
   - Source: https://developers.cloudflare.com/pages/configuration/custom-domains/

6. Add the `main` ruleset. Open, for the owner in wave 2.
   - Repository Settings, Rules, Rulesets, New ruleset, New branch ruleset. Target `main` and set enforcement to Active.
   - Turn on Require status checks before merging, and add these two checks by their exact names:
     - `build` (workflow Build)
     - `Search and 390px width` (workflow Site checks)
   - `External links` is not required, because a third-party site going down would block every merge. It still runs on pull requests and weekly.
   - `Unslop copy and repository documents` is not required, because `pnpm check` in `build` covers it. The job stays.
   - Later workflows stay out of the required list too. The quick-start check pulls the `latest` image, so a change to the product image could block a docs merge.
   - A required check must run on every pull request, so do not add `paths` or `paths-ignore` to its workflow. A job that a filter skips never reports, stays pending and blocks the merge.
   - Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

7. Make the worker image public. Done on 4 Nov.
   - GitHub, the `codexsuite` organisation, Packages, `codex-worker`, Package settings, Danger Zone, Change visibility, Public.
   - Anonymous pulls of a private package return 403, so the quick start needs both images public.
   - You cannot make a public package private again.
   - Source: https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility

## Check it worked

- Run the Deploy site workflow from the Actions tab with Run workflow. It should end green and print a deployment URL.
- Open https://docs.codexsuite.app. The certificate can take a few minutes after the domain is attached.
- Open a pull request and confirm the two required checks report.
