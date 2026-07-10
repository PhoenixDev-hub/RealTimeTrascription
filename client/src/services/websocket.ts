import { WS_URL } from '../config/backend'

export type TranscriptMessage = {
  type: 'transcript' | 'status' | 'error'
  text: string
  isFinal: boolean
  error: boolean
  speaker?: string
}

type OuvinteTranscricao = (mensagem: TranscriptMessage) => void
type OuvinteStatus = (conectado: boolean) => void

export function parseTranscriptMessage(data: unknown): TranscriptMessage {
  if (typeof data !== 'string' && (typeof data !== 'object' || data === null)) {
    return { type: 'transcript', text: '', isFinal: false, error: false }
  }

  try {
    const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as {
      type?: unknown
      text?: unknown
      is_final?: unknown
      isFinal?: unknown
      error?: unknown
      speaker?: unknown
    }
    const type = parsed.type === 'status' || parsed.type === 'error' ? parsed.type : 'transcript'

    return {
      type,
      text: typeof parsed.text === 'string' ? parsed.text : '',
      isFinal: Boolean(parsed.is_final ?? parsed.isFinal),
      error: Boolean(parsed.error),
      speaker: typeof parsed.speaker === 'string' ? parsed.speaker : undefined,
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

const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30000
const MAX_RECONNECT_ATTEMPTS = 10

class SoqueteTranscricao {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private manuallyClosed = false
  private transcriptListeners = new Set<OuvinteTranscricao>()
  private statusListeners = new Set<OuvinteStatus>()
  private reconnectAttempts = 0
  private currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS
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
        if (message.isFinal && message.type === 'transcript') {
          this.lastCachedMessage = message
          this.transcriptCache.push(message)
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

  onTranscript(listener: OuvinteTranscricao) {
    this.transcriptListeners.add(listener)
    this.connect()

    return () => {
      this.transcriptListeners.delete(listener)
    }
  }

  onStatus(listener: OuvinteStatus) {
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

    this.reconnectAttempts++

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[WebSocket] Máximo de tentativas (${MAX_RECONNECT_ATTEMPTS}) atingido`
      )
      this.notifyStatus(false)
      return
    }

    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * 2,
      MAX_RECONNECT_DELAY_MS
    )

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
    return parseTranscriptMessage(data)
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

  getTranscriptCache(): TranscriptMessage[] {
    return this.transcriptCache
  }

  clearTranscriptCache() {
    this.transcriptCache = []
    this.lastCachedMessage = null
    try {
      sessionStorage.removeItem('transcriptCache')
    } catch (error) {
      console.warn('[WebSocket] Erro ao limpar cache:', error)
    }
  }
}

const transcriptSocket = new SoqueteTranscricao()

export default transcriptSocket
