import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Maximize,
  FolderOpen,
  Minimize,
  Mic,
  MicOff,
  AlertTriangle,
  Wifi,
  WifiOff,
  Volume2
} from 'lucide-react'
import VLibras from './components/VLibras'
import { useAudioCapture } from './features/audio/useAudioCapture'
import { HistoryPanel } from './features/history/HistoryPanel'
import { useTranscriptHistory } from './features/history/useTranscriptHistory'
import simplifyText from './services/simplify'
import transcriptSocket, { type TranscriptMessage } from './services/websocket'

const CONTENT_ID = 'conteudo-libras'

function App() {
  const [texto, setTexto] = useState('')
  const [textoFinal, setTextoFinal] = useState('')
  const [traducaoFinal, setTraducaoFinal] = useState(false)
  const [temErro, setTemErro] = useState(false)
  const [vlibrasStatus, setVLibrasStatus] = useState<'idle' | 'loading' | 'translating' | 'error' | 'ready'>('loading')
  const [historicoTick, setHistoricoTick] = useState(0)
  const [activeSpeaker, setActiveSpeaker] = useState('Professor')
  const [modoProjetor, setModoProjetor] = useState(false)

  useEffect(() => {
    console.debug('[App] Histórico atualizado, tick:', historicoTick)
  }, [historicoTick])

  const handleTranscript = (message: TranscriptMessage) => {
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

  const {
    conectado,
    devices,
    selectedDevice,
    setSelectedDevice,
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
  } = useAudioCapture({ onTranscript: handleTranscript })

  const {
    showPanel,
    setShowPanel,
    isSaving,
    titulo,
    setTitulo,
    savedGroups,
    docGenerating,
    docPath,
    abrirPainel,
    salvarAula,
    limparTranscricaoAtual,
    gerarDocumentacao,
  } = useTranscriptHistory({
    onClearCurrentTranscript: () => {
      setTexto('')
      setTextoFinal('')
      setHistoricoTick((tick) => tick + 1)
    },
  })

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
              onChange={(e) => setSelectedDevice(e.target.value)}
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
            onClick={abrirPainel}
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

      <HistoryPanel
        showPanel={showPanel}
        setShowPanel={setShowPanel}
        titulo={titulo}
        setTitulo={setTitulo}
        isSaving={isSaving}
        savedGroups={savedGroups}
        docGenerating={docGenerating}
        docPath={docPath}
        salvarAula={salvarAula}
        limparTranscricaoAtual={limparTranscricaoAtual}
        gerarDocumentacao={gerarDocumentacao}
      />

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
