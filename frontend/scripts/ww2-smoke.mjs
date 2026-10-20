import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
if (!chrome) throw new Error('Chrome is required for the World War II smoke test')
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 850 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = new URL(process.env.SMOKE_URL ?? 'http://localhost:4173/')
  url.searchParams.set('year', '1939')
  url.searchParams.set('ww2', '1')
  url.searchParams.set('debug', '1')
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  const panel = page.getByRole('complementary', { name: /Zweiter Weltkrieg|World War II/ })
  await panel.waitFor({ timeout: 60000 })
  for (const year of [1939, 1940, 1941, 1942, 1943, 1944, 1945]) {
    await panel.getByRole('group', { name: /Kriegsjahr|War year/ }).getByRole('button', { name: String(year) }).click()
    await page.waitForURL(new RegExp(`year=${year}`))
    await page.waitForFunction(() => window.__globeDetail?.().ww2FrontSegments > 0, null, { timeout: 20000 })
    if (await panel.getByRole('link').count() === 0) {
      await panel.getByRole('button', { name: /Front|Raum Warschau|Somme|Ostfront|Westfront/i }).first().click()
    }
  }
  await panel.getByRole('group', { name: /Kriegsschauplatz|Theater/ }).getByRole('button', { name: /Asien\/Pazifik|Asia\/Pacific/ }).click()
  await page.waitForFunction(() => window.__globeDetail?.().ww2FrontSegments === 0)
  await panel.getByText(/kein geprüfter Frontabschnitt|No validated front section/).waitFor()
  await panel.getByRole('button', { name: /Antwort zeigen|Show answer/ }).click()
  await panel.getByText(/September 1945/).waitFor()
  await panel.getByRole('group', { name: /Kriegsschauplatz|Theater/ }).getByRole('button', { name: /Alle|All/ }).click()
  if (process.env.WW2_SCREENSHOT_PATH) {
    await panel.getByRole('button', { name: /Ostfront/ }).first().click()
    await page.waitForTimeout(1600)
    await page.screenshot({ path: process.env.WW2_SCREENSHOT_PATH })
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await mobile.goto(url.href, { waitUntil: 'domcontentloaded' })
  const sheet = mobile.getByRole('dialog', { name: /Zweiter Weltkrieg|World War II/ })
  await sheet.waitFor({ timeout: 60000 })
  await sheet.getByRole('button', { name: /Expand panel/ }).click()
  await sheet.getByRole('group', { name: /Kriegsjahr|War year/ }).getByRole('button', { name: '1944' }).click()
  await sheet.getByText(/1944-12-15/).first().waitFor()
  await mobile.close()
  await panel.getByRole('button', { name: /Weltkriegsansicht schließen|Close World War II view/ }).click()
  await page.waitForURL((next) => !next.searchParams.has('ww2'))
  await page.waitForFunction(() => window.__globeDetail?.().ww2FrontSegments === 0)
  await page.getByRole('button', { name: /Zweiter Weltkrieg · 1939–1945 erkunden|Explore World War II/ }).click()
  await page.waitForURL(/year=1939.*ww2=1|ww2=1.*year=1939/)
  await page.waitForFunction(() => window.__globeDetail?.().ww2FrontSegments > 0)
  if (errors.length) throw new Error(errors.join('; '))
  console.log('World War II browser smoke: seven dated snapshots, frontlines, theaters, learning card, mobile, return path: PASS')
} finally {
  await browser.close()
}
