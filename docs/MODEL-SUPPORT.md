# Model support and verification

FordPassWidgets is designed to use FordPass vehicle data across a wider garage than the F-150 that started the predecessor projects. **A model appearing here is a design target, not a claim that its connected services, every reading or every command has been tested.** Ford controls account eligibility, available metrics and command capabilities.

## Intended coverage

| Vehicle group | Intended readings and behavior | Verification status |
| --- | --- | --- |
| F-Series gas/hybrid, including PowerBoost | Fuel/range, common vehicle status, configured tires and eligible owner-enabled controls; optional Pro Power status when reported; estimates only for the corroborated 7.2 kW HEV mapping | The predecessor was exercised on an F-150 PowerBoost. New multi-vehicle behavior still needs live regression testing. Other years/variants unverified; they do not inherit the watt mapping. |
| F-Series EV, including F-150 Lightning | EV charge/range, plug/charging state and common vehicle status; optional Pro Power raw-status verification only with usable backend data; no BEV watt/capacity mapping is asserted | Schema-based design; live EV payloads/behavior unverified. |
| Super Duty / dual-rear-wheel vehicles | Common status, fuel where reported, four/six individual tire positions and owner-set axle thresholds | Designed, not live-verified. No promised DEF conversion or trailer-tire telemetry. |
| Bronco / Bronco Sport | Common vehicle status, fuel/range and eligible owner-enabled controls | Designed, not live-verified. Model names do not establish the powertrain, transmission or available services. |
| Mustang combustion models | Common vehicle status, fuel/range and eligible owner-enabled controls | Designed, not live-verified. Manual-transmission and unknown configurations do not inherit automatic engine controls. |
| Mustang Mach-E | EV charge/range, plug/charging state and common vehicle status | Schema-based design; live model behavior unverified. |
| Other FordPass-connected Ford vehicles | Common recognized readings, with owner-reviewed configuration and unknown fields retained as unknown | Candidates for testing, not a blanket compatibility promise. |

US sign-in is the first-release focus. Canada and other account regions remain unverified. The app handles multiple vehicles for **one account**; multiple simultaneous accounts are outside this release.

## Feature boundaries

- **Common status:** locks, doors/hood, 12V battery, odometer, temperature, tires and location are shown only when usable data exists. Different fields can have different measurement times.
- **EV status:** traction-battery charge percentage is separate from 12V state of charge. EV range follows Ford's kilometre-based schema before display conversion. Recognized plug and charging enums are read-only. Unknown states do not imply disconnected or stopped.
- **Controls:** every new vehicle starts with commands disabled. Ford capability hints are suggestions, and the owner must enable appropriate actions. Engine start/stop requires an appropriate configured powertrain/transmission. A model name, a capability flag or Ford accepting a request does not prove physical completion.
- **Tires:** four/six-position handling is designed for available wheel metrics. Front/rear low-pressure thresholds are owner-configured and tire alerts start off. No universal tire threshold is safe to infer from a model name.
- **Optional Pro Power:** enable it per vehicle; the backend must supply usable data. It is monitoring plus a confirmed status request, without outlet/Generator Mode control. Watts/capacity are estimated only for HEV profiles with raw main capacity 7200; other profiles/ratings show mapping unverified and raw details, even if a BEV reports the same rating.
- **Freshness:** status-command completion, cloud-response time and embedded measurement time differ. No display should advertise a live feed or label unchanged samples as fresh.

## Pro Power evidence inherited from the predecessor

Testing on one US **7.2 kW F-150 PowerBoost** corroborated circuit A at two different loads and displayed **A and B under load simultaneously**. Both circuits were nonzero, and total output was consistent with their sum. That supports the A/B presentation and the one-raw-unit ≈ one-watt interpretation for that tested system.

Separate B calibration, physical bed/interior outlet mapping, other ratings (including 2.0/2.4/9.6 kW), other powertrain/vehicle variants and other regions remain unverified. A signal name or a capacity number alone is insufficient to extend that interpretation. This new project's account/profile/storage changes also need live regression testing. The corroborated mapping remains an estimate with unverified embedded sample time. Other profiles/ratings do not display watt/capacity estimates until their mapping is established.

## Research candidates

See the detailed [Android feature inventory](ANDROID-FEATURES.md), including exact fields/command names and eight model-screening templates. These are useful investigation areas, not announced or promised features. Research against the inspected Ford Android 6.25.0 build found per-vehicle capability gates rather than a universal model checklist; that build is not claimed to be the latest release. Model year, trim, market, activation and rollout flags can change what Ford exposes.

| Candidate | Current evidence boundary |
| --- | --- |
| Horn/lights, EV charging/conditioning, departure times, trailer-light check | Cloud command families were identified, but these controls are not implemented here. Eligibility, request/completion semantics and deliberate vehicle testing still need review. |
| Windows, frunk, tailgate/hatch | Traced Android controls use Phone As A Key over Bluetooth; that is not evidence of a Scriptable-accessible cloud route. |
| Zone lighting | Capability/legacy status metadata exists; a current consumer and command route were not established. |
| Trailer tire pressure / bidirectional power controls | Usable cloud behavior remains unproved. |

Practical testing priorities:

- Redacted BEV/PHEV validation for SOC, range and every observed plug/charging state; consistent behavior on Mach-E and Lightning.
- Model/region-specific garage discovery and cloud-status behavior, including older supported vehicles and account authorization changes.
- Six-wheel metric availability and owner-reviewed front/rear alert behavior across Super Duty variants.
- Additional Pro Power capacities, separate B accuracy and output scope. Control work needs a verified endpoint and a deliberate design before implementation.
- EV conditioning, charging commands/limits and charge completion timing. These remain excluded until command semantics, eligibility and units are established.
- DEF and trailer information, where available. Raw numeric fields are not sufficient evidence of units, scaling or display meaning.

## Help verify your vehicle

Start with **Troubleshooting → Model support report** for a cached redacted report; it makes no request and uploads nothing. Model name/year and identifiers are omitted, so add model-level context manually if you choose. See [CONTRIBUTING](CONTRIBUTING.md) for a short test-report template. Include model year, model/powertrain, app version and which readings/actions were observed. Compare timestamps and dashboard state; share redacted findings rather than raw payloads. Do not publish VINs, account details, coordinates, credentials or personal screenshots. A report for one vehicle adds evidence for that case without proving all variants.
