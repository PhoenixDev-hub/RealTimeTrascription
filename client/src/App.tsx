import { useEffect, useMemo, useState, useRef } from 'react'
import {
  Maximize,
  FolderOpen,
  Minimize,
  Save,
  FileText,
  FileCode,
  Settings as SettingsIcon,
  FileDown,
  Download,
  Mic,
  MicOff,
  AlertTriangle,
  Wifi,
  WifiOff,
  Volume2
} from 'lucide-react'
import VLibras from './components/VLibras'
import simplifyText from './services/simplify'
import transcriptSocket, { parseTranscriptMessage } from './services/websocket'

const CONTENT_ID = 'conteudo-libras'

const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST ?? 'localhost'
const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT ?? '5455'
const API_BASE = import.meta.env.VITE_BACKEND_HTTP_URL ?? `http://${BACKEND_HOST}:${BACKEND_PORT}`
const WS_URL = import.meta.env.VITE_BACKEND_WS_URL ?? `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws`

type SavedGroup = {
  id: string
  dateStr: string
  pdf?: string
  txt?: string
  json?: string
}

const formatFilenameDate = (timestamp: string) => {
  try {
    const parts = timestamp.split('_')
    const datePart = parts[0]
    const timePart = parts[1]
    const year = datePart.substring(0, 4)
    const month = datePart.substring(4, 6)
    const day = datePart.substring(6, 8)
    const hour = timePart.substring(0, 2)
    const minute = timePart.substring(2, 4)
    return `${day}/${month}/${year} às ${hour}:${minute}`
  } catch {
    return timestamp
  }
}

function App() {
  const [texto, setTexto] = useState('')
  const [textoFinal, setTextoFinal] = useState('')
  const [conectado, setConectado] = useState(false)
  const [traducaoFinal, setTraducaoFinal] = useState(false)
  const [temErro, setTemErro] = useState(false)
  const [vlibrasStatus, setVLibrasStatus] = useState<'idle' | 'loading' | 'translating' | 'error' | 'ready'>('loading')

  // Estados para gerenciador de aulas
  const [showPanel, setShowPanel] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [titulo, setTitulo] = useState('Aula de Acessibilidade')
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>([])
  const [historicoTick, setHistoricoTick] = useState(0)
  const [docGenerating, setDocGenerating] = useState(false)
  const [docPath, setDocPath] = useState('')
  const [activeSpeaker, setActiveSpeaker] = useState('Professor')
  const [modoProjetor, setModoProjetor] = useState(false)

  useEffect(() => {
    console.debug('[App] Histórico atualizado, tick:', historicoTick)
  }, [historicoTick])

  // Novos estados da evolução: captura de áudio, VAD, WebRTC, latência
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [capturing, setCapturing] = useState(false)
  const [audioError, setAudioError] = useState<string>('')
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [speaking, setSpeaking] = useState(false)
  const [latencyMs, setLatencyMs] = useState<number>(0)
  const [latencyAlert, setLatencyAlert] = useState(false)
  const [connectionMode, setConnectionMode] = useState<'assemblyai' | 'local' | 'offline'>('offline')
  const [useVadGating, setUseVadGating] = useState<boolean>(true)
  const useVadGatingRef = useRef<boolean>(true)

  useEffect(() => {
    useVadGatingRef.current = useVadGating
    if (!useVadGating) {
      speakingRef.current = true
      setSpeaking(true)
    } else {
      speakingRef.current = speaking
    }
  }, [useVadGating, speaking])

  // Refs de áudio e conexões
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rnnoiseNodeRef = useRef<any>(null)
  const encoderNodeRef = useRef<AudioWorkletNode | null>(null)
  const vadRef = useRef<any>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const rtcPcRef = useRef<RTCPeerConnection | null>(null)
  const rtcDcRef = useRef<RTCDataChannel | null>(null)

  const speakingRef = useRef<boolean>(false)
  const lastSendTimeRef = useRef<number>(Date.now())

  // Lista os dispositivos de áudio disponíveis
  const carregarDispositivos = async () => {
    try {
      // Solicita permissão breve apenas para listar os nomes completos se necessário
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const devs = await navigator.mediaDevices.enumerateDevices()
      const audioDevs = devs.filter((d) => d.kind === 'audioinput')
      setDevices(audioDevs)
      if (audioDevs.length > 0) {
        setSelectedDevice(audioDevs[0].deviceId)
      }
    } catch (err) {
      console.warn('Erro ao obter permissão inicial ou listar dispositivos:', err)
      // Tenta listar sem permissão (alguns navegadores ocultam labels)
      navigator.mediaDevices.enumerateDevices()
        .then((devs) => {
          const audioDevs = devs.filter((d) => d.kind === 'audioinput')
          setDevices(audioDevs)
        })
        .catch((e) => console.error('Erro geral ao enumerar dispositivos:', e))
    }
  }

  useEffect(() => {
    carregarDispositivos()
  }, [])

  // Conecta ao WebSocket do backend
  const conectarSocket = () => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      return
    }

    console.log(`[WebSocket] Conectando ao backend em ${WS_URL}`)
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WebSocket] Conectado ao backend')
      setConectado(true)
      negociarWebRTC()
    }

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'webrtc_answer') {
          console.log('[WebRTC] Answer recebido do servidor')
          if (rtcPcRef.current) {
            await rtcPcRef.current.setRemoteDescription(
              new RTCSessionDescription({
                type: 'answer',
                sdp: data.sdp,
              })
            )
          }
        } else if (data.type === 'status') {
          setConnectionMode(data.mode || 'assemblyai')
        } else if (data.type === 'transcript') {
          const message = parseTranscriptMessage(data)
          const rtt = Date.now() - lastSendTimeRef.current
          setLatencyMs(rtt)
          setLatencyAlert(rtt > 500)

          setTexto(message.text)
          setTraducaoFinal(message.isFinal)
          setTemErro(message.error)

          if (message.speaker) {
            setActiveSpeaker(message.speaker)
          }

          if (message.isFinal && !message.error) {
            setTextoFinal(message.text)
            setHistoricoTick((tick) => tick + 1)

            // Põe a transcrição no cache para permitir salvar
            transcriptSocket.getTranscriptCache().push({
              type: 'transcript',
              text: message.text,
              isFinal: true,
              error: message.error,
              speaker: message.speaker,
            })
          }
        }
      } catch (err) {
        console.error('[WebSocket] Erro ao parsear mensagem:', err)
      }
    }

    ws.onerror = (err) => {
      console.error('[WebSocket] Erro:', err)
    }

    ws.onclose = () => {
      console.warn('[WebSocket] Conexão fechada. Reconectando em 2s...')
      setConectado(false)
      setConnectionMode('offline')

      // Limpa WebRTC
      if (rtcPcRef.current) {
        rtcPcRef.current.close()
        rtcPcRef.current = null
      }
      rtcDcRef.current = null

      setTimeout(conectarSocket, 2000)
    }
  }

  // Estabelece canal WebRTC para latência ultrabaixa
  const negociarWebRTC = async () => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      })
      rtcPcRef.current = pc

      // Cria canal de dados rápido e não ordenado (UDP-like)
      const dc = pc.createDataChannel('audio', { ordered: false, maxRetransmits: 0 })
      rtcDcRef.current = dc

      dc.onopen = () => {
        console.log('[WebRTC] Data Channel aberto com sucesso!')
      }

      dc.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'transcript') {
            const message = parseTranscriptMessage(data)
            const rtt = Date.now() - lastSendTimeRef.current
            setLatencyMs(rtt)
            setLatencyAlert(rtt > 500)

            setTexto(message.text)
            setTraducaoFinal(message.isFinal)
            setTemErro(message.error)
            if (message.speaker) {
              setActiveSpeaker(message.speaker)
            }
            if (message.isFinal && !message.error) {
              setTextoFinal(message.text)
              setHistoricoTick((tick) => tick + 1)

              transcriptSocket.getTranscriptCache().push({
                type: 'transcript',
                text: message.text,
                isFinal: true,
                error: message.error,
                speaker: message.speaker,
              })
            }
          }
        } catch (e) {
          console.error('[WebRTC] Erro no parsing de dados:', e)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Aguarda o gathering de ICE completar antes de enviar o offer (Vanilla ICE)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve()
        } else {
          const checkState = () => {
            console.log('[WebRTC] ICE Gathering State:', pc.iceGatheringState)
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState)
              resolve()
            }
          }
          pc.addEventListener('icegatheringstatechange', checkState)
          // Timeout de segurança
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', checkState)
            resolve()
          }, 5000)
        }
      })

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'webrtc_offer',
            sdp: pc.localDescription?.sdp || offer.sdp,
          })
        )
      }
    } catch (err) {
      console.error('[WebRTC] Erro na negociação:', err)
    }
  }

  // Inicia captura de áudio no frontend
  const iniciarCaptura = async () => {
    try {
      setAudioError('')

      // Conecta o WebSocket se necessário
      conectarSocket()

      // 1. getUserMedia com os constraints de latência e ruído solicitados
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0.01,
        } as any,
      })
      streamRef.current = stream

      // 2. AudioContext a 16 kHz para mono de baixa latência
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = ctx

      // 3. Registra o nó simple-rnnoise-wasm carregando os assets locais
      // @ts-ignore
      const { RNNoiseNode, rnnoise_loadAssets } = await import('simple-rnnoise-wasm')
      const assets = await rnnoise_loadAssets({
        scriptSrc: '/rnnoise.worklet.js',
        moduleSrc: '/rnnoise.wasm',
      })
      await RNNoiseNode.register(ctx, assets)

      // 4. Carrega o processador de PCM em thread separada
      await ctx.audioWorklet.addModule('/pcm-encoder-worklet.js')

      // 5. Configura grafo de Web Audio
      const source = ctx.createMediaStreamSource(stream)
      const rnnoiseNode = new RNNoiseNode(ctx)
      rnnoiseNodeRef.current = rnnoiseNode

      const encoderNode = new AudioWorkletNode(ctx, 'pcm-encoder')
      encoderNodeRef.current = encoderNode

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser

      // Conectando os nós: source -> rnnoise -> encoder & analyser
      source.connect(rnnoiseNode)
      rnnoiseNode.connect(encoderNode)
      rnnoiseNode.connect(analyser)

      // Mantém ativo conectando ao destino do contexto
      encoderNode.connect(ctx.destination)

      // 6. Recebe chunks PCM 16-bit e envia via WebRTC / WebSocket
      encoderNode.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          const buffer = event.data.buffer

          // Envia se VAD estiver desativado OU se houver fala ativa detectada
          if (!useVadGatingRef.current || speakingRef.current) {
            lastSendTimeRef.current = Date.now()

            if (rtcDcRef.current && rtcDcRef.current.readyState === 'open') {
              rtcDcRef.current.send(buffer)
            } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(buffer)
            }
          }
        }
      }

      // 7. Envia o áudio limpo para o VAD do Ricky
      try {
        const dest = ctx.createMediaStreamDestination()
        rnnoiseNode.connect(dest)

        const { MicVAD } = await import('@ricky0123/vad-web')
        const myvad = await MicVAD.new({
          audioContext: ctx,
          getStream: () => Promise.resolve(dest.stream),
          baseAssetPath: '/',
          onnxWASMBasePath: '/',
          positiveSpeechThreshold: 0.35, // Mais sensível para voz baixa
          onSpeechStart: () => {
            setSpeaking(true)
            speakingRef.current = true
          },
          onSpeechEnd: () => {
            setSpeaking(false)
            speakingRef.current = false
          },
        })
        vadRef.current = myvad
        await myvad.start()
      } catch (vadErr) {
        console.warn('VAD falhou ao iniciar. Usando envio contínuo como fallback.', vadErr)
        setSpeaking(true)
        speakingRef.current = true
      }

      // 8. Loop de animação do medidor de volume do microfone
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      const updateLevel = () => {
        if (!analyserRef.current || !streamRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        setAudioLevel(sum / bufferLength)
        requestAnimationFrame(updateLevel)
      }
      updateLevel()

      setCapturing(true)
    } catch (err: any) {
      console.error('Falha ao iniciar captura de áudio:', err)
      // Tratamento de erros amigável de permissão de microfone
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setAudioError('Permissão negada. Conceda acesso ao microfone nas configurações do navegador.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setAudioError('Microfone não encontrado. Conecte um dispositivo de entrada.')
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setAudioError('Microfone ocupado por outra aplicação.')
      } else {
        setAudioError(`Erro no áudio: ${err.message || err.name}`)
      }
    }
  }

  // Para a captura de áudio e limpa recursos
  const pararCaptura = async () => {
    setCapturing(false)
    setSpeaking(false)
    speakingRef.current = false
    setAudioLevel(0)

    if (vadRef.current) {
      await vadRef.current.destroy()
      vadRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close()
      audioContextRef.current = null
    }

    rnnoiseNodeRef.current = null
    encoderNodeRef.current = null
    analyserRef.current = null
  }

  // Limpa conexões WebSocket ao desmontar
  useEffect(() => {
    conectarSocket()
    return () => {
      pararCaptura()
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const carregarHistoricoSalvo = async () => {
    try {
      const response = await fetch(`${API_BASE}/transcripts`)
      if (!response.ok) throw new Error('Erro ao listar arquivos')
      const data = (await response.json()) as {
        total: number
        pdfs: string[]
        texts: string[]
        metadata: string[]
      }

      const groupsMap = new Map<string, Partial<SavedGroup>>()
      const getGroupId = (filename: string) => {
        const match = filename.match(/transcricao_(\d{8}_\d{6})/)
        return match ? match[1] : filename.split('.')[0]
      }

      data.pdfs.forEach((pdf) => {
        const id = getGroupId(pdf)
        if (!groupsMap.has(id)) groupsMap.set(id, { id })
        groupsMap.get(id)!.pdf = pdf
      })

      data.texts.forEach((txt) => {
        const id = getGroupId(txt)
        if (!groupsMap.has(id)) groupsMap.set(id, { id })
        groupsMap.get(id)!.txt = txt
      })

      data.metadata.forEach((meta) => {
        const id = getGroupId(meta)
        if (!groupsMap.has(id)) groupsMap.set(id, { id })
        groupsMap.get(id)!.json = meta
      })

      const list: SavedGroup[] = []
      groupsMap.forEach((val, key) => {
        list.push({
          id: key,
          dateStr: formatFilenameDate(key),
          pdf: val.pdf,
          txt: val.txt,
          json: val.json,
        })
      })

      list.sort((a, b) => b.id.localeCompare(a.id))
      setSavedGroups(list)
    } catch (error) {
      console.error('Falha ao carregar histórico salvo:', error)
    }
  }

  const salvarAula = async () => {
    const cache = transcriptSocket.getTranscriptCache()
    if (cache.length === 0) {
      alert('Não há transcrição acumulada para salvar nesta sessão.')
      return
    }

    const fullText = cache
      .map((msg) => `${msg.speaker || 'Palestrante'}: ${msg.text}`)
      .join('\n\n')

    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE}/save-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullText,
          title: titulo,
          formats: ['pdf', 'txt', 'json'],
          metadata: {
            evento: 'Festival 2026',
            origem: 'Interface Web',
            total_sentencas: cache.length,
          },
        }),
      })

      if (!response.ok) throw new Error('Erro ao salvar transcrição')

      alert('Aula salva com sucesso!')
      carregarHistoricoSalvo()
    } catch (error) {
      console.error(error)
      alert('Falha ao salvar a transcrição.')
    } finally {
      setIsSaving(false)
    }
  }

  const gerarDocumentacao = async () => {
    setDocGenerating(true)
    try {
      const response = await fetch(`${API_BASE}/documentation/generate`)
      if (!response.ok) throw new Error('Erro ao gerar documento')
      const data = await response.json()
      setDocPath(data.file)
      alert('Documentação PDF gerada com sucesso!')
    } catch (error) {
      console.error(error)
      alert('Falha ao gerar documentação.')
    } finally {
      setDocGenerating(false)
    }
  }

  const textoBase = useMemo(() => {
    const raw = (texto || textoFinal).trim()
    return temErro ? '' : raw
  }, [texto, textoFinal, temErro])

  const textoSimplificado = useMemo(() => {
    if (!textoBase) return ''
    return simplifyText(textoBase)
  }, [textoBase])

  // Buffer de 1 segundo para agrupar palavras em frases curtas e enviar ao player VLibras
  const [, setVlibrasBuffer] = useState('')
  const [textoEnviadoAoVLibras, setTextoEnviadoAoVLibras] = useState('')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!textoSimplificado) {
      setVlibrasBuffer('')
      setTextoEnviadoAoVLibras('')
      return
    }

    const cleanCurrent = textoSimplificado.trim()
    const cleanSent = textoEnviadoAoVLibras.trim()

    if (cleanCurrent === cleanSent) return

    let newPart = ''
    if (cleanCurrent.startsWith(cleanSent)) {
      newPart = cleanCurrent.substring(cleanSent.length).trim()
    } else {
      newPart = cleanCurrent
    }

    if (!newPart) return

    // Pausa natural (termina com pontuação como ponto final, vírgula, interrogação)
    const endsWithPause = /[.,\/#!$%\^&\*;:{}=\-_`~()?]/.test(newPart.slice(-1))

    if (endsWithPause) {
      setTextoEnviadoAoVLibras(cleanCurrent)
      setVlibrasBuffer('')
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    } else {
      setVlibrasBuffer(cleanCurrent)

      if (timerRef.current) window.clearTimeout(timerRef.current)

      timerRef.current = window.setTimeout(() => {
        setTextoEnviadoAoVLibras(cleanCurrent)
        setVlibrasBuffer('')
        timerRef.current = null
      }, 1000) // 1 segundo
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [textoSimplificado, textoEnviadoAoVLibras])

  const textoExibido = textoBase || 'Aguardando fala...'

  const statusLegenda = temErro
    ? 'Erro na transcrição'
    : traducaoFinal
      ? 'Legenda final'
      : textoBase
        ? 'Legenda ao vivo'
        : 'Pronto para ouvir'

  const avatarStatus = vlibrasStatus === 'ready'
    ? (textoEnviadoAoVLibras ? 'Traduzindo...' : 'Aguardando')
    : vlibrasStatus === 'loading'
      ? 'Carregando avatar...'
      : vlibrasStatus === 'error'
        ? 'Erro no avatar'
        : 'Iniciando...'

  const captionStatusClass = conectado ? 'text-[#82E3FF]' : 'text-[#53B8FF]'

  return (
    <main className="relative min-h-screen w-screen overflow-hidden bg-black text-[#F2F6FF] font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(83,184,255,0.20),transparent_22rem),radial-gradient(circle_at_82%_28%,rgba(47,123,255,0.16),transparent_24rem),linear-gradient(180deg,#000000_0%,#020B2B_56%,#000000_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(130,227,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(83,184,255,0.035)_1px,transparent_1px)] bg-[length:72px_72px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.7),transparent_76%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#145DFF]/10 shadow-[0_0_120px_rgba(20,93,255,0.14)]" />

      <VLibras
        text={textoEnviadoAoVLibras}
        onStatusChange={setVLibrasStatus}
      />

      <header
        className={`absolute left-4 right-4 top-4 z-30 flex-col gap-3 sm:left-8 sm:right-8 sm:top-5 lg:flex-row lg:items-center lg:justify-between transition-opacity duration-500 ${
          modoProjetor ? 'hidden opacity-0 pointer-events-none' : 'flex opacity-100'
        }`}
        aria-label="Status da aplicação"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-[#82E3FF]/60 bg-[linear-gradient(145deg,rgba(20,93,255,0.78),rgba(83,184,255,0.2))] text-sm font-black text-[#F2F6FF] shadow-[0_14px_36px_rgba(47,123,255,0.2)] sm:h-[42px] sm:w-[42px]">
            DL
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-base font-black leading-none tracking-normal sm:text-lg">
              DualLibras.AI
            </h1>
            <p className="mt-1.5 text-xs font-bold text-[#B7C8EF]">
              Transcrição em tempo real para Libras
            </p>
          </div>
        </div>

        {/* CONTROLES DE ÁUDIO E STATUS */}
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {/* Seletor de Microfone */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#82E3FF]/20 bg-[#031A5C]/40 px-2.5 py-1 text-xs">
            <Volume2 className="w-3.5 h-3.5 text-[#82E3FF]" />
            <select
              value={selectedDevice}
              onChange={(e) => {
                setSelectedDevice(e.target.value)
                if (capturing) {
                  pararCaptura().then(() => iniciarCaptura())
                }
              }}
              className="bg-transparent text-[#F2F6FF] border-none outline-none font-bold cursor-pointer max-w-[120px] sm:max-w-[180px]"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId} className="bg-black text-[#F2F6FF]">
                  {d.label || `Microfone (${d.deviceId.substring(0, 5)})`}
                </option>
              ))}
            </select>
          </div>

          {/* Botão de captura */}
          <button
            onClick={capturing ? pararCaptura : iniciarCaptura}
            className={`flex min-h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              capturing
                ? 'bg-red-500/25 border border-red-500/55 text-red-300 hover:bg-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                : 'bg-green-500/20 border border-green-500/45 text-green-300 hover:bg-green-500/35 shadow-[0_0_12px_rgba(34,197,94,0.25)]'
            }`}
          >
            {capturing ? (
              <>
                <MicOff className="w-3.5 h-3.5 animate-pulse" /> Desativar Microfone
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" /> Ativar Microfone
              </>
            )}
          </button>

          {/* Medidor de Áudio Visual */}
          {capturing && (
            <div className="flex items-center gap-1 rounded-lg border border-[#82E3FF]/10 bg-black/40 px-2 py-2 h-[34px]">
              <span className="text-[10px] text-[#B7C8EF] font-bold">Nível:</span>
              <div className="w-16 bg-[#031A5C] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#82E3FF] to-green-400 h-full transition-all duration-75"
                  style={{ width: `${Math.min(100, (audioLevel / 120) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Indicador de Fala / Filtro VAD */}
          <button
            onClick={() => setUseVadGating(!useVadGating)}
            className={`flex min-h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all duration-300 ${
              useVadGating
                ? speaking
                  ? 'border-[#82E3FF]/60 bg-[#82E3FF]/20 text-[#82E3FF] shadow-[0_0_12px_rgba(130,227,255,0.45)]'
                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10'
                : 'border-green-500/40 bg-green-500/20 text-green-300 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
            }`}
            title={useVadGating ? "Filtro de Silêncio Ativo (Clique para desativar e enviar áudio contínuo)" : "Envio de Áudio Contínuo (Clique para ativar filtro de silêncio)"}
          >
            <span className={`h-2 w-2 rounded-full ${useVadGating ? (speaking ? 'bg-[#82E3FF] animate-ping' : 'bg-white/20') : 'bg-green-400'}`} />
            {useVadGating ? (speaking ? 'Falando' : 'Silêncio') : 'Fluxo Contínuo'}
          </button>

          {/* Indicador de Latência */}
          {capturing && (
            <span
              className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                latencyAlert
                  ? 'border-orange-500/50 bg-orange-500/15 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
                  : 'border-green-500/30 bg-green-500/10 text-green-300'
              }`}
            >
              {latencyAlert && <AlertTriangle className="w-3.5 h-3.5" />}
              {latencyMs > 0 ? `${latencyMs}ms` : '-- ms'}
            </span>
          )}

          {/* Modo de Conexão */}
          <span className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg border border-[#82E3FF]/20 bg-[#031A5C]/60 px-3 py-1.5 text-xs font-bold text-[#F2F6FF]">
            {connectionMode === 'assemblyai' ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-[#82E3FF]" /> AssemblyAI
              </>
            ) : connectionMode === 'local' ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-yellow-400" /> Local Fallback
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" /> Desconectado
              </>
            )}
          </span>

          <button
            onClick={() => setModoProjetor(true)}
            className="flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#F2F6FF]/30 bg-transparent px-3 py-2 text-xs font-bold text-[#F2F6FF] transition-all hover:bg-white/10 sm:min-h-[34px]"
          >
            <Maximize className="w-4 h-4" /> Modo Foco
          </button>

          <button
            onClick={() => {
              setShowPanel(true)
              carregarHistoricoSalvo()
            }}
            className="flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#82E3FF]/30 bg-[#145DFF]/20 px-3 py-2 text-xs font-bold text-[#82E3FF] transition-all hover:bg-[#145DFF]/40 sm:min-h-[34px]"
          >
            <FolderOpen className="w-4 h-4" /> Histórico
          </button>
        </div>
      </header>

      {/* Erros amigáveis de áudio */}
      {audioError && (
        <div className="absolute left-1/2 top-24 z-40 -translate-x-1/2 w-[90vw] max-w-[500px] rounded-lg border border-red-500/40 bg-red-950/90 p-4 shadow-xl backdrop-blur-md">
          <div className="flex gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-red-300">Erro no Microfone</h4>
              <p className="mt-1 text-xs text-red-200">{audioError}</p>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL LATERAL DE HISTÓRICO */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(90vw,440px)] flex-col border-l border-[#82E3FF]/20 bg-[#020B2B]/95 p-6 shadow-[0_0_50px_rgba(20,93,255,0.25)] backdrop-blur-md transition-transform duration-300 ${
          showPanel ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#82E3FF]/20 pb-4">
          <h2 className="text-lg font-black text-[#F2F6FF]">Gerenciador de Aulas</h2>
          <button
            onClick={() => setShowPanel(false)}
            className="cursor-pointer text-sm font-bold text-[#B7C8EF] hover:text-[#82E3FF]"
          >
            Fechar ✕
          </button>
        </div>

        {/* SEÇÃO SALVAR AULA */}
        <div className="mt-6 border-b border-[#82E3FF]/10 pb-6">
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#82E3FF]">Salvar Transcrição Atual</h3>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título da Aula"
              className="w-full rounded-lg border border-[#82E3FF]/25 bg-black/40 px-3 py-2 text-sm text-[#F2F6FF] outline-none focus:border-[#82E3FF] focus:shadow-[0_0_8px_rgba(130,227,255,0.4)]"
            />
            <div className="flex gap-2">
              <button
                onClick={salvarAula}
                disabled={isSaving}
                className="flex flex-1 items-center justify-center gap-2 cursor-pointer rounded-lg bg-gradient-to-r from-[#145DFF] to-[#82E3FF] py-2 text-xs font-black text-black hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar Aula</>}
              </button>
              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja limpar a transcrição atual?')) {
                    transcriptSocket.clearTranscriptCache()
                    setTexto('')
                    setTextoFinal('')
                    setHistoricoTick(t => t + 1)
                  }
                }}
                className="cursor-pointer rounded-lg border border-[#2F7BFF]/30 bg-[#2F7BFF]/10 px-3 py-2 text-xs font-bold text-[#B7C8EF] hover:bg-[#2F7BFF]/20"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>

        {/* SEÇÃO LISTA HISTÓRICO */}
        <div className="mt-6 flex flex-1 flex-col overflow-hidden mb-24">
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#82E3FF]">Histórico de Arquivos</h3>

          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {savedGroups.length === 0 ? (
              <p className="text-xs text-[#B7C8EF] italic">Nenhuma aula salva no servidor.</p>
            ) : (
              savedGroups.map(group => (
                <div key={group.id} className="rounded-lg border border-[#82E3FF]/10 bg-black/20 p-3 flex flex-col gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#F2F6FF]">
                      {group.pdf ? group.pdf.replace('transcricao_', '').replace('.pdf', '') : group.id}
                    </span>
                    <span className="text-[10px] text-[#B7C8EF]">{group.dateStr}</span>
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    {group.pdf && (
                      <a
                        href={`${API_BASE}/transcripts/download/${group.pdf}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded bg-[#82E3FF]/10 border border-[#82E3FF]/30 px-2 py-1 text-[10px] font-bold text-[#82E3FF] hover:bg-[#82E3FF]/20"
                      >
                        <FileText className="w-3 h-3" /> PDF
                      </a>
                    )}
                    {group.txt && (
                      <a
                        href={`${API_BASE}/transcripts/download/${group.txt}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded bg-[#2F7BFF]/10 border border-[#2F7BFF]/30 px-2 py-1 text-[10px] font-bold text-[#53B8FF] hover:bg-[#2F7BFF]/20"
                      >
                        <FileCode className="w-3 h-3" /> TXT
                      </a>
                    )}
                    {group.json && (
                      <a
                        href={`${API_BASE}/transcripts/download/${group.json}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-[10px] font-bold text-[#B7C8EF] hover:bg-gray-700"
                      >
                        <SettingsIcon className="w-3 h-3" /> JSON
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SEÇÃO GERAR DOCUMENTO PROJETO */}
        <div className="absolute bottom-6 left-6 right-6 border-t border-[#82E3FF]/10 pt-4">
          <button
            onClick={gerarDocumentacao}
            disabled={docGenerating}
            className="flex w-full items-center justify-center gap-2 cursor-pointer rounded-lg border border-[#82E3FF]/30 bg-transparent py-2.5 text-xs font-extrabold text-[#82E3FF] hover:bg-[#82E3FF]/10"
          >
            {docGenerating ? 'Gerando Documentação...' : <><FileDown className="w-4 h-4" /> Gerar PDF de Documentação</>}
          </button>
          {docPath && (
            <div className="mt-2 text-center">
              <a
                href={`${API_BASE}/documentation/download`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-bold text-green-300 hover:underline"
              >
                <Download className="w-3 h-3" /> Baixar Documentação Completa
              </a>
            </div>
          )}
        </div>
      </div>

      {/* BOTÃO SAIR DO MODO FOCO */}
      {modoProjetor && (
        <button
          onClick={() => setModoProjetor(false)}
          className="absolute top-4 right-4 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md transition-all hover:bg-white/20 hover:scale-105"
        >
          <Minimize className="w-4 h-4" /> Sair do Modo Foco
        </button>
      )}

      {/* CORES DINÂMICAS E CAIXA DE LEGENDA */}
      {(() => {
        const isAluno = activeSpeaker.toLowerCase().includes('aluno') || activeSpeaker.toLowerCase().includes('speaker')
        const colorBorder = isAluno ? 'border-[#FFB042]/50' : 'border-[#82E3FF]/40'
        const colorShadow = isAluno ? 'shadow-[0_24px_80px_rgba(43,11,2,0.76),0_0_0_1px_rgba(255,176,66,0.15)]' : 'shadow-[0_24px_80px_rgba(2,11,43,0.76),0_0_0_1px_rgba(83,184,255,0.15)]'
        const colorText = isAluno ? 'text-[#FFB042]' : 'text-[#82E3FF]'
        const bgColor = isAluno ? 'bg-[linear-gradient(180deg,rgba(43,11,2,0.80),rgba(2,11,43,0.92))]' : 'bg-[linear-gradient(180deg,rgba(3,26,92,0.80),rgba(2,11,43,0.92))]'

        return (
          <section
            className={`absolute bottom-5 left-1/2 z-20 flex w-[min(92vw,960px)] -translate-x-1/2 items-end justify-center transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              modoProjetor ? 'bottom-[10vh] scale-105' : 'sm:bottom-[clamp(28px,8vh,84px)]'
            }`}
            aria-label="Legenda da transcrição"
          >
            <div className={`z-10 w-full overflow-hidden rounded-lg border ${colorBorder} ${bgColor} ${colorShadow} backdrop-blur-md transition-all duration-500`}>
              <div
                className={`flex flex-col items-center justify-between gap-1 border-b ${isAluno ? 'border-[#FFB042]/20' : 'border-[#82E3FF]/15'} px-4 py-2 text-xs font-extrabold uppercase tracking-normal text-[#B7C8EF] sm:flex-row sm:gap-3 sm:px-[clamp(16px,3vw,28px)]`}
                aria-hidden="true"
              >
                <span className="flex items-center gap-2">
                  {textoBase && (
                    <span className="flex h-3 w-3 items-center justify-center">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isAluno ? 'bg-[#FFB042]' : 'bg-[#82E3FF]'}`}></span>
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${isAluno ? 'bg-[#FFB042]' : 'bg-[#82E3FF]'}`}></span>
                    </span>
                  )}
                  {statusLegenda} • <span className={colorText}>{activeSpeaker}</span>
                </span>
                <span className={captionStatusClass}>
                  {conectado ? avatarStatus : 'Sem conexão'}
                </span>
              </div>

              <div className="min-h-[100px] w-full px-5 py-4 text-center sm:min-h-[130px] sm:px-[clamp(18px,4vw,40px)] sm:pb-5 sm:pt-[18px]">
                <p
                  id={CONTENT_ID}
                  key={textoExibido}
                  className={`m-0 line-clamp-4 overflow-hidden text-[clamp(1.25rem,2.8vw,2.3rem)] font-extrabold leading-[1.32] text-balance outline-none animate-text-reveal sm:line-clamp-3 ${
                    temErro
                      ? 'text-[#82E3FF]'
                      : textoBase
                        ? 'text-[#F2F6FF] drop-shadow-[0_2px_12px_rgba(2,11,43,0.84)]'
                        : 'text-[#B7C8EF]'
                  }`}
                  data-vlibras-text
                  tabIndex={-1}
                  lang="pt-BR"
                  aria-live="polite"
                >
                  {textoExibido}
                </p>
              </div>
            </div>
          </section>
        )
      })()}
    </main>
  )
}

export default App
