# Contributing to PlayJev

Thanks for improving PlayJev. Keep changes small, typed, inspectable, and grounded in browser outcomes.

## Development setup

```bash
git clone git@github.com:a7ul/playjev.git
cd playjev
npm install
cp .env.example .env
npm run validate
```

The unit suite does not require credentials. Live browser evals require `TYPESAFE_API_KEY`.

## Repository conventions

- Put public page integration in `src/api/`.
- Put Chromium capture and normalization in `src/browser/`.
- Put the decision and control loop in `src/core/`.
- Keep TypeSafe transport concerns inside `src/jev/`.
- Never send raw HTML, full DOM trees, internal selectors, or backend node IDs to Jev.
- Do not add a general-purpose LLM fallback.
- Add exact outcome assertions for browser eval changes.
- Document every public option and returned field.

## Before opening a pull request

```bash
npm run validate
npm pack --dry-run
```

For browser-control changes, also run:

```bash
npm run eval:stagehand
```

Include the command output and explain any eval that could not be run.

## Commit and pull-request scope

Use a focused branch and keep generated browser profiles, `.env`, build output, and test artifacts out of commits. Explain user-visible behavior and tradeoffs in the pull request description.
