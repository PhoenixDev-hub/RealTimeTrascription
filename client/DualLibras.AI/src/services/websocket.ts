export type TranscriptMessage = {
  type: 'transcript' | 'status' | 'error'
  text: string
  isFinal: boolean
  error: boolean
}

type TranscriptListener = (message: TranscriptMessage) => void
type StatusListener = (connected: boolean) => void

const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST ?? 'localhost'
const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT ?? '5455'
const WS_URL =
  import.meta.env.VITE_BACKEND_WS_URL ??
  `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws`
const RECONNECT_DELAY_MS = 1500

class TranscriptSocket {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private manuallyClosed = false
  private transcriptListeners = new Set<TranscriptListener>()
  private statusListeners = new Set<StatusListener>()

  connect() {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      return
    }

    this.manuallyClosed = false
    this.socket = new WebSocket(WS_URL)

    this.socket.onopen = () => {
      this.notifyStatus(true)
    }

    this.socket.onmessage = (event) => {
      const message = this.parseMessage(event.data)

      if (message.type === 'status') {
        this.notifyStatus(true)
      }

      if (message.text && message.type !== 'status') {
        this.transcriptListeners.forEach((listener) => listener(message))
      }
    }

    this.socket.onerror = () => {
      this.socket?.close()
    }

    this.socket.onclose = () => {
      this.notifyStatus(false)

      if (!this.manuallyClosed) {
        this.scheduleReconnect()
      }
    }
  }

  disconnect() {
    this.manuallyClosed = true

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.socket?.close()
    this.socket = null
  }

  onTranscript(listener: TranscriptListener) {
    this.transcriptListeners.add(listener)
    this.connect()

    return () => {
      this.transcriptListeners.delete(listener)
    }
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener)
    this.connect()

    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_DELAY_MS)
  }

  private notifyStatus(connected: boolean) {
    this.statusListeners.forEach((listener) => listener(connected))
  }

  private parseMessage(data: unknown): TranscriptMessage {
    if (typeof data !== 'string') {
      return { type: 'transcript', text: '', isFinal: false, error: false }
    }

    try {
      const parsed = JSON.parse(data) as {
        type?: unknown
        text?: unknown
        is_final?: unknown
        isFinal?: unknown
        error?: unknown
      }
      const type = parsed.type === 'status' || parsed.type === 'error' ? parsed.type : 'transcript'

      return {
        type,
        text: typeof parsed.text === 'string' ? parsed.text : '',
        isFinal: Boolean(parsed.is_final ?? parsed.isFinal),
        error: Boolean(parsed.error),
      }
    } catch (error) {
      console.error('Failed to parse message:', data, error)
      return {
        type: 'error',
        text: 'Failed to parse server message',
        isFinal: true,
        error: true,
      }
    }
  }
}

const transcriptSocket = new TranscriptSocket()

export default transcriptSocket
