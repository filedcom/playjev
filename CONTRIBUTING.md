# Contributing to PlayJev

Thanks for improving PlayJev. Keep changes small, typed, inspectable, and grounded in browser outcomes.

## Development setup

```bash
git clone git@github.com:filedcom/playjev.git
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

## Releases

A version change merged into `main` triggers `.github/workflows/release.yml`. The workflow validates the repository, inspects the package tarball, creates a draft `vX.Y.Z` GitHub Release, publishes the same version to npm with provenance, verifies it in the registry, and then publishes the GitHub Release.

Prepare a release without creating a local tag:

```bash
npm version patch --no-git-tag-version
npm run validate
```

Commit both `package.json` and `package-lock.json` in the release pull request. Changes to package metadata that do not alter the version safely skip publication. A manual workflow dispatch can recover an interrupted release idempotently.

The first publication requires a granular npm automation token stored as the `NPM_TOKEN` repository secret because npm cannot configure trusted publishing for a package that does not exist yet. After the first publish, configure npm trusted publishing with:

- Provider: GitHub Actions
- Organization: `filedcom`
- Repository: `playjev`
- Workflow: `release.yml`
- Allowed action: `npm publish`

Then remove `NPM_TOKEN`. Subsequent releases use short-lived OIDC credentials from GitHub Actions.

## Commit and pull-request scope

Use a focused branch and keep generated browser profiles, `.env`, build output, and test artifacts out of commits. Explain user-visible behavior and tradeoffs in the pull request description.
