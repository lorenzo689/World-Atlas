// Browser check for lazy close-zoom imagery, vector detail, labels and render budget.
// npm run smoke:detail -- --url http://localhost:5173
import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:4173'
const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path))
if (!chrome) throw new Error('Chrome/Edge unavailable')

let server
const reachable = async () => fetch(url).then((response) => response.ok, () => false)
if (!(await reachable())) {
  if (args.includes('--url')) throw new Error(`Cannot reach ${url}`)
  const win = process.platform === 'win32'
  server = spawn(win ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { shell: win, stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await reachable()); i++) await new Promise((resolve) => setTimeout(resolve, 250))
  if (!(await reachable())) throw new Error('Vite preview did not start')
}

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const errors = []
  const detailRequests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (/\/(earth-detail|map-detail)\//.test(response.url())) detailRequests.push({ url: response.url(), status: response.status() })
  })
  await page.goto(`${url}/?debug=1`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.__perf?.ready && window.__globePose, null, { timeout: 120000 })
  await page.waitForTimeout(3500)
  if (detailRequests.length) throw new Error(`Detail loaded at world zoom: ${detailRequests.length} requests`)

  await page.keyboard.press('/')
  await page.keyboard.type('Germany')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1800)
  for (let i = 0; i < 15; i++) {
    const altitude = await page.evaluate(() => window.__globePose().altitude)
    if (altitude < 0.28) break
    await page.mouse.move(720, 450)
    await page.mouse.wheel(0, -320)
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(4500)
  const altitude = await page.evaluate(() => window.__globePose().altitude)
  const snapshot = await page.evaluate(() => window.__perf.snapshot())
  const labels = await page.locator('.globe-place-label').count()
  const borders = detailRequests.filter((request) => request.url.includes('/map-detail/borders/') && request.status === 200).length
  const images = detailRequests.filter((request) => request.url.includes('/earth-detail/') && request.status === 200).length
  const failures = detailRequests.filter((request) => request.status !== 200)
  if (altitude >= 0.38) throw new Error(`Zoom did not reach detail level: ${altitude}`)
  if (!borders || !images || !labels) throw new Error(`Missing detail: borders=${borders}, imagery=${images}, labels=${labels}`)
  if (failures.length) throw new Error(`Detail HTTP failures: ${JSON.stringify(failures.slice(0, 3))}`)
  if (snapshot.drawCalls > 65) throw new Error(`Too many draw calls: ${snapshot.drawCalls}`)
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  if (args.includes('--screenshots')) {
    const dir = args[args.indexOf('--screenshots') + 1]
    mkdirSync(dir, { recursive: true })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/detail.png` })
  }
  console.log(`Detail smoke PASS: altitude ${altitude.toFixed(2)}, ${borders} border tiles, ${images} image tiles, ${labels} labels, ${snapshot.drawCalls} draw calls`)
} finally {
  await browser.close()
  if (server) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    else server.kill()
  }
}
