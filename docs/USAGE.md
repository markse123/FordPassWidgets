# FordPassWidgets — setup and usage

These instructions describe **v0.1.1** of [markse123/FordPassWidgets](https://github.com/markse123/FordPassWidgets). It is a separate application derived from FordWidget and FordWidget Pro Power, designed for multiple Ford vehicles on one account, including EVs. Model coverage remains subject to real-vehicle testing; consult [MODEL-SUPPORT](MODEL-SUPPORT.md).

## Install and connect

You need an iPhone with Scriptable, an authorized Ford account and a vehicle with connected services available. US sign-in is inherited from the predecessor; Canada and other regions need verification. No running engine or electrical load is needed for setup or a cloud-cache read.

For guided installation, open [the install page](https://markse123.github.io/FordPassWidgets/) on your iPhone. Copy the installer into a **separate** new Scriptable script named **Install FordPassWidgets**, then run it. Choose your script storage and **New installation**. For a later update, choose **Update an existing script** and enter that FordPassWidgets script's exact name. Run the installed widget separately afterward.

The installer validates a pinned download's SHA-256, checks its version, asks before replacing an existing script and keeps a code backup. It does not sign in or run vehicle commands. Do not use it to overwrite another project's widget. You can also install manually:

1. Copy the complete [FordPassWidgets.js](https://raw.githubusercontent.com/markse123/FordPassWidgets/main/FordPassWidgets.js) into a new Scriptable script named **FordPassWidgets**.
2. Run it inside Scriptable and choose **Connect FordPass**. Complete Ford sign-in directly on Ford's page, including any verification.
3. Choose a vehicle from Ford's garage. Under **Vehicles**, **Read FordPass garage** retries discovery and **Verify a VIN manually** is the fallback. Manual verification makes one passive cloud read and must receive the same VIN before authorizing that vehicle. Enter the VIN only in the app; never put it in a report or widget Parameter.
4. Review that vehicle's name, powertrain, transmission and feature choices before enabling commands. New profiles begin with commands disabled and Pro Power off. Fetch telemetry for available readings.
5. Choose fields in **Customize widgets**, a design in **Widget gallery**, and formats in **Units & formats**. **Vehicle features** reviews configuration and command permissions; missing cloud data is unverified rather than automatically unsupported.

FordPassWidgets keeps its own credentials, settings and caches. It does not import data from FordWidget or FordWidget Pro Power. Those scripts can remain installed separately.

## Choose vehicles for the app and widgets

The garage holds multiple vehicles under **one Ford account**. Vehicles have their own settings, telemetry, command state and feature selections. This release is not a multi-account manager.

- **App vehicle:** the vehicle currently open in Scriptable. Use **Vehicles** to browse another vehicle; this does not change the widget default.
- **Default widget vehicle:** use **Make default vehicle** for the garage choice used by widgets without an explicit vehicle binding.
- **Bound widget:** use **Copy widget parameter** for `vehicle=<id>`, where the app supplies an opaque ID. Paste it into the widget Parameter rather than entering a VIN or guessing the ID. Keep the binding when adding field, design or unit words.

For example, `vehicle=<copied-id> dashboard metric` stays with that vehicle, uses Dashboard and formats readings in Metric. Replace `<copied-id>` with the actual copied ID; the angle-bracket example is not a real binding. An invalid or removed explicit binding does not silently display a different vehicle. Update the widget Parameter if you remove/re-add its vehicle.

Ford's garage listing is a convenience, not proof that every model or command is supported. Manual setup remains available when the list fails. Check the chosen vehicle name before a status request or command.

## Add the widget

1. Add a Scriptable widget to your Home Screen and choose a size.
2. Edit it and select **FordPassWidgets** (or your existing custom script name).
3. Set **When Interacting → Run Script**.
4. Paste a copied vehicle binding for a fixed vehicle, or leave it out to use the default. Leave other Parameter words blank to follow that vehicle's shared field/design choices.

Small and medium widgets cannot show every field at once. Preview the desired size in **Widget gallery**. Classic, Showcase and Dashboard designs are selected separately for each Home Screen size; `classic`, `showcase` and `dashboard` override the choice for one widget. Lock Screen circular, rectangular and inline views retain their own view words, which can accompany a fixed vehicle binding.

### Fields and formats

Fields depend on the selected vehicle and the data Ford reports. Fuel/oil are useful for combustion vehicles; EV charge/range, plug and charging state are for vehicles with those readings. High-voltage EV charge and the **12V battery** are separate measurements. An absent field stays unknown rather than becoming a zero or a false “not connected” state.

In **Units & formats**, choose **US** (miles, °F) or **Metric** (kilometres, °C). US is the unset default. Tire pressure is independent: **Auto** follows the preset (PSI for US, kPa for Metric), or choose **PSI**, **kPa** or **bar**. A widget's `us`/`metric` word overrides its preset; `psi`, `kpa` or `bar` overrides pressure regardless of word order. These words change formatting, not field selection.

Changing units reformats saved values without fetching new data or changing measurement times. Percentages and Pro Power W/kW stay unchanged. Technical reports retain raw unit evidence for comparison.

| Parameter words | Effect |
| --- | --- |
| `vehicle=<copied-id>` | Fix the widget to that garage vehicle |
| `classic`, `showcase`, `dashboard` | Select a Home Screen design |
| `us`, `metric` | Override the display preset |
| `psi`, `kpa`, `bar` | Override tire pressure |
| `fuel tires lock` | Select those reading fields |
| `evsoc evrange plug charging` | Select EV charge, electric range, plug and charging state |
| `ppoa ppob ppototal ppocapacity` | Focused Pro Power view, if enabled for the vehicle |
| `-photo` | Hide the photo |
| `buttons` | Select the controls layout |
| `status` | Classic status layout without the control grid; other designs may retain controls |

Naming **reading fields** selects only those fields; a vehicle binding, format or design word does not hide the shared choices. A field prefixed with `-` is hidden. Original words include `photo`, `fuel`, `battery`, `tires`, `oil`, `lock`, `odometer`, `doors`, `temp` and `parked`. EV words are `evsoc` (aliases `ev`, `charge`), `evrange`, `plug` and `charging`. Pro Power words are `ppoa`, `ppob`, `ppototal` (alias `ppo`) and `ppocapacity`.

## Features, controls and alerts

Door and lock states describe the components Ford reported. A healthy state without whole-vehicle aggregate evidence is labeled **Closed (partial)** or **Locked (partial)**, including older cached readings whose coverage is unknown. The individual readings and their ages remain visible. A partial healthy result cannot produce the evening **Locked and closed** all-clear message; confirmed aggregate door status also needs a reported hood state. Open/unlocked readings still raise their applicable alerts.

Open **Vehicle features** for each vehicle. Review **Powertrain** and **Transmission**; known FordPass-reported values stay fixed, while unknown values need owner review. Ford capability hints do not verify a live command. Controls begin disabled. Enable only appropriate actions shown as available in your Ford app. The features screen never sends a test command; use an enabled action separately if you deliberately want to test it, then check actual completion. A request receipt is not proof the vehicle completed it.

Lock/unlock and engine start/stop use inherited confirmed actions, where enabled and eligible. Engine controls also require **I verified remote engine control is available** plus the individual start/stop choices and an appropriate configured powertrain/transmission; unknown and electric powertrains must not be treated as remote-start-capable combustion vehicles. **EV climate/conditioning, start/stop charging and charge-limit controls are not implemented.** There is no Pro Power outlet switching.

Turning engine verification off disables Start and Stop even when Ford reports that capability. Lock/unlock permissions remain separate. A remote-start countdown is shown only when Ford supplies its own valid measurement time; reading an undated countdown again cannot restart the timer.

In **Tires & alerts**, choose evening conditions and the optional cached-status attention indicator. Open **Tires & axle thresholds** there or in Customize widgets to select four tires or six tires (dual rear). **Low-tire alerts are off until both front/rear thresholds are saved**, then can be enabled separately. These are your alert limits, not recommended inflation pressures. Choose appropriate values using the vehicle's tire information/owner guidance; the app does not infer them from a model name or past pressure. Threshold entry follows the selected display pressure unit.

Alerts use saved readings and can be old. Missing tires or other measurements stay unknown. iOS controls notification and widget redraw timing. Remote engine start should only be used with the vehicle safely parked outdoors.

## EV readings

EV status is read-only in this release. When Ford provides recognized fields, the app can show high-voltage battery state of charge, electric range, plug connection and charging state, each with its reported time. Charge percentage is distinct from 12V state of charge; electric range uses Ford's kilometre-based metric before display conversion.

Charging state can be in progress, scheduled, completed, paused, stopped or unavailable/error. A connected plug does not prove active charging. Missing/unknown states stay unknown. No completion ETA is promised where the raw time unit has not been established. This mapping follows Ford's schema; live behavior still needs verification on individual BEV/PHEV models.

## Use Pro Power Onboard

Pro Power is **optional per vehicle** and off by default. Enable it only on an equipped vehicle; the backend must return usable data. Watt/capacity estimates are restricted to an **HEV profile with the corroborated raw 7200 main-capacity value**. Other profiles/ratings show **mapping unverified** and raw status/details without watt/capacity estimates. A matching rating alone does not extend the PowerBoost mapping to Lightning or another powertrain.

1. Enable Pro Power for the selected vehicle, then choose its A/B, total and capacity fields in **Customize widgets**. Keep ordinary readings enabled for a combined dashboard.
2. Enable outlets/Generator Mode using the vehicle's own controls. Apply a load to observe power draw. No load is needed just to install the app.
3. Open **Pro Power** to inspect saved estimates and source ages. Choose **View raw signals** for saved signal values, or **Copy redacted report** to review a redacted cached report before copying. These two actions make no Ford request. **Request status once…** is the separate confirmed status request; keep Scriptable open until it finishes.
4. **Read cached Pro Power** contacts Ford's cloud for its saved snapshot without a vehicle-status command. It may return the same older result.
5. Use the widget's confirmed **Refresh** for the combined flow.

| Reading | Meaning |
| --- | --- |
| **A / B** | Last-reported estimated circuit power, not a verified physical outlet position |
| **Total** | Combined supported outputs; A+B on the tested 7.2 kW system |
| **Capacity** | Estimated output capability in the corroborated mapping, not current consumption |
| **Status result age** | Age of a command result, not the embedded sample's timestamp |

The predecessor project tested one **US 7.2 kW F-150 PowerBoost**: circuit A at two loads, then A and B under load simultaneously, with a total consistent with their sum. Separate B accuracy, physical outlet mapping, other power ratings and regions remain unverified. **One raw unit ≈ one watt** has only been corroborated on that 7.2 kW system. This new multi-vehicle app needs its own live regression testing.

Treat values as **last-reported estimates**, not a live meter. Embedded sample freshness remains unverified. Missing or incomplete data shows **—**; missing B is not zero. When the vehicle or Pro Power is off, zeroed capacity/configuration fields do not establish a usable zero-watt measurement. The script does not enable Generator Mode, switch outlets or turn engine controls into generator controls.

## Refresh and measurement times

Enable **Wake / refresh** in that vehicle's **Vehicle features** to expose Refresh; otherwise the widget offers a passive **Fetch**. The app menu calls the combined action **Refresh vehicle data**. The widget's **Refresh** opens Scriptable and asks **“Refresh all widget data?”**. Confirm to request general vehicle status and, when enabled/available for that vehicle, Pro Power status, then read available cloud telemetry. Keep Scriptable open while bounded checks finish. The flow can take around a minute. If general status requests are disabled for that vehicle, the app cannot send that stage just because a widget was tapped.

The completion message identifies stages that completed, failed or were skipped. A request may be accepted without confirmed device completion. Cooldowns and server backoff can prevent another request; saved data is retained rather than relabeled as a new sample. Do not repeatedly retry or clear cooldowns.

**Fetch telemetry** reads Ford's stored cloud telemetry without an explicit vehicle wake/status request. That still uses the network. A successful cloud read does not guarantee new measurements. Root response time, fetch time, command time and individual measurement times differ. Compare each field's reported age in details; a newer tire reading does not make locks or temperature current.

If an individual reading has no valid measurement timestamp, its time stays unknown rather than using the cloud response time. Undated numeric updates cannot replace saved dated measurements. Tire readings use the newest dated sample for each reported wheel in both displays and alerts; conflicting pressures with the same timestamp use the lower value.

Pro Power's **Status result** age does not verify embedded sample time. A zero/old result may be all Ford returns while the vehicle is off. Refresh does not start the engine or switch Pro Power outlets. iOS decides when the Home Screen redraws after Scriptable saves data.

## Update the script

Run **Install FordPassWidgets**, choose Update and enter the exact existing FordPassWidgets script name. Alternatively, replace all code inside that same Scriptable script with the new **FordPassWidgets.js** contents. Keep the name so widgets stay connected. If renamed, reselect it in each widget. Normal updates retain this project's sign-in, vehicles, settings and cache; they do not import another project's data.

## Troubleshooting and reports

- **Wrong vehicle:** check the widget's `vehicle=` binding or default vehicle. Check the app's selected vehicle separately.
- **Missing controls:** review that vehicle's features and powertrain. New profiles start with controls disabled; another model's support does not enable yours.
- **Only Pro Power appears:** remove named reading words from Parameter, then choose ordinary fields as well as Pro Power in Customize widgets.
- **Refresh only opens Scriptable:** check the selected script and **When Interacting → Run Script**. If the confirmation does not appear, run the desired action from the script's menu and record the app version and what opened.
- **Old door/lock/temperature reading:** compare its own measurement time, then use confirmed Refresh. A cloud read or receipt cannot prove the field changed.
- **Fuel over 100%:** displayed fuel percentage is capped at 100; raw data is retained. Negative/invalid values remain unknown.
- **Already running / expired session:** let the prior action finish or close the stopped run, then rerun. A paused dialog can expire before saving or sending a command.

For model/feature support, start with **Troubleshooting → Model support report**. It uses cached data only: capability states, relevant EV/six-wheel readings, owner choices and source ages. It labels the effective powertrain separately from owner-selected and Ford-reported engine types. It makes no network request, sends no command and uploads nothing. It excludes model name/year, VIN, location, profile ID and tokens; add model/year/powertrain manually if you choose to share those. Review the report before posting. See the [Android feature inventory](ANDROID-FEATURES.md) for researched candidates and transport limits.

For unchanged outside temperature or a normalization issue, use the separate Vehicle data report. After Refresh, open **Troubleshooting → Vehicle data report → Copy report**. It attempts one passive cloud read, compares relevant raw values/times against cached and hypothetical normalized/merged values, and does not save candidate telemetry or send a command. Cached diagnostics remain available if the read fails. The `temperature` section and `cloudReadOutcome` help with temperature issues.

For Pro Power, open **Pro Power → View raw signals** or **Pro Power → Copy redacted report**. The same choices are available through **Troubleshooting → Pro Power report**. They use saved data without a Ford request, and the redacted report is reviewed before copying.

Review reports before sharing. They omit VIN, location, tokens, request identifiers, arbitrary payload strings and raw errors, but still contain vehicle states and timestamps. They are redacted, not anonymous. Nothing is uploaded automatically. Share the app version, model/year/powertrain, relevant ages, request outcome and an approximate dashboard comparison. Never post credentials, raw caches or unredacted details screenshots. See [CONTRIBUTING](CONTRIBUTING.md).

## Privacy and removal

**Runs locally. No project data collection.** FordPassWidgets runs in Scriptable on your device, without a developer-operated backend, analytics or tracking. It does not automatically send your account details, vehicle data, usage or reports to the project or its maintainers. Reports are previewed/copied locally; sharing one is your choice.

Local execution still uses the network: sign-in and vehicle requests go directly to Ford and its authentication/vehicle-service providers. The installer downloads public code from GitHub, and the install page is hosted on GitHub Pages. Those services handle their own network requests; the project does not operate a data-collection service.

Passwords are not saved. Ford tokens and username use Scriptable's shared Keychain, which other installed scripts can access. FordPassWidgets uses separate account and vehicle storage from its predecessors; separation is not an access barrier against an untrusted Scriptable script.

Vehicle profiles/settings, telemetry caches and photos are stored by Scriptable on your device. Some vehicle details also appear in Scriptable's local console logs and notifications. Security measures include Keychain token storage, confirmed opt-in controls and an installer that verifies a pinned release's SHA-256 before saving it. Device/platform backup settings remain your choice.

Local telemetry can include parked coordinates while enabled. Turning **Parked location** off removes cached position/place output and disables the location-based weather fallback for that vehicle; a widget Parameter cannot bypass the opt-out. An explicitly saved Home location is separate and remains in that vehicle's settings; use **Parked location → Clear Home** before turning the feature off if you want to remove it too. The inherited remote-start weather fallback may send an approximately 1 km-rounded position to Open-Meteo when the vehicle temperature is old. Location labels use the device's reverse geocoder. The install website has no Ford sign-in form or analytics.

Use **Sign out** before uninstalling to remove the saved account session credentials and disconnect all vehicle profiles. Widgets cannot show saved vehicle data again until the vehicles are authorized after sign-in. Sign-out retains profile settings and local telemetry/photos. Delete the Scriptable widget/installer scripts and Home/Lock Screen widgets; remove the **FordPassWidgets** folder from Scriptable's local documents if you also want to remove local telemetry/photos. Saved profile settings in Keychain are separate from that folder. Do not delete another project's storage or copy tokens/caches between projects.

This unofficial client depends on private Ford APIs and compatible connected services. It is distributed under the [MIT License](../LICENSE), with attribution to [rushilpunu/FordWidget](https://github.com/rushilpunu/FordWidget) and [markse123/FordWidget](https://github.com/markse123/FordWidget). FordPassWidgets is independent of Ford Motor Company.
