# Codex documentation

Source of the Codex documentation site at https://docs.codexsuite.app. The site explains how to install, configure and use Codex, and how to connect an agent to it over MCP. It covers only what is on the main branch of [codexsuite/codex](https://github.com/codexsuite/codex).

This site is not affiliated with OpenAI's Codex coding agent.

## Run the site locally

You need Node 24.22.0 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm dev
```

The dev server prints its address, usually http://localhost:4321.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Serves the site with live reload. |
| `pnpm build` | Builds `dist/` and runs the links validator. |
| `pnpm check` | Runs `astro check`, every page check and the checks on the repository documents. |
| `pnpm check:page <slug>` | Checks one page in about a second. Use `repo-docs` to check README, AGENTS.md and `docs/*.md`. |
| `pnpm check:final` | Fails on stub markers, missing screenshots and unlisted TODO comments. It does not run the other checks. |
| `pnpm test` | Runs the unit tests. Run `pnpm build` first. |

## Writing pages

Read [AGENTS.md](AGENTS.md) before you write or edit a page. It has the page rules and the contracts between the scripts. All prose follows [docs/unslop.md](docs/unslop.md).

## Hosting

Pushes to `main` deploy to Cloudflare Pages through `.github/workflows/deploy.yml`. [docs/hosting.md](docs/hosting.md) lists the one-time setup the repository owner does.

## Licence

MIT. See [LICENSE](LICENSE).
