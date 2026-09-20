# `check()`

Answer a yes-or-no question about current browser state.

```ts
check(question: string): Promise<CheckResult>
```

```ts
const result = await page.check("Is the invoice marked paid?");
if (result.answer && result.probability > 0.8) {
  console.log("Payment confirmed");
}
```

Returns:

```ts
interface CheckResult {
  answer: boolean;
  probability: number;
}
```
