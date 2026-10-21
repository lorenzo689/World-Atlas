# Product experience

World Explorer opens with a public landing page, then offers a scenario catalogue before the globe.
Visitors can browse the static GitHub Pages demo without an account. The full deployment also offers
registration, sign-in, guest sessions, email verification and password recovery.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Product landing page |
| `/scenarios` | Scenario catalogue |
| `/explore` | Current globe and map tools |
| `/explore?ww1=1&year=1914` | First World War learning scenario |
| `/explore?ww2=1&year=1939` | Second World War learning scenario |
| `/explore?year=1886&compare=1914` | Historical boundary comparison |
| `/login` | Sign in, create an account, continue as guest or request a reset link |
| `/reset-password?token=…` | Set a replacement password from a single-use email link |

Authentication continues to use short-lived access tokens in memory and a rotating refresh token in
an HttpOnly cookie. The post-login `next` parameter is restricted to same-origin paths. Password
recovery returns the same confirmation for known and unknown addresses to avoid exposing account
membership. Registration requires email verification. These controls are implemented in the shared
authentication API and Spring Boot auth module.

## Historical scenarios

The First World War view uses CShapes 2.0 boundaries at 1 January of the selected year and a small,
curated set of dated event locations. It intentionally does not draw front lines or claim territorial
control. Event locations are approximate map anchors; each event links to an archival or museum
source. The historical boundary snapshot and event date are shown separately because they can be
months apart.

The Second World War scenario uses its existing dated boundary, event and schematic front layers.
Its panel explains the source dates and distinguishes front outlines from annexation and occupation.

## First World War sources

- [U.S. National Archives: World War I](https://www.archives.gov/topics/wwi)
- [U.S. National Archives: U.S. declaration of war against Germany](https://www.archives.gov/milestone-documents/address-to-congress-declaration-of-war-against-germany)
- [U.S. National Archives: Zimmermann Telegram](https://www.archives.gov/milestone-documents/zimmermann-telegram)
- [Imperial War Museums: Gallipoli campaign](https://www.iwm.org.uk/collections/item/object/205325969)
- [Imperial War Museums: First World War guide](https://www.iwm.org.uk/sites/default/files/files/2023-10/first_world_war_large_print_guide.pdf)

The map is a learning aid. Its satellite texture is modern imagery and does not depict wartime land
cover. See [historical data and licensing](HISTORY.md) and [the World War II source notes](WW2.md).
