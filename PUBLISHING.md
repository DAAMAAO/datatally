# DataTally — Publishing & Release Notes

**Date**: 2026-09-08 · **Version**: 0.1.0 · **Status**: publish-ready, all in-repo validations green

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

## Known scope notes (V0.1)

- Single source (huggingface) for all seed assets — marked per asset, never hidden. DataCite/GitHub adapters are future work; the fetcher script already reserves the DataCite path.
- `presentCall`/`presentResult` UI cards ship as generic cards (spec-compliant); richer cards are additive.
- Mirror-based seed counts may differ from hf.co counters; provenance (`fetched_at`) is exact either way.
