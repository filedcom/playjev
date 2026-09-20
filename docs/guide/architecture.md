# Architecture

PlayJev separates perception, decision, execution, and verification.

```text
Playwright Page
     │
     ▼
Accessibility snapshot + child-frame controls
     │
     ▼
Sparse numbered YAML tree
     │
     ▼
Jev Score / Choice / Noul
     │
     ▼
Deterministic Playwright operation
     │
     ▼
Fresh snapshot + outcome verification
```

## 1. Capture

The Chromium accessibility tree supplies semantic roles, accessible names, values, hierarchy, and state. Cross-origin child frames are normalized separately because their accessibility nodes can live outside the main renderer process.

## 2. Normalize

PlayJev removes presentation-only noise and retains compact context nodes plus actionable controls. Each retained item gets a short integer identifier for the current snapshot.

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

Raw HTML, complete DOM trees, generated JavaScript, backend node IDs, and internal selectors are not included in model-facing state.

## 3. Decide

Candidate prefiltering happens locally. Jev then receives bounded Score, Choice, or Noul questions. `none` is always available when no target is suitable.

## 4. Execute

The chosen number resolves back to an internal browser identity. Playwright performs a fixed operation such as `click`, `fill`, `press`, or `selectOption`.

## 5. Verify

PlayJev captures fresh state and asks whether the requested browser outcome occurred. A successful low-level click alone is not treated as success.

## Security boundary

Page content is untrusted input. PlayJev never executes page-authored instructions as code and never asks Jev to generate executable JavaScript or selectors.
