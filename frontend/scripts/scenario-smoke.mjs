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
  await open('today', { year: '1942', compare: '1914', ww2: '1' })
  if (new URL(page.url()).searchParams.has('year')) throw new Error('Today retained a historical year')
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
  await open('ww2', { year: '1942', compare: '1914' })
  if (new URL(page.url()).searchParams.has('compare')) throw new Error('WWII retained comparison')
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
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const mobileUrl = new URL(base); mobileUrl.search = 'scenario=ww1&year=1916'
  await mobile.goto(mobileUrl.href, { waitUntil: 'domcontentloaded' })
  await mobile.getByTestId('territory-date').waitFor({ timeout: 120000 })
  if (await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile scenario overflows horizontally')
  await mobile.close()
  if (errors.length) throw new Error(errors.join('; '))
  console.log('Scenario browser smoke: isolated capabilities, URL normalization, worker geometry, actor visibility, theater filtering, sources, unknown years and mobile: PASS')
} finally { await browser.close() }
