// Interaction smoke test against the production build (real browser, real GPU if available).
//
//   npm run build && npm run smoke
//   npm run smoke -- --url http://localhost:5173
//
// Covers: rotate by drag, wheel zoom, touch pinch, hover tooltip, click selection, mode switching,
// leaving to a country page and coming back (camera restored), resize, plus "no page errors".
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)
const url = opt('url', 'http://localhost:4173')

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')

const reachable = async (u) => {
  try {
    return (await fetch(u)).ok
  } catch {
    return false
  }
}
let server
if (!(await reachable(url))) {
  if (opt('url')) throw new Error(`Cannot reach ${url}`)
  if (!existsSync('dist')) throw new Error('dist/ missing. Run `npm run build` first (or pass --url).')
  const win = process.platform === 'win32'
  server = spawn(win ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { shell: win, stdio: 'ignore' })
  for (let i = 0; i < 40 && !(await reachable(url)); i++) await new Promise((r) => setTimeout(r, 250))
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, locale: 'en-US' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text().slice(0, 160)}`))

const results = []
const check = async (name, fn) => {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? '' })
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message ?? e).split('\n')[0] })
  }
}
const wait = (ms) => page.waitForTimeout(ms)
const pose = () => page.evaluate(() => window.__globePose())
const snap = () => page.evaluate(() => window.__perf.snapshot())
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const near = (a, b, eps) => Math.abs(a - b) <= eps
// Hash of a screenshot region without UI overlays (WebGL canvases can't be read back directly
// without preserveDrawingBuffer), so we can tell whether the globe actually repainted.
const regionHash = async () =>
  createHash('md5')
    .update(await page.screenshot({ clip: { x: 260, y: 260, width: 360, height: 280 } }))
    .digest('hex')

await page.goto(`${url}/?debug=1`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__perf?.ready && window.__globePose, null, { timeout: 120000, polling: 200 })
await wait(3500)

await check('globe renders (canvas present, few draw calls)', async () => {
  const s = await snap()
  expect(s.drawCalls > 0 && s.drawCalls <= 12, `draw calls ${s.drawCalls}`)
  return `${s.drawCalls} draw calls`
})

await check('drag rotates the globe', async () => {
  const before = await pose()
  await page.mouse.move(640, 400)
  await page.mouse.down()
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(640 + i * 12, 400 + i * 2)
    await wait(16)
  }
  await page.mouse.up()
  await wait(900)
  const after = await pose()
  const moved = Math.hypot(after.lat - before.lat, after.lng - before.lng)
  expect(moved > 2, `pose moved only ${moved.toFixed(2)}°`)
  return `moved ${moved.toFixed(1)}°`
})

await check('wheel zoom changes altitude', async () => {
  const before = (await pose()).altitude
  await page.mouse.move(640, 400)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -240)
    await wait(40)
  }
  await wait(900)
  const after = (await pose()).altitude
  expect(after < before - 0.05, `altitude ${before.toFixed(2)} -> ${after.toFixed(2)}`)
  return `altitude ${before.toFixed(2)} -> ${after.toFixed(2)}`
})

await check('touch pinch zooms', async () => {
  const cdp = await ctx.newCDPSession(page)
  const before = (await pose()).altitude
  await cdp.send('Input.synthesizePinchGesture', { x: 640, y: 400, scaleFactor: 0.5, relativeSpeed: 400 })
  await wait(900)
  const after = (await pose()).altitude
  expect(after > before + 0.03, `altitude ${before.toFixed(2)} -> ${after.toFixed(2)} (pinch-out expected to zoom out)`)
  return `altitude ${before.toFixed(2)} -> ${after.toFixed(2)}`
})

await check('search selects a country, panel + highlight appear', async () => {
  await page.keyboard.press('/')
  await page.keyboard.type('Germany', { delay: 20 })
  await wait(250)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await wait(2500)
  expect(await page.getByRole('heading', { name: 'Germany' }).first().isVisible(), 'no Germany heading')
  const p = await pose()
  expect(near(p.lat, 51, 6) && near(p.lng, 10, 8), `camera at ${p.lat.toFixed(1)},${p.lng.toFixed(1)}`)
  return `camera ${p.lat.toFixed(1)}, ${p.lng.toFixed(1)}`
})

await check('hover shows tooltip with the country name', async () => {
  await page.keyboard.press('Escape')
  await wait(600)
  // Germany is centred in the (now full-width) view after the panel closes
  await page.mouse.move(600, 380)
  await wait(500)
  await page.mouse.move(640, 400)
  await wait(500)
  const text = await page.locator('.globe-tip').first().innerText()
  expect(/Germany/i.test(text), `tooltip text: ${JSON.stringify(text)}`)
  return text.replace(/\s+/g, ' ')
})

await check('click selects the hovered country', async () => {
  await page.mouse.click(640, 400)
  await wait(1800)
  expect(await page.getByRole('heading', { name: 'Germany' }).first().isVisible(), 'no Germany heading after click')
})

await check('mode switch repaints the globe (political, data, satellite)', async () => {
  const hashes = []
  for (const mode of ['Political', 'Data', 'Satellite']) {
    await page.getByText(mode, { exact: true }).first().click()
    await wait(mode === 'Data' ? 6000 : 2500)
    hashes.push(await regionHash())
  }
  expect(new Set(hashes).size === 3, `canvas unchanged between modes: ${hashes.join(',')}`)
  const s = await snap()
  expect(s.drawCalls <= 12, `draw calls ${s.drawCalls}`)
})

let poseBefore
await check('leave to country page', async () => {
  poseBefore = await pose()
  await page.getByRole('link', { name: /Explore Germany/ }).click()
  await page.waitForURL(/\/countries\/DEU/, { timeout: 15000 })
  await wait(1500)
  expect(await page.getByRole('heading', { name: 'Germany' }).first().isVisible(), 'no country page heading')
})

await check('return restores the camera', async () => {
  await page.goBack()
  await page.waitForFunction(() => window.__globePose, null, { timeout: 60000, polling: 200 })
  await wait(2500)
  const p = await pose()
  const d = Math.hypot(p.lat - poseBefore.lat, p.lng - poseBefore.lng)
  expect(d < 6 && near(p.altitude, poseBefore.altitude, 0.4), `pose ${JSON.stringify(poseBefore)} -> ${JSON.stringify(p)}`)
  return `Δ ${d.toFixed(1)}°`
})

await check('resize keeps the canvas in sync and repaints', async () => {
  await page.setViewportSize({ width: 800, height: 600 })
  await wait(1200)
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return { w: c.clientWidth, h: c.clientHeight }
  })
  expect(near(size.w, 800, 2) && near(size.h, 600, 2), `canvas ${size.w}x${size.h}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await wait(1200)
  const small = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return { w: c.clientWidth, h: c.clientHeight }
  })
  expect(near(small.w, 390, 2) && near(small.h, 844, 2), `canvas ${small.w}x${small.h}`)
  return `800x600, 390x844 ok`
})

await check('no page errors', async () => {
  expect(errors.length === 0, errors.slice(0, 3).join(' | '))
})

await browser.close()
server?.kill()

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exitCode = failed ? 1 : 0
