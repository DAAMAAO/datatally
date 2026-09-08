# DataTally

**Official domain: https://datatally.xyz**

**Help AI find the most valuable data.**
帮助 AI 找到最值钱的数据。

**DataTally records. AI judges.**

*For AI, "valuable" means worth the compute — the cost of using data is time and tokens, not money. DataTally helps AI find data worth using.*

DataTally is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that aggregates public usage signals of data assets — downloads, citations, stars — into a single, verifiable profile.

---

## What it does

Data has no intrinsic properties. A byte count says nothing about value. The only real signal of a data asset's value is **how it has been used** — by whom, how often, and with what results. DataTally collects those usage signals from public sources and presents them in one place:

| Tool | What it does |
|------|-------------|
| `search_assets` | Search data asset profiles by keyword or domain |
| `get_asset_profile` | Get the full usage profile of one asset: per-source metrics, timeline, citations |
| `compare_assets` | Compare two assets across dimensions (within the same signal layer) |

Every metric carries its source and fetch time. Nothing is interpreted. Nothing is ranked. **DataTally records; you judge.**

DataTally **never**: computes value, weighs signals, ranks assets, recommends "which is better", sells data, or fabricates numbers. The record is DataTally's. The interpretation is the user's.

---

## Signal layers

- **Deep signals** — actual use: downloads, citations, forks, commits
- **Shallow signals** — interest only: stars, likes ("bookmarked" ≠ "used")

Layers describe behavior versus interest — **not a strength scale**. Comparisons are only made within the same layer. A star is not a download. Missing provenance is marked explicitly — a single-source asset says so in its profile summary; a missing license surfaces as `null`, never a fabricated default.

---

## Install

Requires DeepSeek Harness installed (`dsh` on your PATH) and Node.js ≥ 22.19.

```bash
dsh plugin --profile web add datatally
dsh web
```

### From a checkout (development)

```bash
git clone https://github.com/DAAMAAO/datatally.git
cd datatally-plugin
npm install
npm run typecheck
npm test
```

Load it into a running dsh for end-to-end testing:

```bash
dsh web --patch ./cordis.patch.yml
# (replace the `name` in cordis.patch.yml with the absolute path to src/index.ts)
```

### Use it

Ask your agent:

> "Find datasets for sentiment analysis and compare the two most used ones."

The agent will call `search_assets`, then `compare_assets`, and answer with sourced usage data.

---

## Configuration

The plugin ships with defaults; override per row in your profile patch:

| Field | Default | Meaning |
|-------|---------|---------|
| `snapshotPath` | `./data/snapshot_v2.json` | Local snapshot file. Relative paths resolve against the process cwd first, then against the package's bundled `data/` seed. |
| `maxResults` | `20` | Search result cap (the `limit` parameter is clamped to it). |
| `enableCitationFields` | `true` | Include the `citations` field in profiles. |

---

## Snapshot format

DataTally reads usage data from a **local, self-owned** JSON file (version 2). Replace the seed by pointing `snapshotPath` at your own file:

```json
{
  "version": "2",
  "generated_at": "2026-09-06T12:00:00Z",
  "assets": [
    {
      "asset_id": "stanfordnlp/imdb",
      "id_type": "hf",
      "name": "imdb",
      "domain": "nlp",
      "access": "open",
      "license": "other",
      "verification": "public_api",
      "sources": [
        {
          "source": "huggingface",
          "metrics": {
            "downloads": { "value": 191564, "signal_type": "deep" },
            "likes": { "value": 709, "signal_type": "shallow" }
          },
          "fetched_at": "2026-09-08T12:32:11.463Z"
        }
      ],
      "timeline": [],
      "citations": []
    }
  ]
}
```

Schema principles: structured from day one · every field has a source · evidence attributes are facts, not interpretations · snapshots are self-owned · machine-readable first. Unknown fields (including the legacy `asset_class`) are rejected loudly; v1 snapshots are rejected with a migration pointer.

---

## CLI

The same core, in a terminal (the thin-wrapper form over the plugin core):

```bash
datatally profile stanfordnlp/imdb
datatally search sentiment --domain nlp --limit 5
datatally compare HuggingFaceFW/fineweb allenai/c4
# snapshot location: --snapshot <path> or DATATALLY_SNAPSHOT env
```

---

## Development

```
src/
├── index.ts              # plugin entry: Config + apply + tool registration
├── core/                 # pure query logic (no harness deps) + text rendering
├── tools/                # one defineTool per file: schema + execute + render + UI cards
├── snapshot/             # loader (strict validation, fail-loud), types, AssetId brand
├── schema/               # strict snapshot validator
cli/main.ts               # CLI (same core)
test/                     # unit + keyless drive tests (ctx.tools.execute) + recorded goldens
data/snapshot_v2.json     # seed snapshot (10 real HF datasets)
cordis.patch.yml          # bundle patch (installed) / dev patch (checkout)
```

- `npm run typecheck` — strict TypeScript, no errors
- `npm test` — builds, then runs 34 tests including keyless drive tests through the real `ctx.tools.execute` pipeline
- Peer packages (`@deepseek-ai/cordis`, `dsh-tools`, `dsh-llm`) are provided by the DeepSeek Harness deployment, exactly like the official dsh tool plugins.

---

## Data provenance

The seed snapshot carries **real public usage data** for 10 open Hugging Face datasets, fetched 2026-09-08 via the Hugging Face public API (fetched through the hf-mirror.com mirror — counts are the mirror's own index, which can differ from hf.co's counters; every number carries its real `fetched_at`). DataCite/GitHub adapters are out of scope for this environment; single-source assets are marked explicitly. A refresh script lives in the companion prototype workspace (`datatally/scripts/fetch-seed.js`).

---

## License

MIT

## Contributing

Issues and pull requests welcome. Please keep contributions within the stated scope: **recording usage signals, not interpreting them.**
