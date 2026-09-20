# `act()`

Perform and verify a browser intent.

```ts
act(instruction: string, options?: ActOptions): Promise<ActResult>
```

## Single action

```ts
const result = await page.act("Click the Medium pizza-size option", {
  maxSteps: 1,
  minTargetConfidence: 0.65,
  minVerificationProbability: 0.6,
});
```

Supply a value or key separately so it never needs to be generated:

```ts
await page.act("Fill the search box", { value: "climate attribution research" });
await page.act("Press Enter in the search box", { key: "Enter" });
```

## Bulk form

```ts
await page.act("Complete the profile", {
  fields: {
    Name: "Ada Lovelace",
    Email: "ada@example.com",
    Newsletter: true,
  },
});
```

## Options

| Option                       | Type                                          | Description                                 |
| ---------------------------- | --------------------------------------------- | ------------------------------------------- |
| `value`                      | `string`                                      | Caller-supplied value for fill/type/select  |
| `key`                        | `string`                                      | Keyboard key for a press operation          |
| `fields`                     | `Record<string, string \| number \| boolean>` | Bulk field map                              |
| `maxSteps`                   | `number`                                      | Maximum single-action attempts; default `2` |
| `minTargetConfidence`        | `number`                                      | Per-call target threshold                   |
| `minVerificationProbability` | `number`                                      | Completion threshold; default `0.5`         |

## Result

`ActResult` includes `success`, `verificationProbability`, and every executed action with its target, selector, operation, and confidence values.
