import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs'
import { accessToken } from '@/lib/api'

/** Event as sent by the backend's RoomBroadcaster: {"type": "...", "data": {...}, "at": "..."} */
export interface RoomEvent<T = unknown> {
  type: string
  data: T
  at: string
}

/**
 * One STOMP-over-WebSocket connection to the backend (`/ws`, proxied by Vite).
 * The JWT goes into the CONNECT frame (browsers can't set headers on the WebSocket handshake);
 * `beforeConnect` fetches a fresh token on every (re)connect.
 */
export function createRealtime(onStatus?: (connected: boolean) => void) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const client = new Client({
    brokerURL: `${protocol}://${window.location.host}/ws`,
    reconnectDelay: 2000,
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    beforeConnect: async () => {
      const token = await accessToken()
      client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {}
    },
  })
  client.onConnect = () => onStatus?.(true)
  client.onWebSocketClose = () => onStatus?.(false)
  client.activate()

  const parse = (m: IMessage) => JSON.parse(m.body) as RoomEvent

  return {
    client,
    /** Subscribes once connected (and again after every reconnect). Returns an unsubscribe function. */
    subscribe(destination: string, handler: (e: RoomEvent) => void): () => void {
      let sub: StompSubscription | null = null
      const attach = () => {
        sub = client.subscribe(destination, (m) => handler(parse(m)))
      }
      if (client.connected) attach()
      const previous = client.onConnect
      client.onConnect = (frame) => {
        previous(frame)
        attach()
      }
      return () => sub?.unsubscribe()
    },
    send(destination: string, body: unknown) {
      if (client.connected) client.publish({ destination, body: JSON.stringify(body) })
    },
    close() {
      void client.deactivate()
    },
  }
}

export type Realtime = ReturnType<typeof createRealtime>
