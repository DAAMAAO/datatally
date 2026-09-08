import type { Snapshot } from '../../src/snapshot/types.js'

/** Deterministic three-asset fixture: single-source nlp, single-source nlp with citations, two-source audio. */
export const fixtureSnapshot: Snapshot = {
  version: '2',
  generated_at: '2026-09-06T12:00:00Z',
  assets: [
    {
      asset_id: 'stanfordnlp/imdb',
      id_type: 'hf',
      name: 'imdb',
      domain: 'nlp',
      tags: ['task_ids:sentiment-classification', 'modality:text', 'language:en'],
      description: 'Large Movie Review Dataset for binary sentiment classification of movie reviews.',
      access: 'open',
      license: null,
      verification: 'public_api',
      sources: [
        {
          source: 'huggingface',
          metrics: {
            downloads: { value: 191564, signal_type: 'deep' },
            likes: { value: 709, signal_type: 'shallow' },
          },
          fetched_at: '2026-09-06T12:00:00Z',
        },
      ],
      timeline: [
        { date: '2026-09', metric: 'downloads', value: 191564, source: 'huggingface', signal_type: 'deep' },
      ],
      citations: [],
    },
    {
      asset_id: 'rajpurkar/squad',
      id_type: 'hf',
      name: 'squad',
      domain: 'nlp',
      description: 'Stanford Question Answering Dataset for extractive question answering.',
      access: 'open',
      license: 'cc-by-sa-4.0',
      verification: 'public_api',
      sources: [
        {
          source: 'huggingface',
          metrics: {
            downloads: { value: 263988, signal_type: 'deep' },
            likes: { value: 718, signal_type: 'shallow' },
          },
          fetched_at: '2026-09-06T12:00:00Z',
        },
      ],
      timeline: [],
      citations: [
        { title: 'SQuAD: 100,000+ Questions for Machine Comprehension of Text', year: '2016', venue: 'EMNLP' },
      ],
    },
    {
      asset_id: 'org/speech-data',
      id_type: 'hf',
      name: 'speech-data',
      domain: 'audio',
      description: 'Multilingual speech recordings with transcripts.',
      access: 'open',
      license: 'cc0-1.0',
      verification: 'public_api',
      sources: [
        {
          source: 'huggingface',
          metrics: {
            downloads: { value: 1000, signal_type: 'deep' },
            likes: { value: 50, signal_type: 'shallow' },
          },
          fetched_at: '2026-09-05T12:00:00Z',
        },
        {
          source: 'datacite',
          metrics: {
            citations: { value: 42, signal_type: 'deep' },
          },
          fetched_at: '2026-09-06T12:00:00Z',
        },
      ],
      timeline: [],
      citations: [],
    },
  ],
}
