# Production use

## Set explicit thresholds

Defaults favor useful automation, not every risk profile. Raise `minTargetConfidence` and `minVerificationProbability` before destructive or externally visible actions.

```ts
await page.act("Submit the application", {
  minTargetConfidence: 0.8,
  minVerificationProbability: 0.8,
  maxSteps: 1,
});
```

## Keep deterministic checks

Use PlayJev to locate semantically variable controls, then assert business-critical outcomes with Playwright when exact state is available.

```ts
await page.act("Choose the annual plan");
await expect(page.getByTestId("billing-period")).toHaveText("Annual");
```

## Retries and timeouts

Jev calls default to a 30-second timeout and two retries for network errors, HTTP 408, 429, and 5xx responses. Authentication and other permanent 4xx responses fail immediately.

## Logging

Set `PLAYJEV_DEBUG=true` to inspect candidate numbers, roles, names, scores, and decisions. Debug output does not print the API key.

## Browser support

The snapshot implementation currently depends on Chromium's DevTools Protocol. Use Chromium, Chrome, Edge, or another compatible Chromium build. Firefox and WebKit are not supported yet.

Accessibility snapshots are bounded to 24 levels by default so ad-heavy and deeply nested pages cannot stall Chromium's unbounded tree traversal. Raise `snapshotMaxDepth` only when a required control is genuinely deeper.

## Secrets

Keep `TYPESAFE_API_KEY` in your runtime secret manager. `.env` is ignored by the repository and must never be committed.
