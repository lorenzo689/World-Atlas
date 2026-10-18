import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Crown, Loader2, Play, RotateCcw, Send, Users, Wifi, WifiOff, Zap } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { roomApi, type OpenRoom, type PlayerView, type PublicQuestion, type QuestionType, type RoomView } from '@/lib/backend'
import { createRealtime, type Realtime, type RoomEvent } from '@/lib/realtime'
import { useAuth } from '@/store/auth'
import { useCountries } from '@/hooks/useCountries'
import { useDocumentMeta } from '@/hooks/useMisc'
import { useNumberFormat, useT } from '@/i18n'
import { useQuizText } from '@/lib/quizText'
import { Card, EmptyHint, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { QuestionPanel, type Feedback } from '@/components/game/QuestionPanel'
import { QuizGlobe } from '@/components/game/QuizGlobe'
import type { GlobeMarker } from '@/components/globe/GlobeView'
import { Button } from '@/components/ui/button'
import { Chip, REGIONS, TYPES } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

/** One colour per player (markers on the globe + names in the results). */
export const PLAYER_COLORS = ['#6fa8ff', '#f6c177', '#eb6f92', '#9ccfd8', '#c4a7e7', '#a3be8c', '#ffb86c', '#8be9fd']

export default function MultiplayerPage() {
  const t = useT()
  useDocumentMeta({ title: `${t('mp.title')} · World Explorer`, description: t('mp.metaDescription') })
  const { code } = useParams()
  return <RequireUser>{code ? <RoomScreen code={code.toUpperCase()} /> : <Lobby />}</RequireUser>
}

// ============================================================================== lobby ==========

function Lobby() {
  const t = useT()
  const text = useQuizText()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<OpenRoom[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [rounds, setRounds] = useState(8)
  const [region, setRegion] = useState<string | null>(null)
  const [types, setTypes] = useState<QuestionType[]>(['LOCATE', 'CAPITAL', 'FLAG'])
  const [isPublic, setIsPublic] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    const load = () => roomApi.open().then(setRooms).catch(() => {})
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [])

  // quick match: the room code arrives privately on /user/queue/match
  useEffect(() => {
    if (!searching) return
    const realtime = createRealtime()
    const off = realtime.subscribe('/user/queue/match', (e) => navigate(`/play/${(e.data as { roomCode: string }).roomCode}`))
    roomApi.matchmaking().catch(setError)
    return () => {
      off()
      realtime.close()
      roomApi.leaveMatchmaking().catch(() => {})
    }
  }, [searching, navigate])

  const create = async () => {
    try {
      const room = await roomApi.create({ rounds, region, types, isPublic })
      navigate(`/play/${room.code}`)
    } catch (e) {
      setError(e)
    }
  }

  const join = async (code: string) => {
    try {
      await roomApi.join(code.toUpperCase())
      navigate(`/play/${code.toUpperCase()}`)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <PageShell title={t('mp.title')} eyebrow={t('mp.eyebrow')}>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Zap className="size-5 text-primary" /> {t('mp.quickMatch')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('mp.quickMatchHint')}</p>
          <Button className="mt-5 w-full" variant={searching ? 'outline' : 'default'} onClick={() => setSearching((s) => !s)}>
            {searching ? (
              <>
                <Loader2 className="animate-spin" /> {t('mp.searching')}
              </>
            ) : (
              t('mp.findMatch')
            )}
          </Button>
          <div className="mt-8">
            <label className="eyebrow" htmlFor="join-code">{t('mp.joinWithCode')}</label>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (joinCode.trim().length >= 4) join(joinCode.trim())
              }}
            >
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABCDE"
                autoComplete="off"
                className="h-10 w-full rounded-full border border-input bg-white/[0.03] px-4 font-mono tracking-[0.3em] outline-none focus:border-primary"
              />
              <Button type="submit" variant="outline">{t('mp.join')}</Button>
            </form>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">{t('mp.createRoom')}</h2>
          <label className="eyebrow mt-4 block" htmlFor="rounds">{t('mp.rounds', { n: rounds })}</label>
          <input id="rounds" type="range" min={3} max={15} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="mt-2 w-full accent-[var(--primary)]" />
          <p className="eyebrow mt-4">{t('quiz.region')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={region === null} onClick={() => setRegion(null)}>{t('region.World')}</Chip>
            {REGIONS.map((r) => (
              <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{t(`region.${r}`)}</Chip>
            ))}
          </div>
          <p className="eyebrow mt-4">{t('quiz.types')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TYPES.map((id) => (
              <Chip
                key={id}
                active={types.includes(id)}
                onClick={() => setTypes((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]))}
              >
                {text.typeLabel(id)}
              </Chip>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-[var(--primary)]" />
            {t('mp.listPublicly')}
          </label>
          <Button className="mt-5 w-full" onClick={create}>{t('mp.createRoom')}</Button>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Users className="size-5 text-primary" /> {t('mp.openRooms')}
          </h2>
          {rooms.length === 0 ? (
            <EmptyHint>{t('mp.noOpenRooms')}</EmptyHint>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {rooms.map((r) => (
                <li key={r.code} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-mono tracking-widest">{r.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('mp.openRoomLine', { host: r.hostName, players: r.players, max: r.maxPlayers, rounds: r.settings.rounds })}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => join(r.code)}>{t('mp.join')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <ErrorText error={error} />
    </PageShell>
  )
}

// ============================================================================== room ===========

interface RoundResult {
  userId: string
  name: string
  points: number
  correct: boolean
  answer: string | null
}

interface RoundState {
  question: PublicQuestion
  round: number
  endsAt: number
  picked: string | null
  feedback: Feedback | null
  results: RoundResult[] | null
  nextAt: number | null
}

interface ChatLine {
  id: number
  name: string
  text: string
}

function RoomScreen({ code }: { code: string }) {
  const t = useT()
  const fmt = useNumberFormat()
  const me = useAuth((s) => s.user)
  const { byCode } = useCountries()
  const navigate = useNavigate()
  const [room, setRoom] = useState<RoomView | null>(null)
  const [round, setRound] = useState<RoundState | null>(null)
  const [answered, setAnswered] = useState(0)
  const [startsAt, setStartsAt] = useState<number | null>(null)
  const [placements, setPlacements] = useState<{ placement: number; name: string; score: number; userId: string }[] | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [message, setMessage] = useState('')
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const rt = useRef<Realtime | null>(null)

  // join (idempotent) and load the current state
  useEffect(() => {
    roomApi
      .join(code)
      .then(setRoom)
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'game_running') roomApi.get(code).then(setRoom)
        else setError(e)
      })
  }, [code])

  const onEvent = useCallback(
    (e: RoomEvent) => {
      switch (e.type) {
        case 'ROOM_STATE':
          setRoom(e.data as RoomView)
          break
        case 'GAME_STARTING':
          setPlacements(null)
          setRound(null)
          setStartsAt(Date.parse(e.data as string))
          break
        case 'ROUND_STARTED': {
          const d = e.data as { round: number; question: PublicQuestion; endsAt: string }
          setStartsAt(null)
          setAnswered(0)
          setRound({ question: d.question, round: d.round, endsAt: Date.parse(d.endsAt), picked: null, feedback: null, results: null, nextAt: null })
          break
        }
        case 'PLAYER_ANSWERED':
          setAnswered((e.data as { answered: number }).answered)
          break
        case 'ROUND_ENDED': {
          const d = e.data as {
            correctAnswer: string
            correctLabel: string
            correctCountry: string
            results: (RoundResult & { distanceKm: number | null })[]
            scoreboard: PlayerView[]
            nextAt: string
          }
          const mine = d.results.find((r) => r.userId === me?.id)
          setRound((r) =>
            r && {
              ...r,
              results: d.results,
              nextAt: Date.parse(d.nextAt),
              feedback: {
                correct: !!mine?.correct,
                points: mine?.points ?? 0,
                correctAnswer: d.correctAnswer,
                correctLabel: d.correctLabel,
                correctCountry: d.correctCountry,
                distanceKm: mine?.distanceKm ?? null,
                late: !mine?.answer,
              },
            },
          )
          setRoom((rm) => rm && { ...rm, players: d.scoreboard })
          break
        }
        case 'GAME_FINISHED':
          setRound(null)
          setPlacements((e.data as { placements: { placement: number; name: string; score: number; userId: string }[] }).placements)
          break
        case 'CHAT': {
          const d = e.data as { name: string; text: string }
          setChat((c) => [...c.slice(-49), { id: Date.now() + Math.random(), name: d.name, text: d.text }])
          break
        }
      }
    },
    [me?.id],
  )

  useEffect(() => {
    // Subscribe only after the join request completed; the broker verifies room membership.
    if (!room) return
    const realtime = createRealtime(setConnected)
    rt.current = realtime
    const offRoom = realtime.subscribe(`/topic/rooms/${code}`, onEvent)
    const offErr = realtime.subscribe('/user/queue/errors', (e) => setError(new Error((e as unknown as { message: string }).message)))
    return () => {
      offRoom()
      offErr()
      realtime.close()
    }
  }, [code, onEvent, !!room])

  const answer = (choice: string) => {
    if (!round || round.picked || round.feedback) return
    setRound({ ...round, picked: choice })
    rt.current?.send(`/app/rooms/${code}/answer`, { round: round.round, answer: choice })
  }

  const leave = async () => {
    await roomApi.leave(code).catch(() => {})
    navigate('/play')
  }

  const isHost = room?.hostId === me?.id
  const players = useMemo(() => room?.players ?? [], [room])
  const colorOf = useCallback(
    (userId: string) => PLAYER_COLORS[Math.max(0, players.findIndex((p) => p.id === userId)) % PLAYER_COLORS.length],
    [players],
  )

  // after a "find the country" round: one dot per player where they clicked
  const markers = useMemo<GlobeMarker[]>(() => {
    if (!round?.results || round.question.type !== 'LOCATE') return []
    return round.results.flatMap((r) => {
      const c = r.answer ? byCode.get(r.answer) : undefined
      return c?.latlng ? [{ lat: c.latlng[0], lng: c.latlng[1], color: colorOf(r.userId) }] : []
    })
  }, [round, byCode, colorOf])

  const isLocate = round?.question.type === 'LOCATE'

  return (
    <PageShell
      title={t('mp.room', { code })}
      eyebrow={room ? statusLabel(t, room, startsAt, round) : t('mp.joining')}
      wide={isLocate}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('flex items-center gap-1.5 text-xs', connected ? 'text-emerald-300' : 'text-destructive')} role="status">
            {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {connected ? t('mp.live') : t('mp.reconnecting')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href)
              setCopied(true)
            }}
          >
            <Copy /> {copied ? t('common.copied') : t('mp.inviteLink')}
          </Button>
          <Button variant="ghost" size="sm" onClick={leave}>{t('mp.leave')}</Button>
        </div>
      }
    >
      <div className={cn('grid gap-6', isLocate ? 'lg:grid-cols-[minmax(0,400px)_1fr_260px]' : 'lg:grid-cols-[1fr_300px]')}>
        <div className="flex flex-col gap-6">
          {room?.status === 'LOBBY' && (
            <Card>
              <h2 className="text-lg font-medium">{t('mp.waiting')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('mp.waitingHint', { code, rounds: room.settings.rounds, seconds: room.settings.roundSeconds })}
              </p>
              {isHost ? (
                <Button className="mt-5" onClick={() => roomApi.start(code).catch(setError)}>
                  <Play /> {t('mp.start')}
                </Button>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">{t('mp.hostStarts')}</p>
              )}
            </Card>
          )}
          {startsAt && <Countdown until={startsAt} />}
          {round && (
            <Card>
              <QuestionPanel
                key={round.round}
                question={round.question}
                endsAt={round.endsAt}
                flagPath={round.question.hasFlag ? `/rooms/${code}/rounds/${round.round}/flag` : undefined}
                picked={round.picked}
                feedback={round.feedback}
                onAnswer={answer}
              />
              {!round.feedback && (
                <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
                  {t('mp.answered', { n: answered, total: players.filter((p) => p.connected).length })}
                </p>
              )}
              {round.results && (
                <ul className="mt-4 grid gap-1.5 text-sm">
                  {round.results.map((r) => (
                    <li key={r.userId} className="flex items-center justify-between gap-2">
                      <span className={cn('flex items-center gap-2', r.correct ? 'text-emerald-300' : 'text-muted-foreground')}>
                        {isLocate && <span className="size-2.5 rounded-full" style={{ background: colorOf(r.userId) }} aria-hidden />}
                        {r.name}
                      </span>
                      <span className="tabular">+{fmt(r.points)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {placements && (
            <Card>
              <h2 className="font-serif text-3xl">
                {placements[0]?.userId === me?.id ? t('mp.youWon') : t('mp.wins', { name: placements[0]?.name ?? '' })}
              </h2>
              <ol className="mt-4 divide-y divide-border">
                {placements.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="tabular w-6 text-muted-foreground">{p.placement}.</span>
                      {p.placement === 1 && <Crown className="size-4 text-amber-300" aria-label={t('common.winner')} />}
                      {p.name}
                    </span>
                    <span className="tabular">{fmt(p.score)}</span>
                  </li>
                ))}
              </ol>
              {isHost && (
                <Button className="mt-5" variant="outline" onClick={() => roomApi.rematch(code).catch(setError)}>
                  <RotateCcw /> {t('mp.rematch')}
                </Button>
              )}
            </Card>
          )}
          <ErrorText error={error} />
        </div>

        {isLocate && round && (
          <QuizGlobe
            className="h-[52vh] min-h-[320px] rounded-3xl border border-border sm:h-[60vh] sm:min-h-[420px]"
            onPick={answer}
            disabled={!!round.picked || !!round.feedback}
            highlight={round.feedback ? round.feedback.correctCountry : round.picked}
            markers={markers}
          />
        )}

        <div className="flex flex-col gap-6">
          <Card>
            <p className="eyebrow mb-3">{t('mp.players')}</p>
            <ul className="grid gap-2 text-sm">
              {[...players].sort((a, b) => b.score - a.score).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className={cn('flex items-center gap-2 truncate', !p.connected && 'text-muted-foreground line-through')}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(p.id) }} aria-hidden />
                    {p.host && <Crown className="size-3.5 text-amber-300" aria-label={t('mp.host')} />}
                    {p.name}
                    {p.id === me?.id && <span className="text-xs text-muted-foreground">({t('mp.you')})</span>}
                  </span>
                  <span className="tabular">{fmt(p.score)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="eyebrow mb-3" id="chat-label">{t('mp.chat')}</p>
            <div className="scrollbar-thin flex h-48 flex-col gap-1.5 overflow-y-auto text-sm" role="log" aria-labelledby="chat-label" aria-live="polite">
              {chat.length === 0 && <p className="text-xs text-muted-foreground">{t('mp.sayHi')}</p>}
              {chat.map((c) => (
                <p key={c.id}>
                  <span className="text-primary">{c.name}:</span> {c.text}
                </p>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!message.trim()) return
                rt.current?.send(`/app/rooms/${code}/chat`, { text: message })
                setMessage('')
              }}
            >
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={200}
                placeholder={t('mp.message')}
                aria-label={t('mp.message')}
                className="h-9 w-full rounded-full border border-input bg-white/[0.03] px-3.5 text-sm outline-none focus:border-primary"
              />
              <Button size="icon-sm" type="submit" aria-label={t('mp.send')}>
                <Send />
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}

function statusLabel(t: ReturnType<typeof useT>, room: RoomView, startsAt: number | null, round: RoundState | null) {
  if (startsAt) return t('mp.getReady')
  if (round) return t('mp.roundOf', { n: round.round + 1, total: round.question.total })
  if (room.status === 'LOBBY') return t('mp.lobbyPlayers', { n: room.players.length })
  if (room.status === 'RUNNING') return t('mp.roundOf', { n: Math.max(1, room.round + 1), total: room.totalRounds })
  return t('mp.gameOver')
}

function Countdown({ until }: { until: number }) {
  const t = useT()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, Math.ceil((until - now) / 1000))
  return (
    <Card className="flex flex-col items-center py-12">
      <p className="eyebrow">{t('mp.startingIn')}</p>
      <p className="tabular font-serif text-8xl" aria-live="assertive">{s}</p>
    </Card>
  )
}
