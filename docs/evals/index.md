# Evaluation suite

PlayJev includes runnable browser evaluations based on public Stagehand fixtures. They test actual browser outcomes rather than accepting a plausible model response.

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

## Run locally

```bash
cp .env.example .env
# Set TYPESAFE_API_KEY
npm run eval:stagehand
```

Run one case:

```bash
EVAL_FILTER=bulk npm run eval:stagehand
```

Reuse a Chrome instance exposing CDP on port 9222:

```bash
npm run eval:stagehand:reuse
```

## Methodology

Each case opens a public fixture, performs one or more PlayJev calls, and reads the resulting DOM state with exact Playwright locators. A case passes only when the expected checkbox state, field value, navigation URL, visible message, or popup outcome is present.

The suite is adapted from public Browserbase Stagehand act tasks. Stagehand and Browserbase are trademarks of their respective owners; this repository is independent and unaffiliated.
