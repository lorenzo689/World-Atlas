import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
if (!chrome) throw new Error('Chrome/Edge is required')
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist'] })
const base = new URL(process.env.SMOKE_URL ?? 'http://localhost:5173/explore')
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(60000)
  const errors = []
  const requests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  const open = async (scenario, extra = {}) => {
    const url = new URL(base)
    url.search = new URLSearchParams({ scenario, debug: '1', ...extra }).toString()
    await page.goto(url.href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!window.__globeDetail, null, { timeout: 120000 })
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 120000 })
  }
  const areas = async () => {
    await page.waitForFunction(() => window.__globeDetail?.().territoryAreas > 0, null, { timeout: 120000 })
    const triangles = await page.evaluate(() => window.__globeDetail().territoryTriangles)
    if (!triangles || triangles > 100000) throw new Error(`Regional occupation mesh exceeds budget: ${triangles}`)
  }
  await open('today', { year: '1942', compare: '1914', ww2: '1', entity: 'H265' })
  if (new URL(page.url()).searchParams.has('year')) throw new Error('Today retained a historical year')
  if (new URL(page.url()).searchParams.has('entity') || await page.getByTestId('entity-development').count()) throw new Error('Today retained a historical entity')
  if (await page.getByRole('slider', { name: /Year|Jahr/ }).count()) throw new Error('Today exposes a historical timeline')
  await areas()
  const panel = page.getByTestId('territory-panel').first()
  await panel.getByTestId('territory-date').waitFor()
  const checkboxes = panel.getByRole('checkbox')
  for (let i = 1; i < await checkboxes.count(); i++) await checkboxes.nth(i).uncheck()
  await page.waitForFunction(() => window.__globeDetail?.().territoryAreas === 0)
  await checkboxes.nth(1).check()
  await areas()
  await panel.getByTestId('territory-sources').locator('summary').click()
  if (!await panel.getByRole('link').count()) throw new Error('No territory source attribution')
  const historicRequests = requests.length
  await open('ww1', { year: '1942', compare: '1939' })
  await page.waitForURL(/year=1914/)
  await areas()
  if (await page.getByRole('radio', { name: /Data|Daten/ }).count() || await page.getByRole('button', { name: /Conflicts|Konflikte/, exact: true }).count() || await page.getByRole('slider').count()) throw new Error('WWI exposes another scenario’s tools')
  // Close zoom is where modern border streaming would activate; history must remain isolated.
  await page.mouse.move(900, 400)
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => window.__globePose().altitude)) < 0.3) break
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(250)
  if (requests.slice(historicRequests).some((url) => url.startsWith('https://tiles.openfreemap.org/'))) throw new Error('Historical close zoom requested modern borders')
  await page.getByRole('group', { name: /War year|Kriegsjahr/ }).getByRole('button', { name: '1918' }).click()
  await panel.locator('time[datetime="1918-05-01"]').waitFor()
  await areas()
  await open('ww2', { year: '1942', compare: '1914', entity: 'H255' })
  if (new URL(page.url()).searchParams.has('compare')) throw new Error('WWII retained comparison')
  if (new URL(page.url()).searchParams.has('entity') || await page.getByTestId('entity-development').count()) throw new Error('WWII retained a historical entity')
  await areas()
  if (requests.slice(historicRequests).some((url) => /\/api\/conflicts(?:\?|$)/.test(url))) throw new Error('Historical scenario requested current conflict data')
  await page.getByRole('group', { name: /Theater|Kriegsschauplatz/ }).getByRole('button', { name: /Asia|Asien/ }).click()
  await page.waitForFunction(() => window.__globeDetail?.().territoryAreas === 0)
  await page.getByRole('group', { name: /Theater|Kriegsschauplatz/ }).getByRole('button', { name: /All|Alle/, exact: true }).click()
  await areas()
  await open('borders', { year: '1991' })
  await panel.getByRole('checkbox').first().check()
  await panel.getByRole('status').getByText(/No sourced|keine belegten/).waitFor()
  await page.waitForFunction(() => window.__globeDetail?.().territoryAreas === 0)
  // "R" resets the camera to the default view (GlobeView DEFAULT_POSE) in every scenario, but not
  // while typing in a search field or with a modifier, and never changes the scenario or year.
  const pose = () => page.evaluate(() => window.__globePose())
  const atDefault = () => page.waitForFunction(() => {
    const p = window.__globePose()
    return Math.abs(p.lat - 22) < 0.5 && Math.abs(p.lng - 12) < 0.5 && Math.abs(p.altitude - 2.3) < 0.05
  }, null, { timeout: 15000 })
  const zoomIn = async () => {
    await page.mouse.move(600, 450)
    for (let i = 0; i < 20 && (await pose()).altitude > 1.2; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(80) }
    await page.waitForTimeout(600)
  }
  const unchanged = async (before, label) => {
    await page.waitForTimeout(1500)
    const after = await pose()
    if (Math.abs(after.altitude - before.altitude) > 0.05) throw new Error(`${label} moved the camera (${before.altitude} -> ${after.altitude})`)
  }
  for (const [scenario, extra] of [['today', {}], ['borders', { year: '1991' }], ['ww1', { year: '1916' }], ['ww2', { year: '1942' }]]) {
    await open(scenario, extra)
    const url = page.url()
    await zoomIn()
    if ((await pose()).altitude > 1.5) throw new Error(`${scenario}: could not move the camera away from the default view`)
    const search = page.locator('input[role="combobox"], input[type="search"]').first()
    await search.click()
    let before = await pose()
    await page.keyboard.press('r')
    await unchanged(before, `${scenario}: R typed into the search field`)
    await search.fill('')
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    before = await pose()
    await page.keyboard.press('Alt+r')
    await unchanged(before, `${scenario}: Alt+R`)
    await page.keyboard.press('r')
    await atDefault()
    if (page.url() !== url) throw new Error(`${scenario}: camera reset changed the URL (${url} -> ${page.url()})`)
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const mobileUrl = new URL(base); mobileUrl.search = 'scenario=ww1&year=1916'
  await mobile.goto(mobileUrl.href, { waitUntil: 'domcontentloaded' })
  await mobile.getByTestId('territory-date').waitFor({ timeout: 120000 })
  if (await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile scenario overflows horizontally')
  // Country explorer on a phone: the bottom sheet holds the dataset chronology without overflow.
  const explorerUrl = new URL(base); explorerUrl.search = 'scenario=borders&year=1990&entity=H265'
  await mobile.goto(explorerUrl.href, { waitUntil: 'domcontentloaded' })
  await mobile.getByTestId('entity-development').waitFor({ state: 'attached', timeout: 120000 })
  await mobile.getByRole('heading', { name: 'East Germany', exact: true }).waitFor()
  if (await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile country explorer overflows horizontally')
  await mobile.close()
  if (errors.length) throw new Error(errors.join('; '))
  console.log('Scenario browser smoke: isolated capabilities, URL normalization, worker geometry, actor visibility, theater filtering, sources, unknown years, camera reset shortcut, entity isolation and mobile (incl. country explorer): PASS')
} finally { await browser.close() }
