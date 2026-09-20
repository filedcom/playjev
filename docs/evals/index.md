# Evaluation suite

PlayJev includes runnable browser evaluations based on public Stagehand fixtures and fixed-answer tasks from the official WebVoyager dataset. They test actual browser outcomes rather than accepting a plausible model response.

## Current coverage

| Case                | Capability                             | Latest result |
| ------------------- | -------------------------------------- | ------------- |
| Checkboxes          | Multiple labelled checks               | Pass          |
| Styled radio        | Pointer-intercepting native input      | Pass          |
| Hidden input        | Fill after dynamic reveal              | Pass          |
| Custom dropdown     | Multi-step selection                   | Pass          |
| Shadow DOM          | Semantic target through shadow root    | Pass          |
| Cross-origin iframe | Five separate field actions            | Pass          |
| Bulk iframe form    | Five controls, one batched selection   | Pass          |
| Multiple tabs       | Repeated popup adoption and navigation | Pass          |

The last full local run passed **8/8**. The bulk iframe form completed in **0.91 seconds** and the equivalent five separate actions completed in **7.41 seconds** on that run. Timings are observational, not a guaranteed benchmark.

## WebVoyager golden smoke

| Official task           | Capability                           | Latest result | Jev probability |
| ----------------------- | ------------------------------------ | :-----------: | :-------------: |
| Cambridge Dictionary--0 | Search, pronunciation and definition |     Pass      |      0.98       |
| ArXiv--10               | Two-link documentation traversal     |     Pass      |      0.98       |
| GitHub--3               | Pricing comparison and arithmetic    |     Pass      |      0.91       |
| Wolfram Alpha--0        | Query input and image-alt result     |     Pass      |      0.98       |

The complete live run on September 20, 2026 passed **4/4**. The tasks and reference answers come from [`MinorJerry/WebVoyager`](https://github.com/MinorJerry/WebVoyager) at commit `5a7896738c10bfb8b9edccce6bb0e0411f8ae569` (Apache-2.0).

A case passes only when deterministic evidence extracted from the live page matches the reference and a fresh sparse snapshot produces a positive PlayJev `check()`. This suite is a reproducible integration gate, not a reported score on all 643 WebVoyager tasks and not directly comparable to the paper's multimodal evaluator.

## Run locally

```bash
cp .env.example .env
# Set TYPESAFE_API_KEY
npm run eval:stagehand
npm run eval:webvoyager:golden
```

Run one case:

```bash
EVAL_FILTER=bulk npm run eval:stagehand
EVAL_FILTER=ArXiv npm run eval:webvoyager:golden
```

Reuse a Chrome instance exposing CDP on port 9222:

```bash
npm run eval:stagehand:reuse
```

## Methodology

Each case opens a public fixture, performs one or more PlayJev calls, and reads the resulting DOM state with exact Playwright locators. A case passes only when the expected checkbox state, field value, navigation URL, visible message, or popup outcome is present.

The suite is adapted from public Browserbase Stagehand act tasks. Stagehand and Browserbase are trademarks of their respective owners; this repository is independent and unaffiliated.
