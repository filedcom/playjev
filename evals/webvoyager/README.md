# WebVoyager official golden smoke

This runner executes four fixed-answer tasks from the official 643-task WebVoyager dataset across Cambridge Dictionary, ArXiv, GitHub, and Wolfram Alpha.

The snapshot is pinned to upstream commit `5a7896738c10bfb8b9edccce6bb0e0411f8ae569` from [`MinorJerry/WebVoyager`](https://github.com/MinorJerry/WebVoyager), licensed under Apache-2.0. Task wording and reference answers are reproduced for evaluation and attribution purposes.

```bash
npm run eval:webvoyager:golden
EVAL_FILTER=ArXiv npm run eval:webvoyager:golden
```

Each task must satisfy both:

1. exact outcome evidence read from the live page; and
2. a positive PlayJev `check()` over a fresh normalized browser snapshot.

The runner saves a screenshot and `results.json` under `eval-results/webvoyager/`.

This smoke suite is not presented as a score on all 643 WebVoyager tasks. It is a reproducible, fixed-answer integration gate using official tasks without an external vision judge.
