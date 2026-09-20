<p align="center"><img src="docs/public/playjev-golden-logo.png" width="128" alt="PlayJev golden retriever logo" /></p>

<h1 align="center">PlayJev</h1>

<p align="center"><strong>Stagehand, but with Jev.</strong><br />Browser control with decisions, not generation—a Playwright extension powered by Jev's bounded Score, Choice, and Noul primitives.</p>

<p align="center">
  <a href="https://github.com/filedcom/playjev/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/filedcom/playjev/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-6f5cff" /></a>
  <img alt="Status: experimental" src="https://img.shields.io/badge/status-experimental-f5a623" />
  <img alt="Node 20+" src="https://img.shields.io/badge/node-%3E%3D20-c9ff57?labelColor=14121f" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6" />
</p>

<p align="center">
  <a href="docs/guide/getting-started.md">Documentation</a> ·
  <a href="docs/guide/getting-started.md">Quickstart</a> ·
  <a href="docs/api/playjev.md">API</a> ·
  <a href="docs/evals/index.md">Evals</a>
</p>

---

PlayJev is a **new, experimental project** exploring a simple idea: can Jev's bounded decision primitives drive browser automation without asking a generative LLM to invent actions? The API and internals are actively evolving, so expect changes while the approach is tested against broader browser benchmarks.

PlayJev keeps the browser automation model simple: **Playwright owns execution; Jev makes bounded decisions.** It compiles a live page into a sparse, numbered YAML tree, asks Jev to rank or choose among real browser nodes, performs an ordinary Playwright operation, and verifies the result against fresh state.

- No raw HTML trees sent to Jev
- No generated selectors, JavaScript, or arbitrary action JSON
- No silent LLM fallback
- Playwright's modern locator, navigation, event, screenshot, and assertion APIs stay available
- Shadow DOM, cross-origin iframes, styled controls, and multiple tabs covered by public evals
- Bulk forms use one batched target-selection request and one verification

> [!IMPORTANT]
> PlayJev is not production-stable yet. It currently requires Chromium/CDP and access to the TypeSafe Jev API. Review confidence thresholds before using it for destructive or externally visible actions.

## Try it now

PlayJev is not published to npm yet. Clone the public repository and run its included example directly:

```bash
git clone https://github.com/filedcom/playjev.git
cd playjev
npm install
npx playwright install chromium
cp .env.example .env
```

Open `.env`, set your TypeSafe Jev API key, then run:

```bash
npm run example
```

The example opens `example.com`, asks Jev to identify and follow the explanatory link, and verifies that the destination page loaded.

To use PlayJev as a dependency before the npm release, install it from the public GitHub URL:

```bash
npm install https://github.com/filedcom/playjev.git playwright
npx playwright install chromium
```

## Quickstart

```ts
import { chromium } from "playwright";
import { playjev } from "playjev";

const browser = await chromium.launch();
const page = playjev(await browser.newPage());

await page.goto("https://example.com");
const action = await page.act("Open the documentation link");
const loaded = await page.check("Is the documentation page open?");

console.log({ action: action.success, loaded });
await browser.close();
```

The wrapped object still exposes Playwright's page and locator APIs:

```ts
await page.getByRole("button", { name: "Sign in" }).click();
await page.act("Choose the workspace with the most recent activity");
await page.screenshot({ path: "workspace.png" });
```

PlayJev's semantic `page.check(question)` replaces Playwright's legacy `page.check(selector)` shorthand. Use `page.locator(selector).check()` for deterministic checkbox interaction.

## Four browser primitives

### `check()` — browser-aware Noul

Ask a yes-or-no question and receive both the answer and probability.

```ts
const paid = await page.check("Is this invoice marked paid?");
// { answer: true, probability: 0.97 }
```

### `choose()` — browser-aware Choice

Choose only among possibilities defined by your code.

```ts
const plan = await page.choose("Which plan is selected?", {
  starter: "Starter is selected",
  pro: "Pro is selected",
  enterprise: "Enterprise is selected",
});
```

### `rate()` — browser-aware Score

Place browser state on an explicit ordered scale.

```ts
const completion = await page.rate("How complete is this form?", [
  "Empty",
  "Partially complete",
  "Complete",
]);
```

### `act()` — composed browser control

Score targets, choose a node and operation, execute it through Playwright, then verify the outcome.

```ts
const result = await page.act("Click the Medium pizza-size option", {
  minTargetConfidence: 0.7,
  minVerificationProbability: 0.6,
});
```

Caller-supplied values stay separate from natural-language instructions:

```ts
await page.act("Fill the search box", { value: "climate attribution" });
await page.act("Press Enter in the search box", { key: "Enter" });
```

## Bulk form filling

PlayJev can match and fill a whole form in one target-selection round trip:

```ts
await page.act("Complete the contact form", {
  fields: {
    "First Name": "Nunya",
    "Last Name": "Business",
    Email: "test@example.com",
    "Preferred Contact Method": "Phone",
    Message: "Hello from PlayJev",
  },
});
```

Every value comes from the caller. Jev selects controls; deterministic code performs fills, checks, unchecks, and native option selection.

## How it works

```text
┌──────────────────┐     ┌────────────────────┐     ┌─────────────────┐
│ Playwright page  │ ──▶ │ Sparse YAML state  │ ──▶ │ Jev decisions   │
│ AX + frame nodes │     │ numbered + scoped  │     │ Score / Choice  │
└──────────────────┘     └────────────────────┘     └────────┬────────┘
                                                             │
┌──────────────────┐     ┌────────────────────┐              │
│ Verified result  │ ◀── │ Playwright action  │ ◀────────────┘
│ fresh snapshot   │     │ fixed vocabulary   │
└──────────────────┘     └────────────────────┘
```

Model-facing state looks like this:

```yaml
page:
  url: https://example.test/contact
  title: Contact
nodes:
  - n: 4
    parent: 2
    type: textbox
    text: First Name
    actionable: true
  - n: 5
    parent: 2
    type: radio
    text: Phone
    state:
      - checked:false
    actionable: true
```

Internal selectors and browser node IDs never appear in that YAML. They remain in the local snapshot map used to resolve Jev's numbered choice.

## Evals

The repository includes outcome-based browser evaluations adapted from public Browserbase Stagehand fixtures, plus a fixed-answer smoke suite drawn from the official WebVoyager dataset.

| Evaluation          | What it covers                   | Result |
| ------------------- | -------------------------------- | :----: |
| Checkboxes          | Labelled native checks           |   ✅   |
| Styled radio        | Pointer-intercepting control     |   ✅   |
| Hidden input        | Dynamic reveal and fill          |   ✅   |
| Custom dropdown     | Multi-step interaction           |   ✅   |
| Shadow DOM          | Semantic target resolution       |   ✅   |
| Cross-origin iframe | Five independent fields          |   ✅   |
| Bulk iframe form    | Five controls, batched selection |   ✅   |
| Multiple tabs       | Popup adoption and navigation    |   ✅   |

Latest complete local run: **8/8 passed**. On that run, the bulk iframe form completed in **0.91s**, versus **7.41s** for five separate actions. These are observed timings, not guaranteed benchmarks.

The latest WebVoyager golden smoke run passed **4/4** live tasks across Cambridge Dictionary, ArXiv, GitHub, and Wolfram Alpha. Each case requires exact evidence from the live page and a positive Jev `check()`. This is an integration gate using official tasks, not a score on the full 643-task benchmark.

```bash
npm run eval:stagehand
EVAL_FILTER=bulk npm run eval:stagehand
npm run eval:webvoyager:golden
```

## Repository layout

```text
playjev/
├── src/
│   ├── api/            # Playwright Page integration
│   ├── browser/        # capture and sparse browser normalization
│   ├── core/           # Jev-driven control loop
│   ├── errors/         # public error classes
│   ├── jev/            # TypeSafe API client
│   ├── serialization/  # model-facing YAML
│   └── types/          # public TypeScript contracts
├── docs/               # VitePress docs and landing page
├── evals/stagehand/    # public browser outcome evaluations
├── evals/webvoyager/   # official fixed-answer golden smoke
├── examples/           # focused runnable examples
└── tests/unit/         # deterministic unit tests
```

## Development

```bash
npm install
npm run validate       # types, unit tests, package build, docs build
npm run docs:dev       # local documentation site
npm run eval:stagehand # live Jev + browser evaluations
npm run eval:webvoyager:golden # official WebVoyager golden smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Acknowledgements

PlayJev is built on [Playwright](https://playwright.dev/) and [Jev by TypeSafe](https://typesafe.ai/). Its API design is inspired by the clarity of [Stagehand](https://stagehand.dev/), but the decision architecture and public primitives are Jev-native. PlayJev is independent and is not affiliated with Browserbase or Stagehand.

## License

[MIT](LICENSE)
