# Contributing to FordPassWidgets

**PRs and your own coding are welcome.** Bring a bug fix, layout improvement, synthetic fixture, documentation correction or carefully scoped feature idea. You can also fork the project for your own use under the MIT license. You do not need to own the original test truck to help.

## Start locally

You need Git, Python 3 and a recent Node.js with the built-in test runner. No downloaded build dependencies or Ford credentials are needed for offline work.

```sh
git clone https://github.com/markse123/FordPassWidgets.git
cd FordPassWidgets
git switch -c your-change
python3 source/build.py
node --test tests/*.test.cjs source/widget.test.cjs
node source/core.test.cjs
node source/ui.test.cjs
node source/parser.test.cjs
node --input-type=module --check < FordPassWidgets.js
```

Edit the relevant source module rather than the generated widget. Rebuild and include both source and the generated `FordPassWidgets.js`/manifest in your PR. [DEVELOPMENT](DEVELOPMENT.md) describes the source boundaries and release checks. Keep changes focused so reviewers can understand the problem, resulting behavior and validation.

## What makes a useful PR

- Explain a concrete trigger and before/after behavior, including affected models only where supported by evidence.
- Use synthetic fixtures for parsing, missing/unknown fields, timestamps, units, vehicle binding, permission and failure cases. A missing reading must not become zero, a disabled command must stay disabled, and data must not cross vehicle/account boundaries.
- Run the offline tests and build; mention what passed and what still needs native Scriptable or real-vehicle testing.
- Keep status freshness, confirmations, cooldowns, storage isolation and owner feature choices intact. A request receipt is not a new measurement or confirmed vehicle action.
- Preserve the MIT license, existing notices and [CREDITS](../CREDITS.md), including both predecessor projects and inherited API-reference acknowledgments. Add a public handle and a specific contribution when updating credits; do not publish private identities or infer an endorsement. Keep runtime dependencies and external requests deliberate and documented.

For larger features, open an issue or draft PR with the intended behavior, available evidence and limitations before building a broad change. [MODEL-SUPPORT](MODEL-SUPPORT.md) lists useful research areas; [ANDROID-FEATURES](ANDROID-FEATURES.md) adds exact schema/capability/command names and model-screening examples. Neither is a promised roadmap.

## Test a real vehicle

Manual testing is optional and done from your own authorized account. If you want named testing credit, include the public handle you consent to publish; anonymous reports are welcome. Installation and passive cloud reads do not require a running engine or electrical load. Vehicle-control tests must be deliberate and confirmed; do not run automated tests against a real Ford account. Engine start is only appropriate when safely parked outdoors.

Start with **Troubleshooting → Model support report**. It uses cached redacted readings, capabilities and owner settings. Effective, owner-selected and Ford-reported powertrains are labelled separately. It makes no network request, sends no command and uploads nothing. Review the copied report before sharing. It deliberately omits model name/year, VIN, location, profile ID and tokens; add model-level context manually if you choose. Use the separate **Vehicle data report** when you need raw-value/timestamp normalization evidence; that action may perform one passive cloud read.

A useful issue/PR report can use this template:

```text
App version:
iPhone/iOS/Scriptable version:
Model year / model / powertrain / transmission:
Account region:
Widget size/design and display units:
Action used (cloud read, confirmed Refresh, or an explicitly enabled control):
Expected and observed result:
Relevant Model support report sections (reviewed/redacted):
Field measurement age and request outcome:
Approximate dashboard comparison, if available:
Reproduction steps:
```

Use model-level descriptions; **do not include a VIN or vehicle binding ID**. For Pro Power, include the rating, circuit tested, approximate applied load and displayed A/B/total, with the truck's actual state. Separate a no-load result from a missing/unknown result. For EVs, distinguish 12V battery from traction charge, plug connection from active charging, and dashboard state from an older cloud value.

The app's Troubleshooting reports are redacted but still include states and timestamps. Review any copied report before sharing, and reduce it to the relevant sections where possible. No report is uploaded automatically. Do not commit raw Ford responses, caches, tokens, passwords, account names, coordinates, personal screenshots or captured app packages. Create a small synthetic fixture that preserves the shape needed to reproduce a parser issue instead.

## Review and release

PRs need review before release, including checks that feature claims match verified behavior. Keep implementation changes separate from immutable installer metadata. Maintainers prepare the final version and pinned install source after the reviewed code commit exists; contributors should not invent a source commit or bypass installer integrity checks. Documentation and website contributions are welcome too—check mobile layout, keyboard focus and the manual-copy fallback.
