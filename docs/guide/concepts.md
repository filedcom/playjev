# Core concepts

PlayJev is designed around bounded decisions. It asks Jev to judge explicit alternatives rather than produce free-form selectors, scripts, or prose.

## The four methods

### `check()`

A browser-aware Noul: a yes/no answer with probability.

```ts
const result = await page.check("Is the checkout total below $100?");
```

### `choose()`

A browser-aware Choice over keys you define.

```ts
const result = await page.choose("Which plan is highlighted?", {
  starter: "Starter is highlighted",
  pro: "Pro is highlighted",
  enterprise: "Enterprise is highlighted",
});
```

### `rate()`

A browser-aware Score against an ordered scale.

```ts
const result = await page.rate("How complete is this form?", [
  "Empty",
  "Partially complete",
  "Complete",
]);
```

### `act()`

A composed control loop: score candidates, choose a target, choose an operation, execute through Playwright, and verify the outcome with Noul.

```ts
await page.act("Click the pricing link");
```

## Atomic actions and bulk forms

Ordinary `act()` calls should describe one intent. Form completion is a deliberate exception: the `fields` option batches target selection because every desired value is already caller-supplied and every browser operation is deterministic.

## Confidence is data

PlayJev exposes target, operation, and verification confidence instead of hiding uncertainty. Production workflows should inspect `success`, log returned actions, and choose thresholds appropriate to their risk.

## No LLM fallback

PlayJev does not silently send the page to a general-purpose LLM when Jev is uncertain. A low-confidence or missing choice fails visibly.
