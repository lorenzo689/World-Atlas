// Load test with k6 (https://k6.io). No local install needed:
//
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:8080 grafana/k6:1.3.0 run - < loadtest/quiz.js
//
// Start the backend with the rate limits raised, otherwise the test measures the limiter, not the app:
//   APP_RATELIMIT_AUTHPERMINUTE=100000 APP_RATELIMIT_APIPERMINUTE=10000000 ./mvnw spring-boot:run
//
// Two scenarios run side by side:
//   players – guest sign-up, then a complete 10-question quiz (Redis session, Postgres result,
//             outbox → Kafka → leaderboards/achievements) and a leaderboard read
//   readers – the cached read endpoints of the data platform (Redis cache-aside)
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend } from 'k6/metrics'

const BASE = __ENV.BASE_URL || 'http://localhost:8080'
const quizDuration = new Trend('quiz_full_game_ms', true)

export const options = {
  scenarios: {
    players: { executor: 'ramping-vus', exec: 'player', startVUs: 1, stages: [
      { duration: '20s', target: __ENV.PLAYERS ? Number(__ENV.PLAYERS) : 20 },
      { duration: '40s', target: __ENV.PLAYERS ? Number(__ENV.PLAYERS) : 20 },
      { duration: '10s', target: 0 },
    ] },
    readers: { executor: 'constant-arrival-rate', exec: 'reader', rate: 100, timeUnit: '1s', duration: '70s',
      preAllocatedVUs: 20, maxVUs: 100 },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:answer}': ['p(95)<300'],
    'http_req_duration{endpoint:read}': ['p(95)<300'],
    checks: ['rate>0.99'],
  },
}

const json = { headers: { 'Content-Type': 'application/json' } }

export function player() {
  const started = Date.now()
  const auth = http.post(`${BASE}/api/auth/guest`, JSON.stringify({ displayName: `load-${__VU}-${__ITER}` }), json)
  if (!check(auth, { 'guest created': (r) => r.status === 200 || r.status === 201 })) return
  const headers = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.json('accessToken')}` } }

  const quiz = http.post(`${BASE}/api/quiz`, JSON.stringify({ mode: 'CLASSIC', rounds: 10, types: ['CAPITAL', 'FLAG', 'POPULATION'] }), headers)
  if (!check(quiz, { 'quiz started': (r) => r.status === 201 })) return
  const id = quiz.json('id')

  for (let i = 0; i < 10; i++) {
    const q = http.get(`${BASE}/api/quiz/${id}/question`, headers)
    check(q, { 'question served': (r) => r.status === 200 })
    sleep(0.3 + Math.random() * 0.4) // "thinking"
    const a = http.post(`${BASE}/api/quiz/${id}/answer`, JSON.stringify({ index: i, answer: 'ABCD'[i % 4] }), { ...headers, tags: { endpoint: 'answer' } })
    check(a, { 'answer accepted': (r) => r.status === 200 })
  }
  const summary = http.get(`${BASE}/api/quiz/${id}`, headers)
  check(summary, { 'summary available': (r) => r.status === 200 })
  group('leaderboard', () => {
    check(http.get(`${BASE}/api/leaderboard?period=weekly&limit=20`, headers), { 'leaderboard ok': (r) => r.status === 200 })
  })
  quizDuration.add(Date.now() - started)
}

const KEYS = ['population', 'gdpPerCapita', 'lifeExpectancy', 'gdp', 'urbanization']
export function reader() {
  const key = KEYS[Math.floor(Math.random() * KEYS.length)]
  const paths = [`/api/indicators/${key}/latest`, `/api/indicators/${key}/at/${2000 + Math.floor(Math.random() * 20)}`, `/api/indicators/${key}/stats`, `/api/indicators/${key}/trend`]
  const r = http.get(`${BASE}${paths[Math.floor(Math.random() * paths.length)]}`, { tags: { endpoint: 'read' } })
  check(r, { 'read ok': (res) => res.status === 200 })
}
