# `rate()`

Score current browser state against an ordered scale.

```ts
rate(question: string, scale: unknown[]): Promise<RateResult>
```

```ts
const result = await page.rate("How complete is the onboarding form?", [
  "Empty",
  "Started",
  "Mostly complete",
  "Complete",
]);
```

`answer` is the numeric score returned by Jev. `confidence` and the full probability distribution are included for policy decisions and logging.
