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
    await page.waitForTimeout(500)
    if (new URL(page.url()).searchParams.has('entity')) throw new Error(`Invalid entity ${bad} kept in the URL`)
    if (await page.getByTestId('entity-development').count()) throw new Error(`Invalid entity ${bad} opened the explorer`)
  }
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
  console.log('Historical browser smoke: time machine playback/steps/fixed comparison, country explorer (periods, absence, back/forward, deep links, comparison), dated borders/flag, exact-year population/refugees, event comparison, deep link, Today: PASS')
} finally {
  await browser.close()
}
