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
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser console:', message.text()) })
  const smokeUrl = new URL(process.env.SMOKE_URL ?? 'http://localhost:4173/')
  smokeUrl.searchParams.set('debug', '1')
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
  const search = page.locator('input[placeholder]').first()
  await search.fill('East Germany')
  await page.getByRole('button', { name: /East Germany/ }).click()
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
  await search.fill('East Germany')
  if (await page.getByText('East Germany', { exact: true }).count()) throw new Error('East Germany still exists in 1991')
  await page.getByRole('button', { name: /German reunification|Deutsche Wiedervereinigung/ }).click()
  await page.getByLabel(/Guided history lesson|Geführte Zeitreise/).waitFor()
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
  await page.getByRole('button', { name: /Today|Heute/i }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('section strong')].some((node) => /Today|Heute/.test(node.textContent ?? '')))
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
  if (process.env.SMOKE_URL?.includes('/World-Atlas/')) {
    await page.getByRole('button', { name: /Reset demo|Demo zurücksetzen/ }).click()
    await page.getByLabel(/Comparison year 1991|Vergleichsjahr 1991/).waitFor()
  }
  if (pageErrors.length) throw new Error(pageErrors.join('; '))
  console.log('Historical browser smoke: dated borders/flag, event comparison, deep link, Today: PASS')
} finally {
  await browser.close()
}
