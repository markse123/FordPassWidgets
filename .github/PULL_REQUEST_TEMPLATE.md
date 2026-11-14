## Problem and resulting behavior

Describe the concrete trigger and what changes. Link a related issue if useful. State model, region or native Scriptable limits without claiming unverified compatibility.

## Validation

List the checks run and their results. Separate offline tests, native Scriptable checks and optional real-vehicle observations. Explain any remaining verification or why runtime tests are unnecessary for this change. Do not run automated tests against Ford accounts or send vehicle commands for this PR.

## Review checklist

- [ ] The completed diff received a pre-PR review, with blocking findings resolved or clearly identified.
- [ ] Source, generated output and manifest are consistent where widget code changed; applicable version and installer checks are satisfied.
- [ ] Relevant regression coverage and affected usage/model-support/website documentation are updated, or I explained why no changes are needed.
- [ ] I reviewed `docs/features.json` for user-visible feature changes and regenerated README.md with the normal build, or explained why the existing summaries remain accurate.
- [ ] Vehicle/account isolation, owner opt-ins, confirmations, cooldowns, measurement ages and unknown values remain intact where relevant.
- [ ] I reviewed the diff and report for credentials, VINs, identifiers, locations, raw vehicle data, personal screenshots and private captures; only synthetic fixtures or reviewed minimal redacted excerpts are included.
- [ ] Existing licensing and credits are preserved.

Maintainers should verify the published PR head, diff and required checks after creation. See [the contribution guide](https://github.com/markse123/FordPassWidgets/blob/main/docs/CONTRIBUTING.md) for the build, testing and release process. PRs and your own coding are welcome.
