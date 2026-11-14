# FordPassWidgets

Your Ford vehicles, at a glance. **FordPassWidgets** is an independent, open-source iPhone widget app for [Scriptable](https://scriptable.app), designed for gas, hybrid, plug-in hybrid and electric Ford vehicles on one Ford account.

<!-- BEGIN GENERATED:version -->
**v0.1.1** · [Easy installation](https://markse123.github.io/FordPassWidgets/) · [Script source](FordPassWidgets.js) · [Setup and usage](docs/USAGE.md) · [Model support](docs/MODEL-SUPPORT.md) · [Android feature research](docs/ANDROID-FEATURES.md)
<!-- END GENERATED:version -->

**Runs locally. No project data collection.** The widget runs in Scriptable on your device. The project has no developer-operated backend, analytics or tracking, and does not automatically upload your account details, vehicle data or reports to its maintainers. Settings, tokens and cached readings are stored locally by Scriptable. The app still contacts Ford for sign-in and vehicle data, plus the documented optional location/weather services. [Privacy details](docs/USAGE.md#privacy-and-removal).

This is a new project built on [rushilpunu/FordWidget](https://github.com/rushilpunu/FordWidget) and [markse123/FordWidget](https://github.com/markse123/FordWidget). Thank you to the original authors, API-reference projects and community testers; see [CREDITS](CREDITS.md) for their roles and project links. It keeps their widget foundation and expands the design to a garage of vehicles, EV status and vehicle-specific settings. **Designed for broader Ford coverage does not mean verified on every model.** See the [support matrix and testing limits](docs/MODEL-SUPPORT.md).

## What it includes

<!-- BEGIN GENERATED:features -->
- A garage for **multiple vehicles on one account**, with Ford's vehicle list and a manual fallback. Each widget can stay attached to a particular vehicle independently of the vehicle currently open in the app. [Details](docs/USAGE.md#choose-vehicles-for-the-app-and-widgets)
- Vehicle readings where reported: fuel/range, EV charge/range, plug and charging status, 12V battery, tires, oil, locks, doors/hood, odometer, outside temperature and parked location. Missing readings remain unknown; healthy incomplete door/lock reports are labeled partial. [Details](docs/USAGE.md#features-controls-and-alerts)
- Classic, Showcase and Dashboard designs, Home Screen sizes and Lock Screen views, vehicle photos, and US/Metric formats with independent PSI/kPa/bar tire pressure. [Details](docs/USAGE.md#add-the-widget)
- Four- and six-wheel tire layouts. Owners choose front/rear low-pressure thresholds; **tire alerts start off until configured**. [Details](docs/USAGE.md#features-controls-and-alerts)
- Vehicle-specific feature and control choices. Lock/unlock and engine start/stop retain confirmations and cooldowns; commands start disabled and must be enabled for that vehicle. Start/Stop also require owner verification of engine control. EV climate/conditioning and charging controls are not implemented. [Details](docs/MODEL-SUPPORT.md#feature-boundaries)
- Optional **Pro Power Onboard** status per vehicle. A/B, total and capacity estimates are limited to the corroborated 7.2 kW HEV mapping; other variants show mapping-unverified/raw details. Pro Power is off by default. [Details](docs/USAGE.md#use-pro-power-onboard)
- A confirmed Refresh action, cached-reading ages, configurable alerts and redacted troubleshooting reports. [Details](docs/USAGE.md#refresh-and-measurement-times)
<!-- END GENERATED:features -->

Pro Power monitoring was corroborated in the predecessor project on one **US 7.2 kW F-150 PowerBoost**, including A and B loaded together. One raw unit ≈ one watt has only been corroborated on that system. Watts/capacity are only estimated for an HEV profile reporting the known raw 7200 main-capacity value. Other profiles/ratings keep raw status and mode without asserted watt/capacity estimates. Physical outlet mappings and broad vehicle/region coverage remain unverified. This new app still needs live model-by-model testing. It cannot switch Pro Power outlets or Generator Mode.

## Get started

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) on your iPhone.
2. Open the [install page](https://markse123.github.io/FordPassWidgets/), copy its installer into a new Scriptable script named **Install FordPassWidgets**, and run it. Or copy [FordPassWidgets.js](https://raw.githubusercontent.com/markse123/FordPassWidgets/main/FordPassWidgets.js) into a script named **FordPassWidgets**.
3. Run the installed widget script. Connect FordPass, choose or add vehicles, and review each vehicle's powertrain/features before enabling commands.
4. Fetch telemetry, choose a design and fields, then add a Scriptable widget. Select your script and set **When Interacting → Run Script**.
5. Use **Copy widget parameter** for a fixed vehicle, or leave vehicle selection blank to follow the garage default. [Full instructions](docs/USAGE.md).

FordPassWidgets has its **own sign-in, settings and vehicle storage**. It does not import credentials or cached data from FordWidget or FordWidget Pro Power. Existing installations of those projects can stay installed separately. For later FordPassWidgets updates, replace the contents of the same Scriptable script and keep its name so existing widgets stay connected.

## Readings, refresh and privacy

These are **last-reported readings**, not a live vehicle connection. A fresh cloud response or completed status request does not prove every measurement changed. Pro Power's status-result age is separate from its unverified sample time. Refresh opens Scriptable for confirmation, respects cooldowns, and can finish before iOS redraws the Home Screen widget. [How refresh works](docs/USAGE.md#refresh-and-measurement-times).

Security measures include an installer pinned to a reviewed release with SHA-256 verification, Keychain token storage, and opt-in vehicle controls with confirmations. This unofficial client depends on private Ford APIs and authorized vehicle services. Passwords are not saved. Tokens use Scriptable's shared Keychain, accessible to other installed scripts, so install only scripts you trust. Location, local cache and optional weather behavior are described in the [privacy notes](docs/USAGE.md#privacy-and-removal). The install website has no Ford login form, vehicle telemetry or analytics.

## Contributions welcome

**PRs, fixes, new ideas and your own coding are welcome.** You do not need to own the same truck as the original developers. Help test a different model, improve an existing layout, add synthetic regression fixtures or work on a carefully scoped feature. If you would rather build your own version, fork it and make it yours under the MIT license.

Start with [CONTRIBUTING](docs/CONTRIBUTING.md) for the local build, offline tests and what to share from a real-vehicle test. [MODEL-SUPPORT](docs/MODEL-SUPPORT.md) separates design from verification; [ANDROID-FEATURES](docs/ANDROID-FEATURES.md) inventories cloud candidates, Bluetooth-only evidence and model-by-model screening. Start with the cached **Troubleshooting → Model support report** when sharing a vehicle finding. Please keep credentials, VINs, locations, real telemetry captures and personal screenshots out of commits and issues.

Use the issue forms for bugs, model-testing feedback and feature ideas. Please report security concerns through the private route in [SECURITY](SECURITY.md). [Development](docs/DEVELOPMENT.md#github-repository-safeguards) documents CI, source scanning, Action updates and installation checks.

## License and attribution

Distributed under the [MIT License](LICENSE). Derived from [rushilpunu/FordWidget](https://github.com/rushilpunu/FordWidget) and the [markse123/FordWidget](https://github.com/markse123/FordWidget) Pro Power fork. Existing copyright notices are retained. [CREDITS](CREDITS.md) records the widget authors, inherited API-reference projects, runtime/services and community testing. FordPassWidgets is independent of Ford Motor Company.
