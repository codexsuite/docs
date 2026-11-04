## Configuration

The `codex` (web) service takes the Database, First admin, Files and keys, Worker, AI, MCP and Logging groups. The `worker` service takes Database, Files and keys, Worker, Print and Logging. Set the Print group on the worker, because it runs PDF runs and has Tectonic. The web image only needs the Print variables for Quick preview and template thumbnails. `src/docker-compose.yml` shows a working set.

| Variable | Group | What it does | Default |
|---|---|---|---|
| `CODEX_DB_CONNECTION` | Database | Npgsql connection string to the PostgreSQL 18 database. Every session runs at UTC whatever the string says. | None. Required. |
| `CODEX_DB_MIGRATE` | Database | Applies the schema and migrations at start. The app never applies the seed. Set `false` on the worker, so only the web service migrates. | `true` |
| `CODEX_ADMIN_EMAIL` | First admin | With the password, creates the first admin on boot, or gives a password to an existing user who has none. Remove both after the first sign-in. | None |
| `CODEX_ADMIN_PASSWORD` | First admin | Password for that admin. Both variables must be set, or neither takes effect. | None |
| `CODEX_BLOB_ROOT` | Files and keys | Folder for uploads, renditions and exports. The web and worker containers share it. A relative path resolves against the app folder. | None. Required. |
| `CODEX_DATA_PROTECTION_DIR` | Files and keys | Folder for the key ring that encrypts users' AI keys. Store it outside the database, so a database dump alone cannot decrypt the keys. Share it with the worker. Without it, AI keys cannot be saved. | None |
| `CODEX_ROLE` | Worker | `web` serves the app and claims no print jobs. `worker` claims render and export jobs. `all` does both in one process. | `web` |
| `CODEX_EVENTS_LISTEN` | Worker | Whether this process listens for book events from other processes. Set `false` on the worker. The image does not set it. | `true` |
| `CODEX_AI_ALLOW_LOCAL_ENDPOINTS` | AI | `true` lets users point an AI integration at `http://` and private-network addresses, such as Ollama or LM Studio. Codex reads it on every call, so a change needs no restart. | Off |
| `CODEX_TEMPLATES_ROOT` | Print | Folder of the built-in layout template packages. A relative path resolves against the app folder. | `../../templates` (`/templates` in the images) |
| `CODEX_TEMPLATE_CACHE` | Print | Where template packages are unpacked from their stored zip. | `codex-template-cache` in the temp folder |
| `CODEX_RENDER_WORK` | Print | Parent folder of the per-job work folders. | `codex-render` in the temp folder |
| `CODEX_RENDER_TIMEOUT_SECONDS` | Print | Wall-clock limit for one Tectonic run. Pandoc gets a third of it. | `300` |
| `CODEX_RENDER_MAX_PDF_MB` | Print | Largest PDF a run may write, in megabytes. A bigger PDF fails the run. | `1024` |
| `CODEX_RENDER_MAX_PROCS` | Print | Process and thread limit for a run. The kernel counts every process of the user, so a shared host needs headroom. | `4096` |
| `CODEX_TECTONIC` | Print | Path to Tectonic, or a name looked up on `PATH`. | `tectonic` |
| `CODEX_TECTONIC_CACHE` | Print | Tectonic's bundle cache. Codex mounts it read-only during a run. | `~/.cache/Tectonic` (`/var/cache/tectonic` in the worker image) |
| `CODEX_PANDOC` | Print | Path to pandoc, or a name looked up on `PATH`. | `pandoc` |
| `CODEX_SANDBOX` | Print | Path to `codex-sandbox`, or a name looked up on `PATH`. There is no way to turn the sandbox off. | `codex-sandbox` |
| `CODEX_MCP_MAX_GENERATIONS` | MCP | How many Codex drafts one MCP client may start. Codex counts each token's drafts over a sliding hour and refuses the next with `rate_limited`. | `20` |
| `CODEX_SEQ_URL` | Logging | Seq server URL. Logs go to the console only until this is set. | None |
| `CODEX_SEQ_API_KEY` | Logging | API key for Seq. | None |

Print features need Landlock ABI 4, which arrived in Linux 6.7. `codex-sandbox` refuses to run without it. On an older kernel, including WSL2 on kernel 6.6, these fail. In the web process, Quick preview and template thumbnails. In the worker, proofs, Export for printer, and Word and EPUB export. Markdown export and the source archive do not use the sandbox, so they still work.
