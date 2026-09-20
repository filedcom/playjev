# Bulk form filling

Fill related controls with one target-selection round trip and one final verification.

```ts
const result = await page.act("Complete the contact form", {
  fields: {
    "First Name": "Nunya",
    "Last Name": "Business",
    Email: "test@example.com",
    "Preferred Contact Method": "Phone",
    Message: "Hello from PlayJev",
  },
});
```

## Supported controls

| Accessible role                      | Value                       | Operation        |
| ------------------------------------ | --------------------------- | ---------------- |
| `textbox`, `searchbox`, `spinbutton` | string, number              | Fill             |
| `radio`                              | matching choice label/value | Check            |
| `checkbox`, `switch`                 | boolean                     | Check or uncheck |
| `combobox`, `listbox`                | option label                | Select option    |
| `button`, `menuitem`                 | `true`                      | Click            |

## Why the field labels matter

Keys describe the semantic field, not a CSS selector. The value may also disambiguate a group. For example, `"Preferred Contact Method": "Phone"` leads Jev to the `Phone` radio inside the contact-method group.

## Safety properties

- All values come from the caller; Jev does not invent form data.
- Every target must clear the configured confidence threshold.
- Two fields cannot be assigned to the same control.
- Unsupported roles fail before being coerced into an unsafe operation.
- The finished form is verified from a fresh browser snapshot.
