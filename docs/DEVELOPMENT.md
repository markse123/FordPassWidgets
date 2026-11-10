# Development

`FordPassWidgets.js` is the generated, installable Scriptable application for **FordPassWidgets v0.1.0**. Users install that one script; the modular source, builder and offline fixtures are for contributors. This is an independent project derived from both [rushilpunu/FordWidget](https://github.com/rushilpunu/FordWidget) and [markse123/FordWidget](https://github.com/markse123/FordWidget).

For contribution ideas and a redacted manual-test template, start with [CONTRIBUTING](CONTRIBUTING.md). [MODEL-SUPPORT](MODEL-SUPPORT.md) is the authoritative distinction between intended coverage and live verification.

## Build and check

Requirements: Python 3 and a recent Node.js with its built-in test runner. No downloaded build dependencies or Ford account are required.

```sh
python3 source/build.py
node --test tests/*.test.cjs source/widget.test.cjs
node source/core.test.cjs
node source/ui.test.cjs
node source/parser.test.cjs
node --input-type=module --check < FordPassWidgets.js
```

The tests mock Scriptable storage, UI and network APIs. Fixtures must be synthetic; the build/tests must never request real Ford telemetry or send vehicle commands. Rebuilding twice must produce identical widget and manifest bytes. Commit relevant source changes, generated output and `source/build-manifest.json` together.

The builder starts with reviewed `source/fordwidget-base.js`, verifies its hash and applies explicit patches plus scoped vehicle profile, telemetry, model UI and controller modules. Patch targets must match exactly once. `source/build-manifest.json` records provenance, module hashes, output hash and changes. Do not edit the generated widget to bypass a source mismatch, and do not remove predecessor license attribution.

## Account, vehicle and widget boundaries

FordPassWidgets uses its own `FordPassWidgets.v1.` Keychain namespace and `FordPassWidgets` local storage root. It does not import predecessor credentials, configuration or telemetry. Shared Ford credentials belong to one account session; vehicle profiles have separate identifiers, preferences, telemetry and request state. A new account sign-in, reconnect, profile deletion or lost session must not let a delayed callback save into a different account/profile.

A widget's `vehicle=<opaque profile id>` binding is distinct from the app's current vehicle and the garage default. Invalid explicit bindings fail closed rather than silently using the default. Browsing a vehicle never changes the default; **Make default vehicle** is a separate action. Links/actions must carry the chosen vehicle context through dialogs and requests, and recheck it after awaited UI/network work.

New profile command permissions are strict explicit opt-ins. Capability hints are not owner consent. Engine type, transmission and command eligibility must be evaluated before dispatch; unknown or BEV configurations must not inherit combustion remote start. Pro Power also needs a per-vehicle opt-in and a usable backend; a field preference cannot enable an unavailable service. Keep shared account authentication/backoff coordination separate from vehicle-specific request/data state.

Settings changes recheck active ownership and vehicle/account context before saving. Bounded foreground/evening leases and no-clobber claim handling protect competing Scriptable runs; they are a fail-closed file protocol, not a cross-process atomic transaction. Expired or displaced runs must not send late commands, overwrite tokens/cooldowns or save settings after a dialog returns.

## Telemetry, models and units

Retain per-field source timestamps. A fetch time, cloud response timestamp or command receipt must not replace a known measurement time. Missing, malformed, stale and valid zero are different states. Partial updates must not delete unrelated vehicle data or cross vehicle boundaries.

Normalized vehicle display values retain the inherited canonical miles, Celsius and PSI conventions. EV schema input uses traction SOC percentage and kilometre-based range, distinct from 12V state of charge; convert range once into canonical storage. Plug/charging state uses recognized enum mappings, with missing/unrecognized values unknown. Do not invent charge-time units, conditioning semantics, DEF scaling or trailer support from field names.

US/Metric and independent Auto/PSI/kPa/bar preferences apply at the display boundary. Auto follows the effective preset; an explicit pressure Parameter wins regardless of word order. Unit changes must not rewrite samples, thresholds or timestamps, and must not add network requests. Raw diagnostic unit evidence stays explicit.

Four- and six-wheel configurations keep supported tire positions distinct. Low-tire alerts start disabled until the owner supplies front/rear thresholds. Never infer a universal threshold from model text or copy a different vehicle's thresholds. Percentages and Pro Power W/kW retain their meaning when display units change.

The Pro Power interpretation is inherited evidence from one 7.2 kW PowerBoost: one raw unit approximately one watt, with A/B simultaneous-load display tested. Watt/capacity output is gated to an HEV profile with raw main capacity 7200; every other profile/rating keeps raw status/mode with mapping-unverified output and no asserted watt/capacity estimate. Rating alone does not justify applying it to a BEV. It is not broad variant validation. Missing circuit power is not zero; command-result time is not an embedded sample timestamp. Controls for Pro Power outlets, EV climate or charging are outside the first release.

## Privacy and diagnostic data

Keep local location opt-out effective immediately for the selected vehicle, including backup cache and weather/geocoder paths. A Parameter cannot bypass it. Signing out removes account credentials, not automatically every retained vehicle/photo/cache file; removal UI and documentation must state the distinction.

The cached **Model support report** records capability states, owner choices and relevant readings/ages without a network request or command. It excludes model name/year, VIN, location, profile ID and tokens; the owner can add model-level context manually. It is the first report for model-support contributions.

Troubleshooting reports use explicit whitelists. Vehicle reports may make one passive cloud read to compare raw values with cached and hypothetical normalization/merge results; that report must not send commands or save candidate telemetry. Cached Pro Power reports remain passive. Exclude VINs, coordinates, account identifiers, tokens, arbitrary payload strings and raw errors. Redacted states/timestamps still require review before sharing. Never commit research packages, captures, personal images, raw caches, credentials or generated test logs.

## Version and installer protection

`source/version.json` is the app-version source and uses canonical `major.minor.patch`: three non-negative integers without leading zeros, suffixes or omitted parts. The runtime version, generated header and manifest must agree. Changed published widget bytes require a version bump; documentation or installer metadata can change without changing widget bytes.

Prepare releases in two reviewed commits:

1. Update the version, rebuild and run offline checks. Review and commit the generated `FordPassWidgets.js`, matching version/manifest and source. Record the full 40-character code commit.
2. Run `python3 source/release.py --commit FULL_CODE_COMMIT_SHA` to prepare the immutable installer source URL, version and SHA-256. Update the install page to the same release pin, review and commit distribution metadata separately.

Read-only validation:

```sh
python3 source/release.py --check
python3 source/release.py --check --base FULL_BASE_COMMIT_SHA
```

Release preparation is offline. After publishing the code, separately verify the hosted pinned bytes and SHA-256 before releasing the install page. Keep the referenced code commit reachable; a regular merge preserves it, while squashing away a pinned commit can leave the install source outside durable history. Never ship a placeholder, moving-branch URL or fabricated hash as the immutable installer pin.

`docs/installer.js` is a separate Scriptable script. It checks the pinned widget and installed version, refuses downgrade/malformed/conflicting versions, asks before replacing a script and saves a code backup. It must not execute downloaded code or read widget credentials/cache. Preserve an existing FordPassWidgets script name so its widgets remain connected; never silently replace a predecessor project.

## GitHub repository safeguards

`main` requires a pull request and the up-to-date **offline-checks** GitHub Actions result, including for administrators. Force pushes and branch deletion are blocked, and review conversations must be resolved. Merge commits preserve the code commits referenced by immutable installer URLs; squash/rebase merging is disabled.

The required job checks the deterministic build, JavaScript syntax, offline regressions, version increases for changed widget bytes, and agreement between the version, manifest, installer checksum/source commit and install page. It runs on pull requests, `main` pushes and `v*` tag pushes with read-only repository permissions, a pinned checkout action and a bounded job timeout.

A version-tag run additionally requires the exact `vMAJOR.MINOR.PATCH` name from `source/version.json`, a checkout matching that tag, and a tagged commit reachable from `origin/main`. It checks the release pin without treating a tag event's previous ref as a version-bump base. Tag checks run **after a tag is pushed**: confirm that run succeeds before publishing a release. For a future release such as `v0.1.1`, run from the matching tag's checkout after fetching `origin/main`:

```sh
python3 source/check-tag.py v0.1.1
```

An active tag ruleset blocks updates and deletion of `v*` tags, without bypass actors. Publish fixes under a new version rather than moving an existing tag. Secret scanning and secret push protection are enabled in GitHub.

Immutable releases are enabled for future publications. Create a **draft** release, attach and verify all assets/checksums, then publish; GitHub locks the published assets and associated tag. This setting does not retroactively lock the existing `v0.1.0` release. Its installer still verifies the original reviewed commit and SHA-256. See [GitHub's immutable-release guide](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

## Static install website

GitHub Pages publishes `main` → `/docs` at **https://markse123.github.io/FordPassWidgets/**. `.nojekyll` keeps plain static assets. `index.html`, `styles.css`, `site.js` and `icon.svg` provide the dark installation site. Its examples are synthetic illustrations, not vehicle screenshots or verified live telemetry.

The site has no external fonts, analytics or Ford account form. The script preloads only the same-origin installer so an explicit Copy tap can use Safari's clipboard gesture; denied clipboard access exposes selected manual-copy text. Keep the no-JavaScript source/manual guide fallback, keyboard focus, reduced-motion styles and readable small-screen layout.

Check the copy/manual-copy flow and local links with `node --test tests/site.test.cjs tests/installer.test.cjs`. Serve `docs/` with a local static HTTP server for desktop/mobile browser checks. Match the displayed version/source link to the final installer pin, and keep feature claims consistent with [MODEL-SUPPORT](MODEL-SUPPORT.md).
