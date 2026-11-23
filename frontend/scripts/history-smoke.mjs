// Browser check for dated borders, flags, search and return to the current map.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path))
if (!chrome) throw new Error('Chrome/Edge is required for the history smoke test')

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 850 } })
  await page.route('https://api.worldbank.org/**/country/SYR/indicator/SP.POP.TOTL**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ lastupdated: '2026-10-19' }, [{ date: '2015', value: 18300000 }]]),
  }))
  await page.route('https://api.unhcr.org/population/v1/population/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [{ year: 2015, coo_iso: 'SYR', refugees: 4873236 }] }),
  }))
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser console:', message.text()) })
  const smokeUrl = new URL(process.env.SMOKE_URL ?? 'http://localhost:4173/')
  smokeUrl.searchParams.set('debug', '1')
  smokeUrl.searchParams.set('scenario', 'borders')
  smokeUrl.searchParams.set('year', '1990')
  await page.goto(smokeUrl.href, { waitUntil: 'domcontentloaded' })
  const slider = page.getByRole('slider', { name: /Year|Jahr/i }).first()
  await slider.waitFor()
  const setYear = async (year) => {
    await slider.evaluate((input, next) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, String(next))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, year)
    await page.waitForFunction((value) => [...document.querySelectorAll('section strong')].some((node) => node.textContent === String(value)), year)
  }
  await setYear(1990)
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  await page.waitForTimeout(1200)
  await slider.hover()
  await page.mouse.wheel(0, 120)
  await page.waitForFunction(() => [...document.querySelectorAll('section strong')].some((node) => node.textContent === '1991'))
  await setYear(1990)

  // Time machine: year steps, typed year, playback speed, automatic stop at the last snapshot, pause on
  // manual selection, event markers and a comparison year that stays fixed while the other year plays.
  const timeline = page.getByRole('region', { name: /History timeline|Historische Zeitleiste/ })
  const showsYear = (value) => timeline.locator('strong').filter({ hasText: new RegExp(`^${value}$`) }).waitFor()
  const playButton = timeline.getByRole('button', { name: /Play timeline|Zeitleiste abspielen/ })
  await timeline.getByRole('button', { name: /One year later|Ein Jahr später/ }).click()
  await showsYear(1991)
  await timeline.getByRole('button', { name: /One year earlier|Ein Jahr früher/ }).click()
  await showsYear(1990)
  const goTo = timeline.getByRole('spinbutton', { name: /Go to year|Zu Jahr springen/ })
  await goTo.fill('2020')
  await goTo.press('Enter')
  await timeline.getByRole('alert').waitFor()
  await showsYear(1990)
  await goTo.fill('2016')
  await goTo.press('Enter')
  await showsYear(2016)
  await timeline.getByRole('button', { name: /^(2× speed|2× Geschwindigkeit)$/ }).click()
  await playButton.click()
  await showsYear(2019)
  await timeline.getByText(/End of the available period|Ende des verfügbaren Zeitraums/).waitFor()
  await playButton.waitFor()
  await page.waitForURL(/year=2019/)
  await setYear(2000)
  await playButton.click()
  await showsYear(2001)
  await setYear(1950)
  await page.waitForTimeout(1500)
  await showsYear(1950)
  await playButton.waitFor()
  if (await timeline.getByTestId('event-marker').count() !== 4) throw new Error('Timeline does not mark the four dated events')
  await setYear(2005)
  await page.getByRole('button', { name: /^(Compare years|Jahre vergleichen)$/ }).click()
  await page.waitForURL(/year=2005.*compare=2004/)
  await page.getByText(/Shaded areas show actual territory|Schattierte Flächen zeigen reale Gebietsverluste/).waitFor({ timeout: 60000 })
  await playButton.click()
  await showsYear(2007)
  await timeline.getByRole('button', { name: /^(Pause)$/ }).click()
  if (!/compare=2004/.test(page.url())) throw new Error(`Playback changed the fixed comparison year: ${page.url()}`)
  await page.getByLabel(/Comparison year 2004|Vergleichsjahr 2004/).waitFor()
  await page.getByTestId('compare-fixed').getByText(/2004/).waitFor()
  await page.getByRole('button', { name: /^(End comparison|Vergleich beenden)$/ }).click()
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('compare'))
  if (await page.getByLabel(/Comparison year 2004|Vergleichsjahr 2004/).count()) throw new Error('Comparison globe still shown after ending the comparison')
  await setYear(1990)

  const search = page.locator('input[placeholder]').first()
  await search.fill('East Germany')
  await page.getByRole('button', { name: /East Germany/ }).click()
  await page.getByRole('heading', { name: 'East Germany' }).waitFor()
  // Country explorer: the selection is shareable and a browser history step.
  await page.waitForURL(/entity=H265/)
  const development = page.getByTestId('entity-development')
  await development.waitFor()
  await development.getByTestId('entity-map-date').getByText(/1 January 1990|1\. Januar 1990/).waitFor()
  await page.goBack()
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('entity'))
  await page.getByRole('heading', { name: 'East Germany' }).waitFor({ state: 'detached' })
  await page.goForward()
  await page.waitForURL(/entity=H265/)
  await page.getByRole('heading', { name: 'East Germany' }).waitFor()
  const flag = page.locator('aside img').first()
  await flag.waitFor()
  if (!(await flag.getAttribute('src'))?.includes('Flag_of_East_Germany.svg')) throw new Error('Incorrect East German flag')
  await page.waitForFunction(() => {
    const image = document.querySelector('aside img')
    return image?.complete && image.naturalWidth > 0
  }, null, { timeout: 15000 })
  const satellite = page.getByRole('radio', { name: /Satellite|Satellit/i }).first()
  if (await satellite.isVisible()) {
    await satellite.click()
    await page.mouse.move(500, 410)
    for (let i = 0; i < 6 && await page.evaluate(() => window.__globePose?.().altitude > 0.4); i++) await page.mouse.wheel(0, -500)
    try {
      await page.waitForFunction(() => window.__globePose?.().altitude < 0.45 && window.__globeDetail?.().imageTiles > 0, null, { timeout: 20000 })
    } catch (error) {
      console.error('Historical detail diagnostics:', await page.evaluate(() => ({ pose: window.__globePose?.(), detail: window.__globeDetail?.() })))
      throw error
    }
    await page.getByRole('note').getByText(/January 2004|Januar 2004/).waitFor()
  }
  if (process.env.SCREENSHOT_PATH) {
    await page.waitForTimeout(3000)
    await page.screenshot({ path: process.env.SCREENSHOT_PATH })
  }
  await setYear(1991)
  // The selection stays open and says the identifier is not in this snapshot (not that the state did not exist).
  await page.getByTestId('entity-absent').getByText(/Not in the 1 January 1991 snapshot|Nicht im Snapshot vom 1\. Januar 1991/).waitFor()
  await search.fill('East Germany')
  await page.getByText(/No historical country found|Kein historisches Land gefunden/).waitFor()
  if (await page.locator('header').getByRole('button', { name: /East Germany/ }).count()) throw new Error('East Germany still exists in 1991')
  await search.fill('')
  await page.getByRole('button', { name: /German reunification|Deutsche Wiedervereinigung/ }).click()
  const lesson = page.getByLabel(/Guided history lesson|Geführte Zeitreise/)
  await lesson.waitFor()
  await lesson.getByText(/3 October 1990|3\. Oktober 1990/).waitFor()
  await lesson.getByTestId('event-map-dates').getByText(/1 January 1989.*1 January 1991|1\. Januar 1989.*1\. Januar 1991/).waitFor()
  await page.getByRole('button', { name: /Next|Weiter/ }).click()
  await page.getByRole('button', { name: /Show answer|Antwort zeigen/ }).click()
  await page.waitForURL(/year=1989.*compare=1991/)
  await page.getByLabel(/Comparison year 1991|Vergleichsjahr 1991/).waitFor()
  await page.getByLabel(/Geometric border changes|Geometrische Grenzänderungen/).waitFor()
  try {
    await page.getByText(/Shaded areas show actual territory|Schattierte Flächen zeigen reale Gebietsverluste/).waitFor({ timeout: 60000 })
  } catch (error) {
    console.error('Area status:', await page.getByRole('status').allTextContents())
    throw error
  }
  await page.getByRole('link', { name: /Source|Quelle/ }).waitFor()
  await page.evaluate(() => { const url = new URL(window.location.href); url.searchParams.set('debug', '1'); window.history.replaceState(null, '', url.href) })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByLabel(/Comparison year 1991|Vergleichsjahr 1991/).waitFor()
  // Country explorer deep links: dataset periods, comparison and rejected identifiers.
  const explore = async (query) => {
    const url = new URL(smokeUrl)
    url.search = new URLSearchParams({ debug: '1', scenario: 'borders', ...query }).toString()
    await page.goto(url.href, { waitUntil: 'domcontentloaded' })
    await timeline.waitFor()
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  }
  await explore({ year: '1990', entity: 'H260' })
  await page.getByRole('heading', { name: 'West Germany', exact: true }).waitFor()
  await page.getByRole('button', { name: /Later dataset period: map of 1 January 1991|Spätere Datensatzperiode: Karte vom 1\. Januar 1991/ }).click()
  await showsYear(1991)
  await page.waitForURL(/year=1991.*entity=H260/)
  await page.getByRole('heading', { name: 'Germany', exact: true }).waitFor()
  await explore({ year: '1991', compare: '1992', entity: 'H365' })
  const entityComparison = page.getByTestId('entity-comparison')
  await entityComparison.getByText(/Soviet Union/).waitFor()
  await entityComparison.getByText(/^Russia$/).waitFor()
  await page.getByTestId('entity-shared-id').waitFor()
  await page.getByLabel(/Comparison year 1992|Vergleichsjahr 1992/).waitFor()
  await explore({ year: '1990', compare: '1991', entity: 'H265' })
  await page.getByTestId('entity-geometry').getByText(/not comparable|nicht vergleichbar/).waitFor()
  for (const bad of ['H99999', '<script>', 'h265']) {
    await explore({ year: '1990', entity: bad })
    // The loaded dataset decides; the correction follows the first render with data, so wait for it
    // instead of a fixed delay (a cold load needed about 510 ms after the busy veil disappeared).
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('entity'), null, { timeout: 15000 })
      .catch(() => { throw new Error(`Invalid entity ${bad} kept in the URL`) })
    if (await page.getByTestId('entity-development').count()) throw new Error(`Invalid entity ${bad} opened the explorer`)
  }
  // Historical events explorer: event date vs. map date, markers, map navigation, back/forward,
  // guided tours with pause, and rejected deep links.
  const markerCount = () => page.evaluate(() => window.__globeDetail?.().markers ?? -1)
  await explore({ year: '1941', event: 'barbarossa' })
  const events = page.getByTestId('event-explorer')
  const detail = events.getByTestId('event-detail')
  await detail.getByTestId('event-date').getByText(/22 June 1941|22\. Juni 1941/).waitFor()
  await detail.getByTestId('event-map-date').getByText(/1 January 1941|1\. Januar 1941/).waitFor()
  await detail.getByTestId('event-relation').getByText(/before the event|vor dem Ereignis/).waitFor()
  await page.waitForFunction(() => window.__globeDetail?.().markers === 21)
  await events.getByRole('group', { name: /^(Region)$/ }).getByRole('button', { name: /^(Africa|Afrika)$/ }).click()
  await page.waitForFunction(() => window.__globeDetail?.().markers === 1)
  await events.getByRole('group', { name: /^(Region)$/ }).getByRole('button', { name: /^(Africa|Afrika)$/ }).click()
  await detail.getByRole('button', { name: /Show map of 1 January 1942|Karte vom 1\. Januar 1942 zeigen/ }).click()
  await showsYear(1942)
  await page.waitForURL(/year=1942.*event=barbarossa/)
  await detail.getByTestId('event-relation').getByText(/after the event|nach dem Ereignis/).waitFor()
  await explore({ year: '1990' })
  if (await markerCount() > 0) throw new Error('Event markers shown while the events explorer is closed')
  await page.getByRole('button', { name: /^(Events|Ereignisse)$/ }).click()
  await events.getByTestId('event-list').getByRole('button', { name: /German reunification|Deutsche Wiedervereinigung/ }).click()
  await page.waitForURL(/event=german-unity/)
  await page.goBack()
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('event'))
  await events.waitFor({ state: 'detached' })
  await page.goForward()
  await page.waitForURL(/event=german-unity/)
  await events.getByTestId('event-detail').waitFor()
  await events.getByRole('button', { name: /^(Europe in the Second World War|Europa im Zweiten Weltkrieg)$/ }).click()
  await events.getByTestId('tour-step').getByText(/Step 1 of 8|Schritt 1 von 8/).waitFor()
  await events.getByRole('button', { name: /^(Pause tour|Zeitreise pausieren)$/ }).click()
  await showsYear(1940)
  await page.waitForURL(/event=poland-invasion.*tour=europe-ww2/)
  await events.getByRole('button', { name: /Following event|Folgendes Ereignis/ }).click()
  await events.getByTestId('tour-step').getByText(/Step 2 of 8|Schritt 2 von 8/).waitFor()
  await showsYear(1941)
  // Paused: no automatic step after the 7 s dwell time.
  await page.waitForTimeout(8000)
  await events.getByTestId('tour-step').getByText(/Step 2 of 8|Schritt 2 von 8/).waitFor()
  await showsYear(1941)
  await events.getByRole('button', { name: /^(End tour|Zeitreise beenden)$/ }).click()
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('tour'))
  // Real globe marker clicks: reset the camera (R), project the event's place with the debug probe,
  // click the canvas there and check that exactly that event is selected, for two different filters.
  const clickMarker = async (lat, lng) => {
    await page.keyboard.press('r')
    await page.waitForFunction(() => { const p = window.__globePose(); return Math.abs(p.lat - 22) < 0.5 && Math.abs(p.lng - 12) < 0.5 && Math.abs(p.altitude - 2.3) < 0.05 }, null, { timeout: 15000 })
    const point = await page.evaluate(([la, ln]) => window.__globeScreenPoint(la, ln), [lat, lng])
    if (!point.visible) throw new Error(`Marker at ${lat},${lng} faces away from the camera`)
    const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)
    if (target !== 'CANVAS') throw new Error(`Marker at ${lat},${lng} is covered by ${target}`)
    await page.mouse.click(point.x, point.y)
  }
  const selectedEvents = () => events.getByTestId('event-list').locator('button[aria-pressed="true"]')
  const regions = events.getByRole('group', { name: /^(Region)$/ })
  await regions.getByRole('button', { name: /^(Africa|Afrika)$/ }).click()
  await page.waitForFunction(() => window.__globeDetail?.().markers === 1)
  await clickMarker(30.83, 28.95)
  await events.getByTestId('event-detail').getByRole('heading', { name: /^(Second Battle of El Alamein|Zweite Schlacht von El Alamein)$/ }).waitFor()
  await events.getByTestId('event-date').getByText(/23 October 1942|23\. Oktober 1942/).waitFor()
  if (await selectedEvents().count() !== 1 || !/El Alamein/.test(await selectedEvents().innerText())) throw new Error('Marker click did not select exactly El Alamein')
  await regions.getByRole('button', { name: /^(Africa|Afrika)$/ }).click()
  await regions.getByRole('button', { name: /^(Europe|Europa)$/ }).click()
  await page.waitForFunction(() => window.__globeDetail?.().markers === 15)
  await clickMarker(49.35, -0.65)
  await events.getByTestId('event-detail').getByRole('heading', { name: /^(Normandy landings|Landung in der Normandie)$/ }).waitFor()
  await events.getByTestId('event-date').getByText(/6 June 1944|6\. Juni 1944/).waitFor()
  if (await selectedEvents().count() !== 1 || !/Normand/.test(await selectedEvents().innerText())) throw new Error('Marker click did not select exactly the Normandy landings')
  await page.getByRole('button', { name: /^(Events|Ereignisse)$/ }).click()
  await events.waitFor({ state: 'detached' })
  await page.waitForFunction(() => window.__globeDetail?.().markers === 0)
  // Regional history packs: start from the pack card, introduction, progress, map year rules
  // (an event on 1 January is on that day's map) and a deep link into the middle of a pack.
  await page.getByRole('button', { name: /^(Events|Ereignisse)$/ }).click()
  await events.getByRole('button', { name: /^(Start history pack: Africa Through Independence|Geschichtspaket starten: Afrika auf dem Weg zur Unabhängigkeit)$/ }).click()
  await events.getByTestId('tour-step').getByText(/Step 1 of 17|Schritt 1 von 17/).waitFor()
  await events.getByRole('button', { name: /^(Pause tour|Zeitreise pausieren)$/ }).click()
  await events.getByTestId('tour-intro').getByText(/recognition and independence can fall on different days|Anerkennung und Unabhängigkeit können auf verschiedene Tage fallen/).waitFor()
  await events.getByRole('progressbar').waitFor()
  await showsYear(1952)
  await page.waitForURL(/event=libya-1951.*tour=africa-independence/)
  await events.getByRole('button', { name: /Following event|Folgendes Ereignis/ }).click()
  await events.getByTestId('tour-step').getByText(/Step 2 of 17|Schritt 2 von 17/).waitFor()
  await showsYear(1956)
  await events.getByTestId('event-relation').getByText(/shows the event day|zeigt den Ereignistag/).waitFor()
  await explore({ year: '1968', event: 'six-day-war-1967', tour: 'middle-east' })
  await events.getByTestId('tour-step').getByText(/Step 5 of 8|Schritt 5 von 8/).waitFor()
  await events.getByTestId('event-detail').getByText(/Six-Day War begins|Beginn des Sechstagekriegs/).first().waitFor()
  await events.getByTestId('tour-intro').waitFor()
  for (const query of [{ event: 'nope' }, { event: '<script>' }, { tour: 'nope' }]) {
    await explore({ year: '1990', ...query })
    await page.waitForFunction(() => { const p = new URL(window.location.href).searchParams; return !p.has('event') && !p.has('tour') }, null, { timeout: 15000 })
      .catch(() => { throw new Error(`Invalid event link kept: ${page.url()}`) })
    if (await events.count()) throw new Error(`Invalid event link opened the explorer: ${JSON.stringify(query)}`)
  }
  await explore({ year: '1942', event: 'midway', tour: 'europe-ww2', entity: 'H265', compare: '1943' })
  await events.getByTestId('event-detail').waitFor()
  await page.waitForFunction(() => { const p = new URL(window.location.href).searchParams; return !p.has('tour') && p.get('event') === 'midway' && p.get('compare') === '1943' && p.get('entity') === 'H265' })
  await setYear(2015)
  await search.fill('Syria')
  await page.getByRole('button', { name: /Syria/ }).click()
  const context = page.getByLabel(/Historical data context|Historischer Datenkontext/)
  await context.getByText('18,300,000').waitFor({ timeout: 20000 })
  await context.getByText('4,873,236').waitFor()
  await setYear(2014)
  await context.getByText(/No observation|Keine Beobachtung/).first().waitFor()
  await page.getByRole('link', { name: /Scenarios|Szenarien/, exact: true }).click()
  await page.getByRole('link', { name: /The world today|Die Welt heute/ }).click()
  await page.waitForURL(/scenario=today/)
  const todayUrl = new URL(page.url()); todayUrl.searchParams.set('debug', '1')
  await page.goto(todayUrl.href, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Conflicts|Konflikte/ }).click()
  const conflictPanel = page.getByRole('complementary', { name: /Understand conflicts|Konflikte verstehen/ })
  await conflictPanel.waitFor()
  try {
    await page.waitForFunction(() => window.__globeDetail?.().conflictLineSegments > 0, null, { timeout: 15000 })
  } catch (error) {
    console.error('Conflict detail diagnostics:', await page.evaluate(() => ({ pose: window.__globePose?.(), detail: window.__globeDetail?.(), panels: [...document.querySelectorAll('aside')].map((a) => a.textContent?.slice(0, 100)) })))
    throw error
  }
  await conflictPanel.getByText(/estimated contact zone|geschätzte Kontaktzone/i).first().waitFor()
  if (process.env.CONFLICT_SCREENSHOT_PATH) {
    await conflictPanel.getByRole('button', { name: /Ukraine/ }).click()
    await page.waitForTimeout(1800)
    await page.screenshot({ path: process.env.CONFLICT_SCREENSHOT_PATH })
  }
  await conflictPanel.getByRole('button', { name: /Gaza/ }).click()
  await conflictPanel.getByText(/Fragile ceasefire|Fragile Waffenruhe/).waitFor()
  await conflictPanel.getByRole('link', { name: /UN OCHA/ }).waitFor()
  await conflictPanel.getByRole('button', { name: /Close conflicts|Konflikte schließen/ }).click()
  if (pageErrors.length) throw new Error(pageErrors.join('; '))
  console.log('Historical browser smoke: time machine playback/steps/fixed comparison, country explorer (periods, absence, back/forward, deep links, comparison), events explorer (dates, markers, marker clicks, tours, regional packs, links), dated borders/flag, exact-year population/refugees, event comparison, deep link, Today: PASS')
} finally {
  await browser.close()
}
