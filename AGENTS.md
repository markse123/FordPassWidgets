# Working on FordPassWidgets

These instructions apply throughout this repository. Read the relevant source before changing behavior. Resolve questions from the code and documentation first; ask the maintainer about unresolved product choices and include a recommended answer.

## Start here

- [Development](docs/DEVELOPMENT.md): architecture, data boundaries, checks and releases.
- [Contributing](docs/CONTRIBUTING.md): contribution workflow and safe testing reports.
- [Model support](docs/MODEL-SUPPORT.md): intended coverage versus real-vehicle verification.
- [Usage](docs/USAGE.md): setup, controls, refresh, settings and privacy.

Keep this file concise. Put detailed implementation and usage guidance in those documents rather than duplicating it here.

## Source and generated files

- Edit the relevant `source/` modules, then run `python3 source/build.py`. Do not hand-edit the generated `FordPassWidgets.js` or bypass the builder's source hashes and patch checks.
- Commit source changes, the rebuilt widget and `source/build-manifest.json` together when widget code changes. Builds must be deterministic.
- Preserve the MIT license, predecessor notices and [credits](CREDITS.md).

## Safety, privacy and vehicle boundaries

- Use synthetic fixtures and mocked Scriptable APIs for automated work. Builds and tests must never use real Ford credentials, fetch live vehicle telemetry or send vehicle commands.
- Never commit credentials, tokens, VINs, account identifiers, coordinates, real telemetry captures, personal screenshots or captured app packages. Keep reports allowlisted and redacted; review them before sharing. Do not add analytics or automatic report uploads.
- Preserve this project's separate storage and Keychain namespaces. Keep account sessions, individual vehicles, widget bindings and request state isolated, including after awaited UI or network operations. Invalid explicit vehicle bindings must fail closed.
- Vehicle commands require the owner's explicit per-vehicle opt-in, supported eligibility, confirmations and cooldowns. Capability hints are not consent. Manual-transmission, unknown and EV profiles must not inherit combustion-engine start controls.
- Preserve location opt-outs across caches, geocoding and weather paths. Changes to external services or data handling must be deliberate and documented.

## Readings and model support

- Keep missing, malformed, stale and valid zero readings distinct. Preserve per-field measurement timestamps. A fetch time or successful status request does not prove a new measurement or completed vehicle action.
- Keep EV traction charge separate from 12V battery status. Apply US/Metric and pressure conversions at the display boundary using the documented canonical storage units.
- Do not infer equipment, safe tire thresholds or verified compatibility from a model name. Keep four- and six-wheel tire positions distinct, with alerts disabled until the owner configures thresholds.
- Pro Power remains optional per vehicle. Preserve the corroborated 7.2 kW HEV gating for watt/capacity estimates and the mapping-unverified behavior for other variants. Do not invent outlet, charging or climate command paths from field names.
- Distinguish offline fixture coverage, intended model support and live vehicle validation in code, documentation and mockups.

## Validation

For widget behavior changes, use the repository's offline checks:

```sh
python3 source/build.py
node --test tests/*.test.cjs source/widget.test.cjs
node source/core.test.cjs
node source/ui.test.cjs
node source/parser.test.cjs
node --input-type=module --check < FordPassWidgets.js
python3 source/release.py --check
```

Use meaningful regression coverage for changed behavior, including failure and isolation cases. For documentation-only edits, check local links and run `git diff --check`; new runtime tests and a widget version bump are not needed. The required CI checks must still pass. See [the validation workflow](.github/workflows/validate.yml) for the current CI commands and base-commit release checks.

## Review, documentation and releases

- Inspect the intended approach before implementation and review the completed diff before creating a PR. After creation, verify the published PR diff, head revision and checks. Report validation limits and resolve blocking findings before recommending merge.
- Keep PRs focused. Explain the concrete behavior change and validation. Update affected usage instructions, model-support claims and the install website when relevant.
- `source/version.json` is the version source. Changed published widget bytes require a version increase and matching generated version/manifest. Documentation-only changes do not require a runtime release.
- Follow the documented two-commit release process: commit reviewed versioned code first, then prepare installer metadata using that actual full code commit. Keep its immutable source URL, SHA-256 and website release information consistent. Never fabricate a pin or weaken downgrade, integrity or backup checks.
- Preserve commits referenced by installer URLs, existing Scriptable script names during updates and repository protection checks. Do not move published version tags or bypass required CI. Merging and release publication require maintainer authorization.
