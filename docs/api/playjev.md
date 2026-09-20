# `playjev()`

Wrap a Playwright page with PlayJev's four browser-aware methods.

```ts
function playjev(page: Page, options?: PlayJevOptions): PlayJevPage;
```

The returned object preserves Playwright's modern page and locator API. PlayJev's semantic `page.check(question)` replaces the legacy Playwright `page.check(selector)` shorthand; use `locator.check()` for deterministic checkbox interaction.

## Example

```ts
import { chromium } from "playwright";
import { playjev } from "playjev";

const browser = await chromium.launch();
const page = playjev(await browser.newPage(), {
  apiKey: process.env.TYPESAFE_API_KEY,
  model: "jev-latest",
});
```

## Options

| Option                | Type     | Default                      | Description                     |
| --------------------- | -------- | ---------------------------- | ------------------------------- |
| `apiKey`              | `string` | `TYPESAFE_API_KEY`           | TypeSafe API key                |
| `model`               | `string` | `jev-latest`                 | Jev model identifier            |
| `baseUrl`             | `string` | `https://api.typesafe.ai/v1` | Jev API base URL                |
| `requestTimeoutMs`    | `number` | `30000`                      | Timeout per API attempt         |
| `maxRetries`          | `number` | `2`                          | Transient request retries       |
| `minTargetConfidence` | `number` | `0.55`                       | Default action target threshold |

## Errors

`JevRequestError` is exported for API failures and exposes an optional HTTP `status`. All library-specific errors extend `PlayJevError`.
