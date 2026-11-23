# Product experience

World Explorer opens with a public landing page. **Explore now** opens the present-day atlas;
its scenario menu opens independently scoped historical views.
Visitors can browse the static GitHub Pages demo without an account. The full deployment also offers
registration, sign-in, guest sessions, email verification and password recovery.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Product landing page |
| `/scenarios` | Scenario catalogue |
| `/explore` | Current globe and map tools |
| `/explore?scenario=ww1&year=1914` | First World War learning scenario |
| `/explore?scenario=ww2&year=1939` | Second World War learning scenario |
| `/explore?scenario=borders&year=1886&compare=1914` | Historical boundary comparison |
| `/login` | Sign in, create an account, continue as guest or request a reset link |
| `/reset-password?token=…` | Set a replacement password from a single-use email link |

Authentication continues to use short-lived access tokens in memory and a rotating refresh token in
an HttpOnly cookie. The post-login `next` parameter is restricted to same-origin paths. Password
recovery returns the same confirmation for known and unknown addresses to avoid exposing account
membership. Registration requires email verification. These controls are implemented in the shared
authentication API and Spring Boot auth module.

## Historical scenarios

### Changing borders: time machine

The timeline (1886–2019) steps through the existing CShapes snapshots of 1 January; there are no
interpolated intermediate borders. Controls, all keyboard-operable and labelled in German and English:

- **Play/Pause** with speeds 0.5×, 1× and 2× (one year per 1.7 s, 850 ms or 425 ms). Playback stops by
  itself at 2019; pressing Play at the end starts again at 1886.
- **One year earlier/later**, the year slider (arrow keys or mouse wheel) and **Go to year** (Enter or
  leaving the field; years outside 1886–2019 are rejected with a message). Any manual year change,
  selecting an event or a load error pauses playback.
- Playback schedules at most one next step, and only after the shown year is ready: the comparison
  areas and, when enabled, the territory layers of the current years must have finished loading. If
  the comparison or a layer cannot be updated, playback pauses and stays disabled until the year is
  changed or the error is retried.
- **Border events**: the existing dated events (`HISTORY_EVENTS`) appear as markers at their actual
  date on the track and as selectable entries. Selecting one opens the existing guided lesson with
  its before/after snapshot years, camera focus, steps, question and primary source. The lesson shows
  the event date (for example 3 October 1990) separately from the map snapshot dates (1 January 1989
  and 1 January 1991).
- **Comparison**: the comparison year stays fixed while the main year plays; both globes keep sharing
  one camera. **End comparison** closes it. The chosen presentation mode (political or satellite) is
  kept while the year changes.
- Camera flights to an event are instant when `prefers-reduced-motion` is set; the controls use no
  motion beyond colour transitions, which are disabled with reduced motion.

- **Country explorer**: selecting a state opens its dataset chronology (periods, labels, capitals,
  dated flags, documented events, sources) with buttons that move the timeline year, step between
  dataset periods or start a comparison. The selection stays open in years without a record and is
  shareable with `entity=`; Back/Forward restore it. Method and limits: [HISTORY.md](HISTORY.md).
- **Events**: the header control opens a searchable, filterable event list (region, theme, period)
  with globe markers for events with a documented place, a detail that separates event date and map
  date, and guided time travel (curated tours or the current results) with previous/next, pause and
  end. Shareable with `event=` and `tour=`; selecting events and starting tours are Back/Forward
  steps, tour steps replace the entry. Four regional history packs (Africa, Asia, Middle East,
  Americas) appear as cards with period, step count and introduction; a running pack keeps its
  introduction visible and offers a copy-link control.

Covered by `src/components/__tests__/HistoricalTimeline.test.tsx`, `src/lib/__tests__/timeMachine.test.ts`,
`src/components/__tests__/HistoricalDevelopment.test.tsx`, `src/lib/__tests__/historyEntity.test.ts`
and `npm run smoke:history`.

The First World War view uses CShapes 2.0 boundaries at 1 January of the selected year and a small,
curated set of dated event locations. A separate occupation layer adds schematic regional
reconstructions with independent source dates and actor filters. Event locations are approximate map anchors; each event links to an archival or museum
source. The historical boundary snapshot and event date are shown separately because they can be
months apart.

The Second World War scenario uses its existing dated boundary, event and schematic front layers.
Its panel explains the source dates and distinguishes front outlines from annexation and occupation.
See [scenario rules, control-layer coverage, limitations and licensing](SCENARIOS.md).

## First World War sources

- [U.S. National Archives: World War I](https://www.archives.gov/topics/wwi)
- [U.S. National Archives: U.S. declaration of war against Germany](https://www.archives.gov/milestone-documents/address-to-congress-declaration-of-war-against-germany)
- [U.S. National Archives: Zimmermann Telegram](https://www.archives.gov/milestone-documents/zimmermann-telegram)
- [Imperial War Museums: Gallipoli campaign](https://www.iwm.org.uk/collections/item/object/205325969)
- [Imperial War Museums: First World War guide](https://www.iwm.org.uk/sites/default/files/files/2023-10/first_world_war_large_print_guide.pdf)

The map is a learning aid. Its satellite texture is modern imagery and does not depict wartime land
cover. See [historical data and licensing](HISTORY.md) and [the World War II source notes](WW2.md).
