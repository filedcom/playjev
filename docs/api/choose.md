# `choose()`

Choose one caller-defined interpretation of the page.

```ts
choose(
  question: string,
  choices: Record<string, unknown>
): Promise<ChooseResult>
```

```ts
const result = await page.choose("Which account tier is selected?", {
  free: "The Free tier is selected",
  pro: "The Pro tier is selected",
  enterprise: "The Enterprise tier is selected",
  none: "No tier is selected",
});

console.log(result.answer, result.confidence);
```

The returned `answer` is one of the keys supplied in `choices`. `probabilities` contains the complete choice distribution.
