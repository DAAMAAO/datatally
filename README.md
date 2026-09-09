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

The agent will call `search_assets`, then `compare_assets`, and answer with sourced usage data. An actual session transcript:

**User**：帮我找情感分析的数据集，然后对比两个使用最多的

**Agent**（调 `search_assets("sentiment")`）：

> - imdb (stanfordnlp/imdb) | domain: nlp | deep: downloads 195,669 | shallow: likes 725 | fetched_at: 2026-09-08T14:35:50Z | snapshot: v2
> - glue (nyu-mll/glue) | deep: downloads 826,859 … （共 8 个命中）

**Agent**（调 `compare_assets("nyu-mll/glue", "stanfordnlp/imdb")`）：

> - downloads [deep]: 791,429 vs 197,595 | same_source: true | same_access: true
> - forks [deep]: 178 vs 0 | same_source: false | same_access: true
> - likes [shallow]: 741 vs 722 | same_source: true | same_access: true
> note: cross-source metrics are not directly comparable

**Agent** 的最终回答只陈述记录（引用次数、来源、抓取时间），**不下"哪个更好"的结论**——判断留给用户。

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
datatally export nyu-mll/glue      # AI-BOM fact entry: pure facts, no conclusions
datatally catalog                  # per-sector distributions (multi-source rate, model-use density)
datatally refresh                  # re-fetch the four public sources into a new snapshot
datatally refresh --query protein  # domain-focused catalog: any keyword, no code change
datatally refresh --filter task_ids:sentiment-classification --limit 30
datatally refresh --query CBAM --block yolov8n --block checkpoints   # P0 candidate filter
# snapshot location: --snapshot <path> or DATATALLY_SNAPSHOT env
```

`--query <text>` / `--filter <tag>` are repeatable and replace the shipped default queries; when given, the queried candidates lead the catalog. `--block <word>` / `--allow <word>` (repeatable) reject discovered candidates whose id carries the exact token; every rejection is logged with the rule and the triggering word. `refresh` reads `data/curated.json` next to the snapshot when present (`--no-curation` to skip).

---

## Development

```
src/
├── index.ts              # plugin entry: Config + apply + tool registration
├── core/                 # pure query logic (no harness deps) + text rendering
├── tools/                # one defineTool per file: schema + execute + render + UI cards
├── snapshot/             # loader (strict validation, fail-loud), types, AssetId brand
│   └── fetchers/         # four-source refresh pipeline (HF/ModelScope/DataCite/GitHub)
├── schema/               # strict snapshot validator
cli/main.ts               # CLI (same core + refresh)
test/                     # 51 tests: unit + fetchers + pipeline + keyless drive + goldens
data/snapshot_v2.json     # seed snapshot (10 real HF datasets, multi-source)
cordis.patch.yml          # bundle patch (installed) / dev patch (checkout)
```

- `npm run typecheck` — strict TypeScript, no errors
- `npm test` — builds, then runs 34 tests including keyless drive tests through the real `ctx.tools.execute` pipeline
- Peer packages (`@deepseek-ai/cordis`, `dsh-tools`, `dsh-llm`) are provided by the DeepSeek Harness deployment, exactly like the official dsh tool plugins.

---

## Data provenance

The seed snapshot carries **real public usage data** for **126 open Hugging Face datasets across 9 industry sectors** — core (famous benchmarks + sentiment classics), protein, agri-commodity, auto-sales, aviation, insurance-weather, carbon, power, and logistics — aggregated from up to four public sources (fetched 2026-09-08). Each asset carries an optional `sector` label, searchable like any other field:

| Source | Signals |
|--------|---------|
| Hugging Face Hub | downloads, likes, model uses (deep / shallow / deep) |
| ModelScope | downloads, likes (mirrored datasets, probed by short name) |
| DataCite | citation counts (when the dataset card carries a DOI) |
| GitHub | stars (shallow), forks/commits (deep) — only for curated dataset→repo mappings whose repo is the dataset's canonical release home (see `data/curated.json`) |

Provenance discipline: every metric carries its `source` + `fetched_at`; `model_uses` is exact below the scan cap and recorded as `model_uses_min` (an honest lower bound) at the cap; single-source assets are marked explicitly ("single source only — multi-source aggregation not met"); missing provenance is never fabricated. Hugging Face numbers were fetched through the hf-mirror.com mirror (counts are the mirror's index, which can differ from hf.co's counters); set `DATATALLY_HF_BASE` to refresh from a different channel.

**On calibers, stated neutrally**: a platform's own statistics are one caliber among several. Each caliber is recorded separately with its source and fetch time, and a profile that aggregates several calibers is more complete than one that does not — no platform's statistics are attacked or preferred; the record simply states what each caliber shows.

Refresh the seed yourself (four-source pipeline, same core as the plugin):

```bash
datatally refresh --snapshot ./data/snapshot_v2.json
# env: DATATALLY_HF_BASE (default https://huggingface.co),
#      DATATALLY_MODELSCOPE_BASE (default https://modelscope.cn),
#      DATATALLY_GITHUB_TOKEN (optional, raises the GitHub rate limit)
```

---

## License

MIT

## Contributing

Issues and pull requests welcome. Please keep contributions within the stated scope: **recording usage signals, not interpreting them.**
