# Security policy

## Supported versions

PlayJev is currently in an early `0.x` release. Security fixes are applied to the latest revision on the default branch.

## Reporting a vulnerability

Do not open a public issue containing credentials, exploit details, or sensitive page data. Use GitHub's private vulnerability reporting for `filedcom/playjev`, or contact the repository maintainers privately through GitHub if that feature is unavailable.

Include the affected version or commit, reproduction steps, impact, and any proposed mitigation. You should receive an acknowledgement within seven days.

## Secret handling

PlayJev reads `TYPESAFE_API_KEY` at runtime. The repository ignores `.env`; logs and errors must never include authorization headers or the API key. Rotate a key immediately if it is committed or pasted into a public location.
