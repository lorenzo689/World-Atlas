// End-to-end test of the full stack in a real browser: UI -> Vite/Caddy proxy -> Spring Boot -> PostgreSQL/Redis/Kafka.
//
//   docker compose up -d          # infrastructure
//   cd backend && ./mvnw spring-boot:run   # API on :8080
//   npm run build && npm run e2e  # starts `vite preview` (proxying /api and /ws) unless --url is given
//
// Flows: register (+ e-mail verification via the dev mailbox), quiz played with the keyboard, result page,
// duel link, language switch, travel map entry, achievements page, mobile layout (no horizontal scroll),
// plus "no page errors".
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)
const url = opt('url', 'http://localhost:4173')
const shots = opt('screenshots', '')
if (shots) mkdirSync(shots, { recursive: true })

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
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
const health = await fetch(`${url}/api/health`).then((r) => r.headers.get('content-type') ?? '', () => '')
if (!health.includes('json')) throw new Error(`The backend is not reachable through ${url}/api/health`)

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
await ctx.addInitScript(() => localStorage.setItem('world-explorer-lang', JSON.stringify({ state: { lang: 'en' }, version: 0 })))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  const text = m.text()
  // WebGL on a software renderer and 4xx answers that tests provoke on purpose are not bugs
  if (m.type() === 'error' && !/WebGL|GPU stall|Failed to load resource/i.test(text)) errors.push(`console.error: ${text.slice(0, 160)}`)
})

const results = []
const check = async (name, fn) => {
  const t0 = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? '', ms: Date.now() - t0 })
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message ?? e).split('\n')[0], ms: Date.now() - t0 })
    if (shots) await page.screenshot({ path: `${shots}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {})
  }
}
const shot = (name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : undefined)

const stamp = Date.now()
const email = `e2e-${stamp}@example.com`
const password = 'correct-horse-battery'

await check('home page shows the globe', async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 60_000 })
})

await check('register an account', async () => {
  await page.goto(`${url}/login?next=/quiz`)
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByLabel('Display name').fill('E2E Tester')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL((u) => u.pathname === '/quiz', { timeout: 15_000 })
})

await check('verify the e-mail through the dev mailbox link', async () => {
  let mail
  for (let i = 0; i < 20 && !mail; i++) {
    mail = (await (await fetch(`${url}/api/dev/mails`)).json()).find((m) => m.to === email)
    if (!mail) await new Promise((r) => setTimeout(r, 500))
  }
  if (!mail) throw new Error('no verification mail captured (is app.auth.dev-mailbox on?)')
  const link = /(https?:\/\/\S+\/verify\?token=\S+)/.exec(mail.body)?.[1]
  if (!link) throw new Error('no link in the mail')
  const target = new URL(link)
  await page.goto(`${url}${target.pathname}${target.search}`, { waitUntil: 'domcontentloaded' })
  await page.getByText('verified', { exact: false }).first().waitFor({ timeout: 10_000 })
})

let quizUrl
await check('play a quiz with the keyboard', async () => {
  await page.goto(`${url}/quiz`)
  // capital + population questions only: answered with the keys 1-4, no globe clicks needed
  await page.getByRole('button', { name: 'Locate', exact: true }).click()
  await page.getByRole('button', { name: 'Flags', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  for (let i = 0; i < 10; i++) {
    // wait until the options are clickable (the previous answer's feedback locks them for a moment)
    await page.getByRole('group', { name: 'Answer options' }).locator('button:not([disabled])').first().waitFor({ timeout: 20_000 })
    // the keys 1/2 pick an option (population questions have two); retry once if the first press raced the render
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.keyboard.press(String((i % 2) + 1))
      const answered = await page.getByText(/Correct!|Not quite|Too late/).first().waitFor({ timeout: 6_000 }).then(() => true, () => false)
      if (answered) break
    }
    // the page continues by itself after the feedback; Enter just speeds it up
    await page.keyboard.press('Enter')
    if (i < 9) await page.getByText(`Question ${i + 2} of 10`).waitFor({ timeout: 15_000 })
  }
  await page.getByText(/of 10 correct/).waitFor({ timeout: 15_000 })
  quizUrl = page.url()
  await shot('quiz-result')
})

await check('badge toast arrives over the WebSocket', async () => {
  await page.getByRole('link', { name: /First steps/ }).waitFor({ timeout: 20_000 })
})

await check('create a duel link', async () => {
  await page.goto(`${url}/quiz`)
  await page.getByRole('button', { name: 'Challenge a friend' }).click()
  await page.waitForURL('**/challenge/*', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Accept the challenge' }).waitFor()
  await shot('duel')
})

await check('switch to German', async () => {
  await page.goto(`${url}/leaderboard`)
  await page.getByRole('button', { name: /Menu|E2E Tester/ }).click()
  await page.getByRole('button', { name: 'Deutsch' }).click()
  await page.getByRole('heading', { name: 'Bestenliste' }).waitFor()
  if ((await page.locator('html').getAttribute('lang')) !== 'de') throw new Error('<html lang> not updated')
  await shot('leaderboard-de')
  await page.getByRole('button', { name: 'English' }).click() // the menu stays open after choosing a language
  await page.getByRole('heading', { name: 'Leaderboard' }).waitFor()
})

await check('travel map: add a country', async () => {
  await page.goto(`${url}/atlas`)
  const select = page.getByRole('combobox', { name: 'Country' }).first()
  await select.waitFor({ timeout: 20_000 })
  const option = await select.locator('option', { hasText: 'Italy' }).first().getAttribute('value')
  await select.selectOption(option)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Italy').first().waitFor({ timeout: 10_000 })
  await shot('atlas')
})

await check('achievements page lists badges and the streak', async () => {
  await page.goto(`${url}/achievements`)
  await page.getByText('Daily streak').waitFor({ timeout: 15_000 })
})

await check('time slider changes the data layer', async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.getByRole('radio', { name: 'Data' }).click()
  const slider = page.locator('#year-slider')
  await slider.waitFor({ timeout: 20_000 })
  await slider.fill('2005')
  await page.getByText(/^2005$/).first().waitFor({ timeout: 30_000 })
})

await check('mobile layout has no horizontal scroll', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const p = await phone.newPage()
  for (const path of ['/', '/quiz', '/leaderboard', '/data', '/login', '/compare']) {
    await p.goto(`${url}${path}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1200)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) throw new Error(`${path}: page is ${overflow}px wider than the screen`)
    if (shots) await p.screenshot({ path: `${shots}/mobile${path.replace(/\//g, '_') || '_home'}.png` })
  }
  await phone.close()
})

await check('service worker and manifest are served', async () => {
  const sw = await fetch(`${url}/sw.js`)
  const manifest = await fetch(`${url}/manifest.webmanifest`)
  if (!sw.ok || !manifest.ok) throw new Error('sw.js or manifest missing')
})

await check('no page errors', async () => {
  if (errors.length) throw new Error(errors.slice(0, 3).join(' | '))
})

await browser.close()
if (server) {
  // `shell: true` on Windows: kill the whole process tree, not just the shell
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
console.log('\nE2E results')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(48)} ${String(r.ms).padStart(6)} ms  ${r.detail}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
