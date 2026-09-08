# DataTally — Publishing & Release Notes

**Date**: 2026-09-08 · **Current version**: 0.1.2 (0.1.0 and 0.1.1 published; 0.1.2 tarball built, publish pending re-login)

## Changelog

### 0.1.2 — expanded catalog & multi-source coverage

- Catalog queries in the refresh pipeline: extra keyword/tag-filter searches on Hugging Face (`DEFAULT_QUERIES` — currently `task_ids:sentiment-classification`), tried after the famous list and before the top-downloads sweep.
- ModelScope mirror discovery upgraded to cross-owner **name search** (exact id / exact short-name suffix only — keyword proximity never counts as attribution), with the fixed-owner probes as fallback.
- GitHub curated map expanded to 6 canonical repos (voxpopuli, common_voice, tweet_eval, mteb, gsm8k, glue) — each verified to exist before mapping.
- Seed expanded to 25 assets: **17 multi-source** (6 with three sources) and 7 sentiment-classification datasets.
- Domain inference hardened: explicit `modality:` tags win over task words ("hate-speech-detection" is a TEXT task and no longer misfires as audio).
- Test suite grew to 59 tests.

### 0.1.1 — multi-source adapters

- Four public-source adapters (`src/snapshot/fetchers/`): Hugging Face (incl. model uses), ModelScope mirror probing, DataCite citation counts, GitHub stars/forks/commits behind a curated dataset→repo map.
- `datatally refresh` CLI command: re-fetches all four sources into a new snapshot (+ `raw_dump.json` audit file). Channels via `DATATALLY_HF_BASE` / `DATATALLY_MODELSCOPE_BASE` / `DATATALLY_GITHUB_TOKEN`.
- Provenance hardening: `model_uses` is exact below the scan cap and recorded as `model_uses_min` (honest lower bound) at the cap — never a rounded exact number.
- Seed re-fetched live: 5/10 assets now multi-source (imdb/squad/mnist ← ModelScope mirrors; common_voice/voxpopuli ← curated GitHub repos). Test suite grew to 51 tests.

### 0.1.0 — initial release

- Published to npm as `datatally@0.1.0` (2026-09-08); three tools, strict loader, CLI, 34 tests.

## What has been validated (this session, real runs)

| Check | Method | Result |
| --- | --- | --- |
| Typecheck | `tsc --noEmit` (strict, noUncheckedIndexedAccess, verbatimModuleSyntax) | ✅ clean |
| Unit tests (search/profile/compare/loader/recorded goldens) | `node --test` on compiled output | ✅ 34/34 |
| Keyless drive test | real `ctx.tools.execute` pipeline (`ToolRuntime` + plugin fiber) | ✅ all three tools + loud missing-asset error |
| CLI | `datatally profile/search/compare` against the real seed | ✅ |
| Package | `npm pack` → `datatally-0.1.0.tgz` (25 files, ~17 KB) | ✅ |
| Install channel | `dsh plugin --profile web add <tarball>` in an isolated profile (`DSH_HOME` redirect) | ✅ package listed as a **bundle** in `dsh.profile.bundles` |
| Installed-package runtime | smoke script loading `datatally` from the profile's node_modules with peers provided by the deployment set | ✅ SMOKE OK (bundled-seed fallback included) |

The full pipeline — repo → tarball → `dsh plugin add` → bundle activation → tools executing — is proven end to end.

## What still needs YOU (credentials / accounts)

1. **npm publish** — ✅ done (2026-09-08): `datatally@0.1.0` is live on registry.npmjs.org under `daaaamao`, verified installable via the documented command. For future versions: `npm login --auth-type=web` (or a granular bypass-2FA token), then `npm publish --access public`.

2. **GitHub repository** — https://github.com/DAAMAAO/datatally · status: ✅ initialized and pushed (2026-09-08, via the Git Data API). Remaining manual touches: set the **`dsh-plugin`** topic in the repo About (if not applied by API) and link datatally.xyz.

3. **First real E2E** — after publishing:
   ```bash
   dsh plugin --profile web add datatally
   dsh web
   ```
   then ask: *"Find datasets for sentiment analysis and compare the two most used ones."*

## Environment quirks discovered (documented for future contributors)

- The dev sandbox blocks Windows schannel TLS and child-process spawns with piped stdio. Workarounds used: Node/OpenSSL for HTTPS, `npm install --no-bin-links --ignore-scripts`, `node --test --test-isolation=none`.
- `pnpm` (required by `dsh plugin`) was run via a corepack shim with `COREPACK_HOME` and `LOCALAPPDATA` redirected into the workspace; `pnpm-workspace.yaml` needed an `allowBuilds` entry per native package.
- The profile's `autoInstallPeers: false` means plugin **peer** packages must already exist in the deployment — identical to the official dsh tool plugins' convention (they ship the same way).

## Known scope notes (V0.1.1)

- 5/10 seed assets are single-source (marked per asset, never hidden): the rest lack ModelScope mirrors, card DOIs, or curated GitHub repos. DataCite fires only when a dataset card carries a DOI; GitHub only for the curated map (attribution safety > coverage).
- ModelScope mirror counts and hf-mirror counts are each mirror's own index; provenance (`fetched_at`) is exact either way, and per-source separation keeps every number attributable.
- `presentCall`/`presentResult` UI cards ship as generic cards (spec-compliant); richer cards are additive.
