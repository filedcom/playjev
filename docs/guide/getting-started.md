# Getting started

PlayJev wraps an existing Playwright `Page`. It does not replace Playwright's browser lifecycle, locator API, events, or assertions.

## Requirements

- Node.js 20 or newer
- A Chromium-based browser supported by Playwright
- A TypeSafe API key with access to Jev

## Install

```bash
npm install github:a7ul/playjev playwright
npx playwright install chromium
```

Set your API key outside source control:

```bash
export TYPESAFE_API_KEY="your-key"
```

## First automation

```ts
import { chromium } from "playwright";
import { playjev } from "playjev";

const browser = await chromium.launch();
const page = playjev(await browser.newPage());

await page.goto("https://example.com");

const action = await page.act("Open the documentation link");
if (!action.success) throw new Error("The action could not be verified");

const loaded = await page.check("Is the documentation page open?");
console.log({ loaded: loaded.answer, probability: loaded.probability });

await browser.close();
```

## Configuration

```ts
const page = playjev(await browser.newPage(), {
  apiKey: process.env.TYPESAFE_API_KEY,
  model: "jev-latest",
  requestTimeoutMs: 30_000,
  maxRetries: 2,
  minTargetConfidence: 0.55,
});
```

`apiKey` defaults to `TYPESAFE_API_KEY`. Explicit options always take precedence.

## Use Playwright directly

The wrapped page retains Playwright's modern page and locator APIs:

```ts
await page.getByRole("button", { name: "Sign in" }).click();
await page.act("Choose the workspace with the highest activity");
await page.screenshot({ path: "workspace.png" });
```

Use exact locators for stable, known structure. Use PlayJev where the correct target depends on page meaning.

PlayJev's `page.check(question)` replaces Playwright's legacy `page.check(selector)` shorthand. Deterministic checkbox interaction remains available as `page.locator(selector).check()`.

## Next

- Understand the [four primitives](./concepts)
- See [how sparse browser state works](./architecture)
- Fill [whole forms in one call](./forms)
