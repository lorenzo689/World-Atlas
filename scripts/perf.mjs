// Reproducible performance run against the production build.
//
//   npm run build && npm run perf                 # software GL (CI-safe): draw calls, size, long tasks
//   npm run perf -- --gpu                         # real GPU: also enforces frame-time budgets
//   npm run perf -- --label before-textures       # tag the result file
//   npm run perf -- --url http://localhost:5173   # use an already running server
//   npm run perf -- --shots perf-results/shots    # also save screenshots (satellite/hover/selected/political/data)
//   npm run perf -- --width 390 --height 844 --dpr 3 --cpu 4   # phone-ish: 4x CPU throttle
//
// Results go to perf-results/<label>.json; budgets live in perf-budget.json.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)

const gpu = flag('gpu')
const width = +opt('width', 1280)
const height = +opt('height', 800)
const dpr = +opt('dpr', 1)
const cpu = +opt('cpu', 1)
const label = opt('label', 'latest')
const url = opt('url', 'http://localhost:4173')
const shotsDir = opt('shots', '')
const budget = JSON.parse(readFileSync(new URL('../perf-budget.json', import.meta.url), 'utf8'))

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p))
if (!CHROME) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')

async function reachable(u) {
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
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { shell: process.platform === 'win32', stdio: 'ignore' })
  for (let i = 0; i < 40 && !(await reachable(url)); i++) await new Promise((r) => setTimeout(r, 250))
  if (!(await reachable(url))) throw new Error('vite preview did not start')
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: !flag('headed'),
  args: gpu
    ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
if (cpu > 1) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
}

const wait = (ms) => page.waitForTimeout(ms)
const snap = () => page.evaluate(() => window.__perf.snapshot())
const reset = () => page.evaluate(() => window.__perf.reset())

const t0 = Date.now()
await page.goto(`${url}/?debug=1`, { waitUntil: 'commit' })
await page.waitForFunction(() => window.__perf?.ready, null, { timeout: 180000, polling: 250 })
const wallReady = Date.now() - t0
const load = await page.evaluate(() => {
  const res = performance.getEntriesByType('resource')
  const nav = performance.getEntriesByType('navigation')[0]
  const size = (r) => r.transferSize || r.encodedBodySize || 0
  const bytes = res.reduce((a, r) => a + size(r), 0) + (nav ? size(nav) : 0)
  const biggest = res
    .map((r) => ({ url: r.name.replace(location.origin, ''), kb: Math.round(size(r) / 1024) }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 8)
  return { readyMs: window.__perf.readyAt, transferKB: Math.round(bytes / 1024), requests: res.length, biggest }
})
// let the intro fly-in and texture uploads settle
await wait(4000)

const cx = width / 2
const cy = height / 2
const phases = {}
const shot = async (name) => shotsDir && (await page.screenshot({ path: `${shotsDir}/${name}.png` }))
if (shotsDir) mkdirSync(shotsDir, { recursive: true })
await shot('1-satellite')

await reset()
await wait(3000)
phases.idle = await snap()

await reset()
await page.mouse.move(cx, cy)
await page.mouse.down()
for (let i = 0; i < 90; i++) {
  const a = (i / 90) * Math.PI * 2
  await page.mouse.move(cx + Math.cos(a) * width * 0.18, cy + Math.sin(a) * height * 0.18)
  await wait(16)
}
await page.mouse.up()
phases.drag = await snap()

await reset()
for (let i = 0; i < 120; i++) {
  await page.mouse.move(width * 0.2 + ((i * 17) % (width * 0.6)), height * 0.3 + ((i * 11) % (height * 0.4)))
  await wait(16)
}
phases.hover = await snap()
await page.mouse.move(cx, cy)
await wait(1500)
await shot('2-hover')

await reset()
// select via the search box so a country is always chosen (the centre of the globe may be ocean)
await page.keyboard.press('/')
await page.keyboard.type('Germany', { delay: 30 })
await wait(300)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await wait(3500)
phases.select = await snap()
await shot('3-selected')
if (shotsDir) {
  await page.keyboard.press('Escape')
  for (const [mode, file] of [['Political', '4-political'], ['Data', '5-data']]) {
    await page.getByText(mode, { exact: true }).first().click()
    await wait(mode === 'Data' ? 8000 : 4000)
    await shot(file)
  }
}

await browser.close()
server?.kill()

// ---- report ------------------------------------------------------------------------------
const f = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : '-')
console.log(`\nPerf run "${label}"  ${gpu ? 'GPU' : 'software GL'}  ${width}x${height} @${dpr}x  cpu x${cpu}`)
console.log(`load: ready ${f(load.readyMs, 0)} ms (wall ${wallReady}), ${load.transferKB} KB in ${load.requests} requests`)
for (const b of load.biggest) console.log(`      ${String(b.kb).padStart(6)} KB  ${b.url}`)
console.log('\nphase    fps  p50ms  p95ms  maxms  longtasks(ms)  calls   tris  geoms  tex  heapMB')
for (const [name, s] of Object.entries(phases)) {
  console.log(
    `${name.padEnd(8)} ${f(s.fps, 0).padStart(4)} ${f(s.frameP50).padStart(6)} ${f(s.frameP95).padStart(6)} ${f(s.frameMax, 0).padStart(6)}` +
      `  ${String(s.longTasks).padStart(4)} (${f(s.longTaskMs, 0).padStart(5)})  ${String(s.drawCalls).padStart(5)} ${String(Math.round(s.triangles / 1000) + 'k').padStart(6)} ${String(s.geometries).padStart(5)} ${String(s.textures).padStart(4)} ${f(s.heapMB, 0).padStart(6)}`,
  )
}

mkdirSync('perf-results', { recursive: true })
const result = { label, when: new Date().toISOString(), gpu, width, height, dpr, cpu, load, phases, errors }
writeFileSync(`perf-results/${label}.json`, JSON.stringify(result, null, 2))

// ---- budgets -----------------------------------------------------------------------------
const fails = []
const check = (name, value, limit) => value > limit && fails.push(`${name}: ${f(value)} > ${limit}`)
const worst = (k) => Math.max(...Object.values(phases).map((s) => s[k] ?? 0))
check('transferKB', load.transferKB, budget.always.transferKB)
check('drawCalls (worst phase)', worst('drawCalls'), budget.always.drawCalls)
if (gpu) {
  check('readyMs', load.readyMs, budget.gpu.readyMs)
  check('longTaskMs (worst phase)', worst('longTaskMs'), budget.gpu.longTaskMsPerPhase)
  check('frameP95Ms (worst phase)', worst('frameP95'), budget.gpu.frameP95Ms)
  check('frameMaxMs (worst phase)', worst('frameMax'), budget.gpu.frameMaxMs)
  check('heapMB', worst('heapMB'), budget.gpu.heapMB)
}
for (const e of errors) fails.push(`page error: ${e}`)
if (fails.length) {
  console.log('\nBUDGET FAILURES\n  - ' + fails.join('\n  - '))
  process.exitCode = 1
} else console.log('\nAll budgets met.')
