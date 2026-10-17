/**
 * Types and calls for the backend API, grouped by module.
 * They mirror the Java DTO records (see backend/src/main/java/dev/worldexplorer/**\/*Dtos.java).
 */
import { api } from '@/lib/api'
import type { GlobeMode } from '@/types'

// ---- data platform -------------------------------------------------------------------------
export interface Point {
  year: number
  value: number
}
export interface Coverage {
  countries: number
  observations: number
  fromYear: number | null
  toYear: number | null
  lastUpdated: string | null
}
export interface IndicatorInfo {
  key: string
  worldBankId: string
  label: string
  unit: string
  coverage: Coverage
}
export interface RankingEntry {
  rank: number
  code: string
  name: string
  region: string
  year: number
  value: number
}
export interface IndicatorStats {
  indicatorKey: string
  countries: number
  latestYear: number | null
  min: number | null
  p25: number | null
  median: number | null
  p75: number | null
  max: number | null
  mean: number | null
}
export interface TrendPoint {
  year: number
  countries: number
  median: number
  mean: number
  min: number
  max: number
}
export interface ScatterPoint {
  code: string
  name: string
  region: string
  x: number
  y: number
}
export interface Correlation {
  x: string
  y: string
  pearsonR: number | null
  n: number
  points: ScatterPoint[]
}
export interface CountrySeries {
  code: string
  name: string
  points: Point[]
}
export interface ProfileValue {
  key: string
  label: string
  unit: string
  year: number
  value: number
  rank: number | null
  of: number
}
export interface IngestionRun {
  id: string
  indicatorKey: string
  trigger: string
  status: 'FETCHING' | 'PUBLISHED' | 'COMPLETED' | 'FAILED'
  fetched: number
  stored: number
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export const dataApi = {
  catalog: () => api<IndicatorInfo[]>('/indicators', { auth: false }),
  latest: (key: string) => api<{ indicatorKey: string; values: Record<string, Point> }>(`/indicators/${key}/latest`, { auth: false }),
  series: (key: string, codes: string[]) =>
    api<{ indicatorKey: string; series: CountrySeries[] }>(`/indicators/${key}/series?countries=${codes.join(',')}`, { auth: false }),
  ranking: (key: string, order: 'asc' | 'desc', limit = 15) =>
    api<RankingEntry[]>(`/indicators/${key}/ranking?order=${order}&limit=${limit}`, { auth: false }),
  stats: (key: string) => api<IndicatorStats>(`/indicators/${key}/stats`, { auth: false }),
  trend: (key: string) => api<TrendPoint[]>(`/indicators/${key}/trend`, { auth: false }),
  correlation: (x: string, y: string) => api<Correlation>(`/indicators/correlation?x=${x}&y=${y}`, { auth: false }),
  atYear: (key: string, year: number) =>
    api<{ indicatorKey: string; values: Record<string, Point> }>(`/indicators/${key}/at/${year}`, { auth: false }),
  profile: (code: string) => api<ProfileValue[]>(`/indicators/countries/${code}`, { auth: false }),
  runs: () => api<IngestionRun[]>('/admin/ingestion/runs?limit=40'),
  ingest: (key?: string) => api<unknown>(key ? `/admin/ingestion/${key}` : '/admin/ingestion', { method: 'POST' }),
}

// ---- search --------------------------------------------------------------------------------
export interface SearchHit {
  code: string
  name: string
  capital: string | null
  region: string
  flagEmoji: string
  score: number
  highlights: Record<string, string[]>
}
export interface SearchResult {
  query: string
  total: number
  hits: SearchHit[]
  regions: Record<string, number>
}
export const searchApi = {
  countries: (q: string, signal?: AbortSignal) =>
    api<SearchResult>(`/search?q=${encodeURIComponent(q)}&limit=8`, { auth: false, signal }),
}

// ---- personal atlas ------------------------------------------------------------------------
export type TravelStatus = 'VISITED' | 'LIVED' | 'WISHLIST'
export interface Favorite {
  code: string
  name: string
  region: string
  flagEmoji: string
  createdAt: string
}
export interface TravelEntry {
  code: string
  name: string
  region: string
  flagEmoji: string
  status: TravelStatus
  visitedOn: string | null
  rating: number | null
  updatedAt: string
}
export interface Note {
  id: string
  countryCode: string
  countryName: string
  title: string
  body: string
  version: number
  createdAt: string
  updatedAt: string
}
export interface NoteHit {
  id: string
  countryCode: string
  countryName: string
  title: string
  snippet: string
  updatedAt: string
  score: number
}
export interface SavedView {
  id: string
  slug: string
  name: string
  mode: GlobeMode
  metric: string | null
  lat: number
  lng: number
  altitude: number
  selectedCountry: string | null
  isPublic: boolean
  createdAt: string
  owner: string | null
}
export interface AtlasStats {
  visited: number
  lived: number
  wishlist: number
  favorites: number
  notes: number
  totalCountries: number
  percentOfWorld: number
  byRegion: Record<string, { visited: number; total: number }>
  visitedCodes: string[]
}
export interface CountryState {
  code: string
  favorite: boolean
  travel: TravelStatus | null
  notes: number
}

export const atlasApi = {
  stats: () => api<AtlasStats>('/atlas/stats'),
  country: (code: string) => api<CountryState>(`/atlas/countries/${code}`),
  favorites: () => api<Favorite[]>('/atlas/favorites'),
  addFavorite: (code: string) => api<void>(`/atlas/favorites/${code}`, { method: 'PUT' }),
  removeFavorite: (code: string) => api<void>(`/atlas/favorites/${code}`, { method: 'DELETE' }),
  travel: () => api<TravelEntry[]>('/atlas/travel'),
  setTravel: (code: string, body: { status: TravelStatus; visitedOn?: string | null; rating?: number | null }) =>
    api<TravelEntry>(`/atlas/travel/${code}`, { method: 'PUT', body }),
  removeTravel: (code: string) => api<void>(`/atlas/travel/${code}`, { method: 'DELETE' }),
  notes: (country?: string) => api<Note[]>(`/atlas/notes${country ? `?country=${country}` : ''}`),
  searchNotes: (q: string) => api<NoteHit[]>(`/atlas/notes/search?q=${encodeURIComponent(q)}`),
  createNote: (body: { countryCode: string; title: string; body: string }) => api<Note>('/atlas/notes', { body }),
  updateNote: (id: string, body: { title: string; body: string; version: number }) =>
    api<Note>(`/atlas/notes/${id}`, { method: 'PUT', body }),
  deleteNote: (id: string) => api<void>(`/atlas/notes/${id}`, { method: 'DELETE' }),
  views: () => api<SavedView[]>('/atlas/views'),
  createView: (body: Omit<SavedView, 'id' | 'slug' | 'createdAt' | 'owner'>) => api<SavedView>('/atlas/views', { body }),
  deleteView: (id: string) => api<void>(`/atlas/views/${id}`, { method: 'DELETE' }),
  view: (slug: string) => api<SavedView>(`/views/${slug}`),
}

// ---- quiz ----------------------------------------------------------------------------------
export type QuestionType = 'LOCATE' | 'CAPITAL' | 'FLAG' | 'POPULATION'
export type QuizMode = 'CLASSIC' | 'DAILY' | 'CHALLENGE'
export interface Option {
  /** neutral id ("A"–"D") – never a country code, so it does not give the answer away */
  id: string
  label: string
  /** country code where it reveals nothing beyond the label (country-name options), for translation */
  code: string | null
}
export interface PublicQuestion {
  index: number
  total: number
  type: QuestionType
  prompt: string
  /** the country named in the prompt (LOCATE, CAPITAL) so the prompt can be translated */
  subject: string | null
  options: Option[]
  hasFlag: boolean
  timeLimitSeconds: number
}
export interface QuestionView {
  question: PublicQuestion
  servedAt: string
  deadline: string
  score: number
}
export interface AnswerResult {
  correct: boolean
  late: boolean
  points: number
  score: number
  correctAnswer: string
  correctLabel: string
  correctCountry: string
  distanceKm: number | null
  finished: boolean
  nextIndex: number | null
}
export interface ReviewItem {
  index: number
  type: QuestionType
  prompt: string
  target: string
  answer: string | null
  correctAnswer: string
  correctLabel: string
  correctCountry: string
  correct: boolean
  points: number
  distanceKm: number | null
  elapsedMs: number
}
export interface QuizSummary {
  id: string
  mode: QuizMode
  region: string | null
  ranked: boolean
  score: number
  correct: number
  total: number
  durationMs: number
  weeklyRank: number | null
  allTimeRank: number | null
  dailyRank: number | null
  challenge: string | null
  review: ReviewItem[]
}
export interface PlayerStats {
  games: number
  totalScore: number
  bestScore: number
  answered: number
  correct: number
  accuracy: number
  multiplayerGames: number
  multiplayerWins: number
  recent: { id: string; mode: QuizMode; region: string | null; score: number; correct: number; total: number; durationMs: number; finishedAt: string }[]
}
export type Period = 'weekly' | 'alltime' | 'daily' | 'multiplayer'
export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  score: number
}
export interface Leaderboard {
  period: string
  key: string
  top: LeaderboardEntry[]
  me: LeaderboardEntry | null
}

export const quizApi = {
  start: (body: { mode: QuizMode; region?: string | null; rounds?: number; types?: QuestionType[]; challenge?: string }) =>
    api<{ id: string; mode: QuizMode; total: number; ranked: boolean; region: string | null }>('/quiz', { body }),
  question: (id: string) => api<QuestionView>(`/quiz/${id}/question`),
  answer: (id: string, index: number, answer: string) => api<AnswerResult>(`/quiz/${id}/answer`, { body: { index, answer } }),
  summary: (id: string) => api<QuizSummary>(`/quiz/${id}`),
  stats: () => api<PlayerStats>('/quiz/me/stats'),
  leaderboard: (period: Period, limit = 20) => api<Leaderboard>(`/leaderboard?period=${period}&limit=${limit}`),
}

// ---- duels ---------------------------------------------------------------------------------
export interface ChallengeResult {
  rank: number
  userId: string
  name: string
  score: number
  correct: number
  total: number
  durationMs: number
  finishedAt: string
}
export interface Challenge {
  slug: string
  creatorName: string
  region: string | null
  rounds: number
  createdAt: string
  results: ChallengeResult[]
  played: boolean
}
export const challengeApi = {
  create: (body: { region?: string | null; rounds?: number }) => api<Challenge>('/challenges', { body }),
  get: (slug: string) => api<Challenge>(`/challenges/${slug}`),
}

// ---- achievements --------------------------------------------------------------------------
export interface AchievementDto {
  code: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt: string | null
}
export interface AchievementOverview {
  achievements: AchievementDto[]
  unlocked: number
  currentStreak: number
  bestStreak: number
  lastDaily: string | null
  knowledge: { region: string; countries: number; total: number }[]
}
export const achievementApi = {
  mine: () => api<AchievementOverview>('/achievements'),
}

// ---- admin ---------------------------------------------------------------------------------
export interface AdminUser {
  id: string
  displayName: string
  email: string | null
  roles: string[]
  guest: boolean
  emailVerified: boolean
  createdAt: string
  lastLoginAt: string | null
}
export interface OutboxStatus {
  pending: number
  failed: number
  oldestPending: string | null
  failures: { id: string; topic: string; key: string; attempts: number; lastError: string | null; createdAt: string }[]
}
export const adminApi = {
  users: () => api<AdminUser[]>('/admin/users?size=100'),
  setRoles: (id: string, roles: string[]) => api<AdminUser>(`/admin/users/${id}/roles`, { method: 'PUT', body: { roles } }),
  outbox: () => api<OutboxStatus>('/admin/events/outbox'),
  retryOutbox: (id: string) => api<void>(`/admin/events/outbox/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
}

// ---- multiplayer ---------------------------------------------------------------------------
export interface RoomSettings {
  rounds: number
  types: QuestionType[]
  region: string | null
  roundSeconds: number
}
export interface PlayerView {
  id: string
  name: string
  score: number
  correct: number
  connected: boolean
  host: boolean
}
export interface RoomView {
  code: string
  status: 'LOBBY' | 'RUNNING' | 'FINISHED'
  hostId: string
  settings: RoomSettings
  isPublic: boolean
  players: PlayerView[]
  round: number
  totalRounds: number
  question: PublicQuestion | null
  roundEndsAt: string | null
  answeredThisRound: number
}
export interface OpenRoom {
  code: string
  hostName: string
  players: number
  maxPlayers: number
  settings: RoomSettings
}
export const roomApi = {
  open: () => api<OpenRoom[]>('/rooms', { auth: false }),
  create: (body: { rounds?: number; types?: QuestionType[]; region?: string | null; roundSeconds?: number; isPublic: boolean }) =>
    api<RoomView>('/rooms', { body }),
  get: (code: string) => api<RoomView>(`/rooms/${code}`),
  join: (code: string) => api<RoomView>(`/rooms/${code}/join`, { method: 'POST' }),
  leave: (code: string) => api<void>(`/rooms/${code}/leave`, { method: 'POST' }),
  start: (code: string) => api<RoomView>(`/rooms/${code}/start`, { method: 'POST' }),
  rematch: (code: string) => api<RoomView>(`/rooms/${code}/rematch`, { method: 'POST' }),
  matchmaking: () => api<{ waiting: number }>('/rooms/matchmaking', { method: 'POST' }),
  leaveMatchmaking: () => api<void>('/rooms/matchmaking/leave', { method: 'POST' }),
}

// ---- activity / admin ----------------------------------------------------------------------
export interface FeedItem {
  id: string
  type: string
  userName: string | null
  countryCode: string | null
  score: number | null
  summary: string
  at: string
}
export interface DayBucket {
  day: string
  total: number
  byType: Record<string, number>
  avgQuizScore: number | null
}
export interface Overview {
  postgres: Record<string, number>
  elasticsearch: Record<string, number>
  redis: Record<string, number>
  kafkaLag: { group: string; topic: string; lag: number }[]
  kafkaError: string | null
}
export const activityApi = {
  recent: (limit = 15) => api<FeedItem[]>(`/activity/recent?limit=${limit}`, { auth: false }),
  popular: () =>
    api<{ mostFavorited: { code: string; name: string; count: number }[]; mostActive: { code: string; name: string; count: number }[] }>(
      '/activity/popular',
      { auth: false },
    ),
  perDay: (days = 14) => api<DayBucket[]>(`/analytics/activity?days=${days}`),
  overview: () => api<Overview>('/admin/overview'),
}
