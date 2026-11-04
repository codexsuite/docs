# Agent instructions

This repository is the public documentation site for Codex, built with Astro Starlight and deployed to https://docs.codexsuite.app. Read this file before you change anything.

## Prose rules

All prose follows `docs/unslop.md`. That covers pages, alt text, READMEs, comments in examples and commit messages. `pnpm check:page` fails on the mechanical rules. Read your text again for the rules a script cannot check, mainly rules 27 and 32. A sentence that could appear unchanged in another product's docs gets cut.

Do not add an exemption for a page or a word. Fix the text.

## Page rules

- Run it, don't build it. Pages are for people who set up and use Codex. Leave out building from source, cloning the product repository, the dev database and seed, running tests, contributing and code layout. Every install path uses the published images.
- Document only what is on the main branch of `codexsuite/codex`. Mark anything planned with a one-line `:::note[Planned]` aside.
- Every claim traces to a product source. Check it against the code, not against a plan or an old issue.
- Write short sentences in the second person, task first.
- Link to GitHub only with `blob/main` or `raw/main` URLs.
- Never change a page's slug or title. Never edit `src/sidebar.ts`, `src/pagemap.ts`, `astro.config.mjs`, `package.json` or `pnpm-lock.yaml` without the conductor's approval.
- Import image names from `src/config/site.ts`. Import example files with `?raw`.
- Working with Codex pages use `docs/running-example.md` and invent nothing else. No real book text, quotes or people.
- A page's frontmatter description matches its record in `src/pagemap.ts`.
- Shot steps wait on a locator and never on a fixed sleep. Steps must be safe to repeat.
- Do not print credentials, container config or auth responses in a script or a log. Print status codes and names.

## Check commands

| Command | When to run it |
| --- | --- |
| `pnpm check:page <slug>` | While you write. Runs in about a second without a build. |
| `pnpm check:page repo-docs` | After you edit README, AGENTS.md or `docs/*.md`. |
| `pnpm build` | Once before you finish. Runs the links validator. |
| `pnpm check` | Before you push. Runs `astro check`, all page checks and the repository document checks. |
| `pnpm check:final` | Fails on stub markers, missing screenshots and unlisted TODO comments. |
| `pnpm test` | After `pnpm build`, because one test reads `dist/`. |

Capture, the quick-start check and the browser checks run in hosted CI. `pnpm shots:ci --page <key>` dispatches the capture workflow and downloads the images.

## Contracts

The numbers match the plan. Only the conductor changes a contract. If the other side is wrong, fix your side or stop and report.

1. Page map. `src/pagemap.ts` has one record per page: `key`, `slug`, `title`, `description`, `group`, `order`. Each page is `src/content/docs/<slug>.mdx`. Internal links are root-relative with a trailing slash.
2. Frozen files. `src/sidebar.ts`, `src/pagemap.ts`, `astro.config.mjs`, `package.json` and `pnpm-lock.yaml`.
3. Screenshots. `<Shot name="<key>-<step>" alt="..." />` shows `src/assets/shots/<name>-light.webp` and `<name>-dark.webp`.
4. Shot specs. `scripts/shots/specs/<key>.ts` exports `shots: ShotSpec[]`, typed in `scripts/shots/types.ts`.
5. Demo seed. `scripts/shots/seed.ts` exports `seedDemo` and `restoreFixtures`. It composes `seed/structure.ts` and `seed/references.ts` and uses the REST API only.
6. Image names. `src/config/site.ts` exports the two image names. Examples read `${CODEX_IMAGE:-...}` and `${CODEX_WORKER_IMAGE:-...}`.
7. Configuration. The product README table and `/start/configuration/` must list the same variables and groups. `scripts/check-config.ts <product-readme>` checks it.
8. Examples. `examples/quickstart/` and `examples/caddy/`.
9. Checks. The page checks are the modules listed in `scripts/checks/page.ts`.
10. Capture in CI. Both themes at 1440x900, webp under 150 KB.
11. Stack. `scripts/lib/stack.ts` exports `up(opts)` and `down()`.
12. Running example. `docs/running-example.md`.
13. Diagrams. One SVG per diagram at `src/assets/diagrams/<key>.svg`, no Mermaid.
14. Tool reference. `pnpm tools:gen <product>` writes `src/content/docs/agents/tools.mdx`. Do not edit that file by hand.

## Git

Start every commit message with the task key. Pull with rebase before you push. Never force-push or amend pushed commits.

## This host

The development host has 7 GB of RAM and no Docker. Wrap builds in `flock ~/.local/codex-docs-build.lock timeout 300` so two builds never run at once.
