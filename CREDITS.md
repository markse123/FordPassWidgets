# Credits

FordPassWidgets builds on work shared by the Ford widget and integration community. Thank you to the authors, maintainers, contributors and vehicle owners who made it possible.

## Widget authors and project lineage

| Public contributor | Verified contribution |
| --- | --- |
| [@rushilpunu](https://github.com/rushilpunu) | Created [FordWidget](https://github.com/rushilpunu/FordWidget): the original Scriptable widget foundation, Home/Lock Screen views, Ford account integration, confirmed vehicle actions, photos, gallery and configurable alerts. Original MIT copyright is retained. See the [initial widget commit](https://github.com/rushilpunu/FordWidget/commit/5e70cc00988d0d78bcfd28defcab02b0447e20cd) and [gallery/alerts commit](https://github.com/rushilpunu/FordWidget/commit/b5ee2b4e4f05be8a75d96e69b6c37a7baa1e0bbd). |
| [@markse123](https://github.com/markse123) | Developed the [FordWidget Pro Power fork](https://github.com/markse123/FordWidget), adding optional Pro Power monitoring, combined refresh, display-unit preferences, diagnostics, installation/docs and state/privacy fixes; maintains FordPassWidgets. See the [Pro Power addition](https://github.com/markse123/FordWidget/commit/d0e69887ebb85dfb8c54e9861117bc06517eaf44) and [US/Metric addition](https://github.com/markse123/FordWidget/commit/40bae5b8b963b0c7dbad6ee0dc251479bddc8a29). |

These roles were checked against the predecessors' public main-branch commit histories on 2026-11-09. Their history and MIT notices remain the source of authorship for inherited work. Future contributors are welcome through pull requests and their public commit history.

## Inherited Ford sign-in and API references

The original FordWidget [README credits](https://github.com/rushilpunu/FordWidget/blob/b7f7e2866c014445b2bec831c237925d3ca61b5f/README.md#credits) and source acknowledge these projects. FordPassWidgets carries that acknowledgment forward:

- [@marq24 and contributors — ha-fordpass](https://github.com/marq24/ha-fordpass): reference for FordPass sign-in, application identity and token-host details.
- [@marq24 and contributors — ha-fordconnect-query](https://github.com/marq24/ha-fordconnect-query): reference for FordConnect authentication/query routes and integration behavior.
- [@itchannel and contributors — fordpass-ha](https://github.com/itchannel/fordpass-ha): reference for FordPass integration and API routes.

These are reference-project credits. Their authors retain authorship of their own projects; this acknowledgment does not imply they maintain or endorse FordPassWidgets. Follow each project's own license and attribution when reusing its code.

## Owner testing and community feedback

Thanks to vehicle owners and the Ford forum community who share observations, compare readings with dashboards and report installation/layout issues. Testing inherited from the Pro Power fork includes one US 7.2 kW F-150 PowerBoost, with circuit A compared at two loads and A/B loaded together. That evidence remains limited to the tested system; [MODEL-SUPPORT](docs/MODEL-SUPPORT.md) records the boundaries.

Testers can choose a public handle for credit when submitting a report. We do not publish private identities, account details or vehicle identifiers. Anonymous testing reports and corrections are welcome too.

## Runtime and services

- [Scriptable](https://scriptable.app) provides the iPhone scripting, widget, Keychain and UI runtime.
- [Open-Meteo](https://open-meteo.com) provides the inherited optional weather fallback. Its location/privacy behavior is documented in [USAGE](docs/USAGE.md#privacy-and-removal).
- Ford's published documentation and application schemas inform the compatibility research summarized in [ANDROID-FEATURES](docs/ANDROID-FEATURES.md). FordPassWidgets is an independent project, with no claimed endorsement or affiliation with Ford Motor Company or forum administrators.

The [MIT License](LICENSE) and existing copyright notices apply. To add or correct an attributable credit, open a focused issue or PR with a public handle/project link and the contribution involved. See [CONTRIBUTING](docs/CONTRIBUTING.md).
