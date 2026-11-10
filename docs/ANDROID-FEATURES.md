# Ford Android feature research

This is a **static research inventory**, not a list of features guaranteed for a model. It separates what FordPassWidgets implements from possible cloud additions, Bluetooth-only evidence and unresolved fields. Start with [MODEL-SUPPORT](MODEL-SUPPORT.md) for current scope and [USAGE](USAGE.md) to configure the app. [Contributions and redacted model reports are welcome](CONTRIBUTING.md).

## What was inspected

Research date: **2026-11-09**. The Android artifact was inspected offline, without installing/running it, signing into an account or calling Ford vehicle APIs.

| Artifact metadata | Value |
| --- | --- |
| Package | `com.ford.fordpass` |
| Manifest version name / code | `6.25.0` / `2023409` |
| Minimum / target Android SDK | `29` / `36` |
| APK SHA-256 | `6bbc1522f23f3df09ea2ff9af2951e0dbc44a54acb064fee0e88d657ed14af31` |
| Embedded signing-certificate SHA-256 | `222c72cd8f6e3fc05635be1aded79f0d7450f707df786ec91e07871160d5554b` |

Offline verification checked the APK's v2/v3 signatures and chunked content digests against its embedded signer. **That is artifact-integrity verification, not an independently obtained Google Play certificate pin.** The artifact is a base split, not a complete install set. No APK, extracted proprietary source, app package or private vehicle capture is distributed with this project.

Call it the **inspected build 6.25.0**, not the verified latest release. The [official US Google Play listing](https://play.google.com/store/apps/details?id=com.ford.fordpass&hl=en_US), checked on the research date, showed an update date of October 23, 2026 but did not expose a current version name in the rendered/public text examined. The manifest supplies no release timestamp; file/ZIP times do not establish one.

## How Ford decides what appears

The inspected garage model has per-vehicle `capabilities`, `profile`, `userAuthStatus`, `userRoles` and other account metadata. Its response model is a vehicle array. Model names are not a substitute for these runtime fields.

- `FeatureVisibility` uses exact values **`Display`**, **`NoDisplay`** and **`DisplayDisabled`**. The traced eligibility helper accepts `Display`; disabled or unknown visibility is not permission to send a command.
- `profile.engineType` distinguishes **`ICE`**, **`HEV`**, **`PHEV`** and **`BEV`**. A PowerBoost HEV must not inherit BEV charging/conditioning behavior merely because both are electrified.
- Useful profile fields include `make`, `model`, `year`, `transmissionIndicator`, `numberOfTires`, `proPowerWattage`, `supportsStatusRefresh`, `numberOfLightingZones`, cargo/latch configuration and activation data. They describe equipment/configuration, not measurement units or proof of a working command.
- Year, trim, market, activation, service eligibility, telemetry version and rollout flags can change what is visible. FordPassWidgets additionally requires owner-enabled command permissions; a Ford capability hint does not enable a new profile's controls.

Ford also describes connected functions as vehicle/service dependent in its [Ford app guide](https://www.ford.com/technology/ford-app/) and [Connected Services information](https://www.ford.com/technology/connected-services/). Those pages corroborate the general product families and prerequisites, not the private API contracts below.

### Capability names useful to contributors

| Family | Inspected properties |
| --- | --- |
| Vehicle/health | `comprehensiveStatus`, `oilLife`, `tirePressureMonitoring`, `dieselExhaustFluid`, `vehicleLifeCycleMode` |
| Remote access/climate | `remoteLock`, `remoteStart`, `remotePanicAlarm`, `remoteWindowCapability`, `remoteClimateControl`, `electricVehicleOnDemandConditioning`, `offPlugConditioning`, `scheduleStart`, `departureTimes`, `vehicleStartInhibit` |
| Energy | `vehicleChargingStatusExtended`, `displayPreferredChargeTimes`, `globalStartStopCharge`, `onetimeChargeLimit`, `tripAndChargeLogs`, `plugAndCharge`, `payForCharge`, `bidirectionalPowerTransferRemoteControl` |
| Truck productivity | `proPowerOnBoard`, `trailerLightCheck`, `zoneLighting` |
| Software/security | `displayOTAStatusReport`, `otaRemoteCommands`, `guardMode`, `paak`, `stolenVehicleServices`, `stolenVehicleStatus`, `userAuthFlow` |
| Privacy | `ccsConnectivity`, `ccsVehicleData`, `ccsLocation`, `ccsDrivingCharacteristics` |
| Boolean exceptions | `extendRemoteStart`, `showEVBatteryLevel` |

Most feature entries use `FeatureVisibility`. Privacy settings use `On`/`Off`/`Unavailable`; `stolenVehicleStatus` and `userAuthFlow` have specialized enums. The two Boolean exceptions must not be parsed as visibility strings. Traced location eligibility requires connectivity, vehicle-data and location settings all on.

## Feature inventory and release boundary

**Implemented** means there is a FordPassWidgets implementation, with the model-testing limits in [MODEL-SUPPORT](MODEL-SUPPORT.md). It does not mean every live variant has been verified. **Cloud candidate** means a route/type was found, not that the action is ready or authorized. **Bluetooth evidence** is not a Scriptable-accessible cloud contract. **Unresolved** means units, transport, consumer or eligibility still needs proof.

| Feature | Useful exact schema/capability/command names | Evidence and FordPassWidgets disposition |
| --- | --- | --- |
| Fuel/range | `fuelLevel`, `fuelRange` | **Implemented monitoring.** Numeric fuel display is capped at 100%; range uses established distance conversion. No invented tank capacity. |
| EV charge/range | `xevBatteryStateOfCharge`, `xevBatteryActualStateOfCharge`, `xevBatteryRange`, `xevBatteryMaximumRange`; `showEVBatteryLevel` | **Implemented read-only monitoring** for recognized primary fields. SOC is percent; range input is kilometres. Primary/actual SOC and maximum range are distinct fields, not interchangeable aliases. Live EV variants need validation. |
| Plug/charging status | `xevPlugChargerStatus`, `xevBatteryChargeDisplayStatus`; `vehicleChargingStatusExtended` | **Implemented recognized states.** Plug `CONNECTED`/`DISCONNECTED` is separate from charging. Charging enums include `IN_PROGRESS`, `SCHEDULED`, `COMPLETED`, `DISCHARGING`, `NOT_READY`, `PAUSED`, `STOPPED`, `NOT_PLUGGED_IN`, faults and `UNKNOWN`. |
| Charge completion timing | `xevBatteryTimeToFullCharge`; charge-event `chargeEndTime` | **Unresolved duration unit.** An absolute charge-end timestamp is different from a raw time-to-full duration. Do not fabricate an ETA from the latter. |
| 12V battery | `batteryVoltage`, `batteryStateOfCharge`, `batteryLoadStatus`; `vehicleBattery` | **Implemented common battery monitoring** where recognized. 12V is separate from traction SOC. `PRIMARY_BATTERY`, `ACCESSORY_BATTERY`, `BACKUP_BATTERY`, `UNKNOWN_BATTERY` identify battery scope; a health enum is not a measured percentage/voltage. |
| Tires / dual rear wheels | `tirePressure`, `tirePressureStatus`, `tirePressureSystemStatus`; `numberOfTires`, `tirePressureMonitoring` | **Implemented four/six-position monitoring and owner thresholds.** Wheel enums distinguish `FRONT_LEFT/RIGHT`, `REAR_LEFT/RIGHT`, and rear `INNER/OUTER` positions. Missing positions stay unknown; no universal low-pressure threshold. |
| Locks, doors, hood | `doorLockStatus`, `doorStatus`, `hoodStatus`, `eLatchDoorLockStatus`; `comprehensiveStatus` | **Implemented common status.** Keep component coverage and individual times; partial or unknown data cannot establish healthy/closed status. |
| Odometer, outside temperature, location, photos | Common vehicle metrics and garage/photo services | **Implemented inherited readings/views** where available, retaining source times and location opt-out. A new cloud response does not freshen an unchanged sample. |
| Lock/unlock and remote engine | Cellular `lock`, `unlock`, `remoteStart`, `cancelRemoteStart`; `remoteLock`, `remoteStart`, Boolean `extendRemoteStart` | **Existing confirmed controls retained**, subject to owner opt-in and configuration. Lock and unlock share the `remoteLock` capability. Start/extend share a command family; that does not authorize automatic extension or EV conditioning. |
| Pro Power status | `updatePTTBStatusCommand` version `1.0.0`; `proPowerOnBoard`, `proPowerWattage`, power-mode events and `pttbStatusDataV2`; raw `DcacOut1Pw2Dsply`, `DcacOut2Pw2Dsply`, `DcacOutPwDsplyMx` | **Implemented optional monitoring and one-shot status request.** Android has one-shot/continuous/cancel modes and rollout gates; this app does not promise continuous sampling. Watt/capacity estimates are gated to an HEV profile with raw main capacity 7200, following the predecessor's corroborated 7.2 kW PowerBoost mapping. Other profiles/ratings retain raw status/mode with mapping-unverified output; a BEV reporting 7200 does not inherit that scale. No outlet/Generator Mode switching was established. |
| Horn/lights | `startPanicCue`; `remotePanicAlarm` | **Cloud candidate, not implemented.** Duration units, restrictions and completion handling still need a full trace/test. |
| EV charge controls/targets | `startGlobalChargeCommand`, `cancelGlobalChargeCommand`, `pauseGlobalChargeCommand`, `updateChargeSettingsCommand`; `globalStartStopCharge`, `onetimeChargeLimit` | **Cloud candidates, not implemented.** `globalTargetSoc`, `globalDCTargetSoc`, `globalReserveSoc`, `globalCurrentLimit`, `globalDCPowerLimit`, `chargeMode` and `autoChargePortUnlock` need valid-range, entitlement and response policy. |
| EV climate/conditioning | `updatePreconditioningCommand` version `2`; `electricVehicleOnDemandConditioning`, `remoteClimateControl`, `offPlugConditioning` | **Cloud candidate, not implemented.** `preconditioningDuration` and `vehiclePreconditionSetting` are integer fields; units/semantics are not established here. High/Medium/Low/Off UI choices do not prove a target-Celsius contract. |
| Departure/charge schedules | `enableDepartureTimes`, `disableDepartureTimes`, `updateDepartureTimes`; `departureTimes`, `displayPreferredChargeTimes` | **Cloud candidates, not implemented.** Date, time-zone, day and model-specific behavior must be established before writes. `scheduleStart` metadata alone is insufficient. |
| Window status | `windowStatus`, `vehicleWindow`, `vehicleSide`, occupant role; range-valued `WindowStatus` | **Cloud schema candidate, not implemented.** Numeric `doubleRange`/`intRange` lower/upper bounds are not generic OPEN/CLOSED door enums. Exact range meaning/coverage remains unresolved. |
| Windows up/down | PAAK `GLOBAL_OPEN`, `GLOBAL_CLOSE`; `remoteWindowCapability` | **Traced transport: Phone As A Key over Bluetooth.** No generic cloud route was established; no Scriptable control is promised. No convertible-roof command was proved. |
| Frunk/tailgate/hatch | PAAK `UNLOCK_FRUNK`, `TAILGATE_RELEASE`, `POWER_TAILGATE`, `LIFT_GATE_RELEASE`, `POWER_LIFT_GATE`; cargo profile | **Traced transport: PAAK Bluetooth.** Cargo `Power`/`ELatch` differs from `Manual`/`None`; the closure type changes the action. Profile equipment is not cloud-route proof. |
| Diesel exhaust fluid | `dieselExhaustFluidLevel`, `dieselExhaustFluidLevelRangeRemaining`; `dieselExhaustFluid` | **Cloud/schema candidate, not displayed.** Percent/range units and scaling are unproved. Legacy LOW/EMPTY/CONTAMINATED alerts are a separate shape, not proof of numeric units. |
| Trailer light check | `startTrailerLightCheck`, `stopTrailerLightCheck`, `trailerLightCheckStatus`; `trailerLightCheck` | **Cloud candidate, not implemented.** Capability and rollout both gate it. Status includes `COMPLETE`, `IN_PROGRESS`, `STOPPED`, `UNKNOWN`; failures include ignition, battery, lights, trailer connection and stationary-state conditions. |
| Trailer tire/temperature/payload | No matching current metric/command contract established in the bounded trace | **Unresolved.** Trailer-light-check support does not establish trailer TPMS, temperature or payload telemetry. |
| Zone lighting | `zoneLighting`, `numberOfLightingZones`; legacy front/left/rear/right status model | **Metadata/legacy schema only.** No current coded consumer/active command route was established. Not implemented. |
| Bidirectional power | `bidirectionalPowerTransferRemoteControl` | **Capability metadata only.** No usable command/payload consumer was established. Do not equate it to Pro Power or promise vehicle-to-home control. |
| Oil, service, recalls | `oilLifeRemaining`, `oilLife`; recall counters and service/health services | **Oil monitoring retained.** Service history, appointments and recall integration are separate unimplemented services, not current measurement fields. |
| OTA/software updates | `getASUSettingsCommand`, `publishASUSettingsCommand`, `scheduleASUActivationCommand`, `IVSUUserInterfaceCommand`; `displayOTAStatusReport`, `otaRemoteCommands` | **Cloud candidates, not implemented.** Scheduling/install/configuration mutations must never be folded into ordinary widget Refresh. |
| Guard/security/start inhibit | `guardMode`, `stolenVehicleServices`, `stolenVehicleStatus`, `vehicleStartInhibit`, `userAuthFlow` | **Service/capability evidence only for this project.** No generic widget-readable feed or safe command contract is established by those names. |
| Trip/charge logs and public charging | `tripAndChargeLogs`, `payForCharge`, `plugAndCharge` | **Separate service candidates, not implemented.** Subscription, market and consent may gate them independently. |

The inspected cloud command service accepts typed commands through a vehicle command route; a command type's presence does not prove authorization, completion or a fresh measurement. Request-body fields such as `type`, `version`, `wakeUp`, `properties` and `tags` also require command-specific semantics. This document intentionally provides no runnable vehicle-command examples.

## Model-by-model screening guide

These eight rows are **ways to screen an actual vehicle's profile and payload**, not a hardcoded eligibility table. Check runtime capabilities, owner configuration and measurements rather than enabling a feature because its model name appears here.

| Vehicle | What to screen for in its actual garage record and passive data |
| --- | --- |
| **F-150 gas / ICE** | Fuel/range, oil, 12V, tires and component status. Pro Power/trailer-light candidates only with actual equipment/visibility; do not infer a fixed 2.0 kW rating from the name. |
| **F-150 PowerBoost / HEV** | Hybrid-aware fuel/oil/12V/tires/status and actual Pro Power equipment. HEV does not establish plug charging or departure-schedule eligibility. Pro Power can still be limited by app rollout gates. |
| **Super Duty** | Fuel/oil/12V/status and actual four/six-wheel inventory. DEF requires eligible data plus established units before display. Check the reported Pro Power equipment; trailer tire telemetry remains unproved. |
| **F-150 Lightning / BEV** | Traction SOC/range, plug/charging, 12V, tires/status and actual Pro Power rating where eligible. Trailer-light check is a candidate only when exposed. Traced PAAK frunk/tailgate controls do not prove a cloud route. |
| **Bronco** | Common fuel/oil/12V/tires/status. Evaluate actual transmission, activation and capabilities for commands. Do not attach truck-specific Pro Power/DEF or BEV behavior by name. |
| **Bronco Sport** | Its own garage profile and common readings; treat it independently of Bronco name matching. Do not infer truck-specific equipment or BEV behavior. |
| **Mustang combustion / ICE** | Common fuel/oil/12V/tires/status and eligible owner-enabled controls. Do not inherit Mach-E/BEV features or infer a convertible-roof command from the name. |
| **Mustang Mach-E / BEV** | Traction SOC/range, plug/charging, 12V, tires and status. Traced PAAK cargo/window operations are Bluetooth; do not assume truck Pro Power equipment. |

## Official corroboration and evidence limits

The exact symbols above come from the identified Android artifact's manifest, schema declarations, command enums and traced consumers. They are paraphrased research findings, not copied proprietary implementations. This public guide includes no extracted app package, raw DEX/source, private response or local research path.

- [Ford app features and prerequisites](https://www.ford.com/technology/ford-app/) describe the broad vehicle/EV/remote families and activation requirements. They do not establish a private endpoint contract.
- [Ford Connected Services](https://www.ford.com/technology/connected-services/) explains that availability varies by vehicle/service configuration.
- [Ford Australia's trailer-light-check instructions](https://www.ford.com.au/support/how-tos/ford-app/ford-app-supported-features/how-do-i-use-the-trailer-light-check-feature) explicitly describe a cloud command and ignition, park, battery, lights and trailer prerequisites. It is regional guidance; do not apply its numeric battery threshold universally.
- [The 2026 F-150 Lightning owner's manual](https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/2026_F-150_Lightning_OM_enUSA_V1.pdf) describes an app/touchscreen trailer-light check. [The 2024 Lightning quick-reference guide](https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/24MY_F150_BEV_QRG_ENG_V1.pdf) and [Ford's published PAAK service program](https://static.nhtsa.gov/odi/tsbs/2023/MC-10248070-0001.pdf) give equipment/year-specific context; they are not universal compatibility promises.

To improve the evidence, start with **Troubleshooting → Model support report** in FordPassWidgets. It uses cached redacted model-support data, does not send a command and uploads nothing. Add model/year/powertrain manually if you choose to share a report; those identifying profile fields are deliberately omitted from the report. Use the separate Vehicle data report only when raw-value/time normalization evidence is needed. See the [reporting guide](CONTRIBUTING.md#test-a-real-vehicle).
