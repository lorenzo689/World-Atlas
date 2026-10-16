import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Crown, Loader2, Play, RotateCcw, Send, Users, Wifi, WifiOff, Zap } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { roomApi, type OpenRoom, type PlayerView, type PublicQuestion, type QuestionType, type RoomView } from '@/lib/backend'
import { createRealtime, type Realtime, type RoomEvent } from '@/lib/realtime'
import { useAuth } from '@/store/auth'
import { useDocumentMeta } from '@/hooks/useMisc'
import { Card, EmptyHint, ErrorText, PageShell, RequireUser } from '@/components/layout/PageShell'
import { QuestionPanel, type Feedback } from '@/components/game/QuestionPanel'
import { QuizGlobe } from '@/components/game/QuizGlobe'
import { Button } from '@/components/ui/button'
import { Chip, REGIONS, TYPES } from '@/pages/QuizPage'
import { cn } from '@/lib/utils'

export default function MultiplayerPage() {
  useDocumentMeta({ title: 'Multiplayer · World Explorer', description: 'Play the geo quiz live against friends.' })
  const { code } = useParams()
  return <RequireUser>{code ? <RoomScreen code={code.toUpperCase()} /> : <Lobby />}</RequireUser>
}

// ============================================================================== lobby ==========

function Lobby() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<OpenRoom[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [rounds, setRounds] = useState(8)
  const [region, setRegion] = useState<string | null>(null)
  const [types, setTypes] = useState<QuestionType[]>(['LOCATE', 'CAPITAL', 'FLAG'])
  const [isPublic, setIsPublic] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const rt = useRef<Realtime | null>(null)

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
    rt.current = realtime
    const off = realtime.subscribe('/user/queue/match', (e) => {
      const data = e.data as { roomCode: string }
      navigate(`/play/${data.roomCode}`)
    })
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
    <PageShell title="Multiplayer" eyebrow="Live geo quiz">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Zap className="size-5 text-primary" /> Quick match
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Get paired with 1–3 other players waiting right now.</p>
          <Button className="mt-5 w-full" variant={searching ? 'outline' : 'default'} onClick={() => setSearching((s) => !s)}>
            {searching ? (
              <>
                <Loader2 className="animate-spin" /> Searching… (cancel)
              </>
            ) : (
              'Find a match'
            )}
          </Button>
          <div className="mt-8">
            <p className="eyebrow">Join with a code</p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (joinCode.trim().length >= 4) join(joinCode.trim())
              }}
            >
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="ABCDE"
                className="h-10 w-full rounded-full border border-input bg-white/[0.03] px-4 font-mono tracking-[0.3em] outline-none focus:border-primary"
              />
              <Button type="submit" variant="outline">Join</Button>
            </form>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Create a room</h2>
          <p className="eyebrow mt-4">Rounds · {rounds}</p>
          <input type="range" min={3} max={15} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="mt-2 w-full accent-[var(--primary)]" />
          <p className="eyebrow mt-4">Region</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={region === null} onClick={() => setRegion(null)}>World</Chip>
            {REGIONS.map((r) => (
              <Chip key={r} active={region === r} onClick={() => setRegion(r)}>{r}</Chip>
            ))}
          </div>
          <p className="eyebrow mt-4">Questions</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <Chip
                key={t.id}
                active={types.includes(t.id)}
                onClick={() => setTypes((cur) => (cur.includes(t.id) ? (cur.length > 1 ? cur.filter((x) => x !== t.id) : cur) : [...cur, t.id]))}
              >
                {t.label}
              </Chip>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-[var(--primary)]" />
            List publicly in the lobby
          </label>
          <Button className="mt-5 w-full" onClick={create}>Create room</Button>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Users className="size-5 text-primary" /> Open rooms
          </h2>
          {rooms.length === 0 ? (
            <EmptyHint>No open rooms right now. Create one!</EmptyHint>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {rooms.map((r) => (
                <li key={r.code} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-mono tracking-widest">{r.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.hostName} · {r.players}/{r.maxPlayers} players · {r.settings.rounds} rounds{r.settings.region ? ` · ${r.settings.region}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => join(r.code)}>Join</Button>
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

interface RoundState {
  question: PublicQuestion
  round: number
  endsAt: number
  picked: string | null
  feedback: Feedback | null
  results: { userId: string; name: string; points: number; correct: boolean; answer: string | null }[] | null
  nextAt: number | null
}

interface ChatLine {
  id: number
  name: string
  text: string
}

function RoomScreen({ code }: { code: string }) {
  const me = useAuth((s) => s.user)
  const navigate = useNavigate()
  const [room, setRoom] = useState<RoomView | null>(null)
  const [round, setRound] = useState<RoundState | null>(null)
  const [answered, setAnswered] = useState(0)
  const [startsAt, setStartsAt] = useState<number | null>(null)
  const [placements, setPlacements] = useState<{ placement: number; name: string; score: number; userId: string }[] | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [message, setMessage] = useState('')
  const [connected, setConnected] = useState(false)
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
            results: { userId: string; name: string; points: number; correct: boolean; answer: string | null; distanceKm: number | null }[]
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
    const realtime = createRealtime(setConnected)
    rt.current = realtime
    const offRoom = realtime.subscribe(`/topic/rooms/${code}`, onEvent)
    const offErr = realtime.subscribe('/user/queue/errors', (e) => setError(new Error((e as unknown as { message: string }).message)))
    return () => {
      offRoom()
      offErr()
      realtime.close()
    }
  }, [code, onEvent])

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
  const players = room?.players ?? []

  return (
    <PageShell
      title={`Room ${code}`}
      eyebrow={room ? statusLabel(room, startsAt, round) : 'Joining…'}
      wide={round?.question.type === 'LOCATE'}
      actions={
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1.5 text-xs', connected ? 'text-emerald-300' : 'text-destructive')}>
            {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {connected ? 'live' : 'reconnecting'}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
            <Copy /> Invite link
          </Button>
          <Button variant="ghost" size="sm" onClick={leave}>Leave</Button>
        </div>
      }
    >
      <div className={cn('grid gap-6', round?.question.type === 'LOCATE' ? 'lg:grid-cols-[minmax(0,400px)_1fr_260px]' : 'lg:grid-cols-[1fr_300px]')}>
        <div className="flex flex-col gap-6">
          {room?.status === 'LOBBY' && (
            <Card>
              <h2 className="text-lg font-medium">Waiting for players</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share the code <span className="font-mono tracking-widest text-foreground">{code}</span>. {room.settings.rounds} rounds of{' '}
                {room.settings.roundSeconds} s{room.settings.region ? ` · ${room.settings.region}` : ''}.
              </p>
              {isHost ? (
                <Button className="mt-5" onClick={() => roomApi.start(code).catch(setError)}>
                  <Play /> Start game
                </Button>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">The host starts the game.</p>
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
                <p className="mt-4 text-xs text-muted-foreground">
                  {answered} of {players.filter((p) => p.connected).length} answered
                </p>
              )}
              {round.results && (
                <ul className="mt-4 grid gap-1.5 text-sm">
                  {round.results.map((r) => (
                    <li key={r.userId} className="flex justify-between">
                      <span className={cn(r.correct ? 'text-emerald-300' : 'text-muted-foreground')}>{r.name}</span>
                      <span className="tabular">+{r.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {placements && (
            <Card>
              <h2 className="font-serif text-3xl">{placements[0]?.userId === me?.id ? 'You won! 🎉' : `${placements[0]?.name} wins`}</h2>
              <ol className="mt-4 divide-y divide-border">
                {placements.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="tabular w-6 text-muted-foreground">{p.placement}.</span>
                      {p.placement === 1 && <Crown className="size-4 text-amber-300" />}
                      {p.name}
                    </span>
                    <span className="tabular">{p.score.toLocaleString('en')}</span>
                  </li>
                ))}
              </ol>
              {isHost && (
                <Button className="mt-5" variant="outline" onClick={() => roomApi.rematch(code).catch(setError)}>
                  <RotateCcw /> Rematch
                </Button>
              )}
            </Card>
          )}
          <ErrorText error={error} />
        </div>

        {round?.question.type === 'LOCATE' && (
          <QuizGlobe
            className="h-[60vh] min-h-[420px] rounded-3xl border border-border"
            onPick={answer}
            disabled={!!round.picked || !!round.feedback}
            highlight={round.feedback ? round.feedback.correctAnswer : round.picked}
          />
        )}

        <div className="flex flex-col gap-6">
          <Card>
            <p className="eyebrow mb-3">Players</p>
            <ul className="grid gap-2 text-sm">
              {[...players].sort((a, b) => b.score - a.score).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className={cn('flex items-center gap-2 truncate', !p.connected && 'text-muted-foreground line-through')}>
                    {p.host && <Crown className="size-3.5 text-amber-300" />}
                    {p.name}
                    {p.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </span>
                  <span className="tabular">{p.score.toLocaleString('en')}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="eyebrow mb-3">Chat</p>
            <div className="scrollbar-thin flex h-48 flex-col gap-1.5 overflow-y-auto text-sm">
              {chat.length === 0 && <p className="text-xs text-muted-foreground">Say hi 👋</p>}
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
                placeholder="Message"
                className="h-9 w-full rounded-full border border-input bg-white/[0.03] px-3.5 text-sm outline-none focus:border-primary"
              />
              <Button size="icon-sm" type="submit" aria-label="Send">
                <Send />
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}

function statusLabel(room: RoomView, startsAt: number | null, round: RoundState | null) {
  if (startsAt) return 'Get ready…'
  if (round) return `Round ${round.round + 1} of ${round.question.total}`
  if (room.status === 'LOBBY') return `Lobby · ${room.players.length} player${room.players.length === 1 ? '' : 's'}`
  if (room.status === 'RUNNING') return `Round ${Math.max(1, room.round + 1)} of ${room.totalRounds}`
  return 'Game over'
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, Math.ceil((until - now) / 1000))
  return (
    <Card className="flex flex-col items-center py-12">
      <p className="eyebrow">Starting in</p>
      <p className="tabular font-serif text-8xl">{s}</p>
    </Card>
  )
}
