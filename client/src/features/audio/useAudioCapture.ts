import { useEffect, useRef, useState } from 'react'
import { WS_URL } from '../../config/backend'
import { parseTranscriptMessage, type TranscriptMessage } from '../../services/websocket'

type ConnectionMode = 'assemblyai' | 'local' | 'offline'

type UseAudioCaptureOptions = {
  onTranscript: (message: TranscriptMessage) => void
}

export function useAudioCapture({ onTranscript }: UseAudioCaptureOptions) {
  const [conectado, setConectado] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [capturing, setCapturing] = useState(false)
  const [audioError, setAudioError] = useState<string>('')
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [speaking, setSpeaking] = useState(false)
  const [latencyMs, setLatencyMs] = useState<number>(0)
  const [latencyAlert, setLatencyAlert] = useState(false)
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('offline')
  const [useVadGating, setUseVadGating] = useState<boolean>(true)

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
  const useVadGatingRef = useRef<boolean>(true)
  const reconnectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    useVadGatingRef.current = useVadGating
    if (!useVadGating) {
      speakingRef.current = true
      setSpeaking(true)
    } else {
      speakingRef.current = speaking
    }
  }, [useVadGating, speaking])

  const handleTranscriptPayload = (payload: unknown) => {
    const message = parseTranscriptMessage(payload)
    const rtt = Date.now() - lastSendTimeRef.current
    setLatencyMs(rtt)
    setLatencyAlert(rtt > 500)
    onTranscript(message)
  }

  const negociarWebRTC = async () => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      rtcPcRef.current = pc

      const dc = pc.createDataChannel('audio', { ordered: false, maxRetransmits: 0 })
      rtcDcRef.current = dc

      dc.onopen = () => {
        console.log('[WebRTC] Data Channel aberto com sucesso!')
      }

      dc.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'transcript') {
            handleTranscriptPayload(data)
          }
        } catch (error) {
          console.error('[WebRTC] Erro no parsing de dados:', error)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve()
          return
        }

        const checkState = () => {
          console.log('[WebRTC] ICE Gathering State:', pc.iceGatheringState)
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState)
            resolve()
          }
        }

        pc.addEventListener('icegatheringstatechange', checkState)
        window.setTimeout(() => {
          pc.removeEventListener('icegatheringstatechange', checkState)
          resolve()
        }, 5000)
      })

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'webrtc_offer',
            sdp: pc.localDescription?.sdp || offer.sdp,
          }),
        )
      }
    } catch (error) {
      console.error('[WebRTC] Erro na negociação:', error)
    }
  }

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
              }),
            )
          }
        } else if (data.type === 'status') {
          setConnectionMode(data.mode || 'assemblyai')
        } else if (data.type === 'transcript') {
          handleTranscriptPayload(data)
        }
      } catch (error) {
        console.error('[WebSocket] Erro ao parsear mensagem:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] Erro:', error)
    }

    ws.onclose = () => {
      console.warn('[WebSocket] Conexão fechada. Reconectando em 2s...')
      setConectado(false)
      setConnectionMode('offline')

      if (rtcPcRef.current) {
        rtcPcRef.current.close()
        rtcPcRef.current = null
      }
      rtcDcRef.current = null

      reconnectTimerRef.current = window.setTimeout(conectarSocket, 2000)
    }
  }

  const carregarDispositivos = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const devs = await navigator.mediaDevices.enumerateDevices()
      const audioDevs = devs.filter((device) => device.kind === 'audioinput')
      setDevices(audioDevs)
      if (audioDevs.length > 0) {
        setSelectedDevice(audioDevs[0].deviceId)
      }
    } catch (error) {
      console.warn('Erro ao obter permissão inicial ou listar dispositivos:', error)
      navigator.mediaDevices.enumerateDevices()
        .then((devs) => {
          const audioDevs = devs.filter((device) => device.kind === 'audioinput')
          setDevices(audioDevs)
        })
        .catch((enumerateError) => {
          console.error('Erro geral ao enumerar dispositivos:', enumerateError)
        })
    }
  }

  const iniciarCaptura = async () => {
    try {
      setAudioError('')
      conectarSocket()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0.01,
        } as MediaTrackConstraints,
      })
      streamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = ctx

      // Faltam tipos completos no simple-rnnoise-wasm
      const { RNNoiseNode, rnnoise_loadAssets } = await import('simple-rnnoise-wasm')
      const assets = await rnnoise_loadAssets({
        scriptSrc: '/rnnoise.worklet.js',
        moduleSrc: '/rnnoise.wasm',
      })
      await RNNoiseNode.register(ctx, assets)

      await ctx.audioWorklet.addModule('/pcm-encoder-worklet.js')

      const source = ctx.createMediaStreamSource(stream)
      const rnnoiseNode = new RNNoiseNode(ctx)
      rnnoiseNodeRef.current = rnnoiseNode

      const encoderNode = new AudioWorkletNode(ctx, 'pcm-encoder')
      encoderNodeRef.current = encoderNode

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser

      source.connect(rnnoiseNode)
      rnnoiseNode.connect(encoderNode)
      rnnoiseNode.connect(analyser)
      encoderNode.connect(ctx.destination)

      encoderNode.port.onmessage = (event) => {
        if (event.data.type !== 'audio') return

        const buffer = event.data.buffer
        if (!useVadGatingRef.current || speakingRef.current) {
          lastSendTimeRef.current = Date.now()

          if (rtcDcRef.current && rtcDcRef.current.readyState === 'open') {
            rtcDcRef.current.send(buffer)
          } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(buffer)
          }
        }
      }

      try {
        const dest = ctx.createMediaStreamDestination()
        rnnoiseNode.connect(dest)

        const { MicVAD } = await import('@ricky0123/vad-web')
        const myvad = await MicVAD.new({
          audioContext: ctx,
          getStream: () => Promise.resolve(dest.stream),
          baseAssetPath: '/',
          onnxWASMBasePath: '/',
          positiveSpeechThreshold: 0.35,
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
      } catch (vadError) {
        console.warn('VAD falhou ao iniciar. Usando envio contínuo como fallback.', vadError)
        setSpeaking(true)
        speakingRef.current = true
      }

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      const updateLevel = () => {
        if (!analyserRef.current || !streamRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let index = 0; index < bufferLength; index += 1) {
          sum += dataArray[index]
        }
        setAudioLevel(sum / bufferLength)
        requestAnimationFrame(updateLevel)
      }
      updateLevel()

      setCapturing(true)
    } catch (error: any) {
      console.error('Falha ao iniciar captura de áudio:', error)
      if (error.name === 'NotAllowedError' || error.message?.includes('Permission denied')) {
        setAudioError('Permissão negada. Conceda acesso ao microfone nas configurações do navegador.')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setAudioError('Microfone não encontrado. Conecte um dispositivo de entrada.')
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setAudioError('Microfone ocupado por outra aplicação.')
      } else {
        setAudioError(`Erro no áudio: ${error.message || error.name}`)
      }
    }
  }

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
      streamRef.current.getTracks().forEach((track) => track.stop())
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

  useEffect(() => {
    carregarDispositivos()
  }, [])

  useEffect(() => {
    conectarSocket()
    return () => {
      pararCaptura()
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const selectDevice = (deviceId: string) => {
    setSelectedDevice(deviceId)
    if (capturing) {
      pararCaptura().then(() => iniciarCaptura())
    }
  }

  return {
    conectado,
    devices,
    selectedDevice,
    setSelectedDevice: selectDevice,
    capturing,
    audioError,
    audioLevel,
    speaking,
    latencyMs,
    latencyAlert,
    connectionMode,
    useVadGating,
    setUseVadGating,
    iniciarCaptura,
    pararCaptura,
  }
}
