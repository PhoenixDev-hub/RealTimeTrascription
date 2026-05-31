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

// Configuração de reconexão com backoff exponencial
const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30000
const MAX_RECONNECT_ATTEMPTS = 10

class TranscriptSocket {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private manuallyClosed = false
  private transcriptListeners = new Set<TranscriptListener>()
  private statusListeners = new Set<StatusListener>()

  // Reconexão com backoff
  private reconnectAttempts = 0
  private currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS

  // Cache local
  private transcriptCache: TranscriptMessage[] = []
  private lastCachedMessage: TranscriptMessage | null = null

  constructor() {
    this.loadTranscriptCache()
  }

  connect() {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      console.debug('[WebSocket] Conexão já ativa')
      return
    }

    this.manuallyClosed = false
    console.log(`[WebSocket] Conectando em ${WS_URL}`)
    this.socket = new WebSocket(WS_URL)

    this.socket.onopen = () => {
      console.log('[WebSocket] Conectado com sucesso')
      this.reconnectAttempts = 0
      this.currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS
      this.notifyStatus(true)
    }

    this.socket.onmessage = (event) => {
      const message = this.parseMessage(event.data)

      if (message.type === 'status') {
        this.notifyStatus(true)
      }

      if (message.text && message.type !== 'status') {
        // Cache da mensagem se for final
        if (message.isFinal && message.type === 'transcript') {
          this.lastCachedMessage = message
          this.transcriptCache.push(message)
          // Manter only últimas 50 transcrições
          if (this.transcriptCache.length > 50) {
            this.transcriptCache.shift()
          }
          this.saveTranscriptCache()
        }

        this.transcriptListeners.forEach((listener) => listener(message))
      }
    }

    this.socket.onerror = (event) => {
      console.error('[WebSocket] Erro:', event)
      this.socket?.close()
    }

    this.socket.onclose = () => {
      console.warn('[WebSocket] Desconectado')
      this.notifyStatus(false)

      if (!this.manuallyClosed) {
        this.scheduleReconnect()
      }
    }
  }

  disconnect() {
    console.log('[WebSocket] Desconectando...')
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

    // Incrementar tentativas
    this.reconnectAttempts++

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[WebSocket] Máximo de tentativas (${MAX_RECONNECT_ATTEMPTS}) atingido`
      )
      this.notifyStatus(false)
      return
    }

    // Calcular delay com backoff exponencial
    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * 2,
      MAX_RECONNECT_DELAY_MS
    )

    // Adicionar jitter (randomização) para evitar thundering herd
    const jitter = Math.random() * 0.1 * this.currentReconnectDelay
    const delay = this.currentReconnectDelay + jitter

    console.log(
      `[WebSocket] Reconectando em ${delay.toFixed(0)}ms (tentativa ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
    )

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
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
      console.error('[WebSocket] Erro ao parsear mensagem:', data, error)
      return {
        type: 'error',
        text: 'Falha ao processar mensagem do servidor',
        isFinal: true,
        error: true,
      }
    }
  }

  private saveTranscriptCache() {
    try {
      sessionStorage.setItem('transcriptCache', JSON.stringify(this.transcriptCache))
    } catch (error) {
      console.warn('[WebSocket] Erro ao salvar cache:', error)
    }
  }

  private loadTranscriptCache() {
    try {
      const cached = sessionStorage.getItem('transcriptCache')
      if (cached) {
        this.transcriptCache = JSON.parse(cached)
        if (this.transcriptCache.length > 0) {
          this.lastCachedMessage = this.transcriptCache[this.transcriptCache.length - 1]
        }
      }
    } catch (error) {
      console.warn('[WebSocket] Erro ao carregar cache:', error)
    }
  }

  getLastCachedMessage(): TranscriptMessage | null {
    return this.lastCachedMessage
  }
}

const transcriptSocket = new TranscriptSocket()

export default transcriptSocket
