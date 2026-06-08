import { useEffect, useMemo, useState } from 'react'
import {
  Maximize,
  FolderOpen,
  Minimize,
  Save,
  FileText,
  FileCode,
  Settings as SettingsIcon,
  FileDown,
  Download
} from 'lucide-react'
import VLibras from './components/VLibras'
import simplifyText from './services/simplify'
import transcriptSocket from './services/websocket'

const CONTENT_ID = 'conteudo-libras'

const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST ?? 'localhost'
const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT ?? '5455'
const API_BASE = import.meta.env.VITE_BACKEND_HTTP_URL ?? `http://${BACKEND_HOST}:${BACKEND_PORT}`

type SavedGroup = {
  id: string
  dateStr: string
  pdf?: string
  txt?: string
  json?: string
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
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
    console.debug('[App] Historico atualizado, tick:', historicoTick)
  }, [historicoTick])

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

  useEffect(() => {
    const unsubscribeTranscript = transcriptSocket.onTranscript((message) => {
      setTexto(message.text)
      setTraducaoFinal(message.isFinal)
      setTemErro(message.error)

      if (message.speaker) {
        setActiveSpeaker(message.speaker)
      }

      if (message.isFinal && !message.error) {
        setTextoFinal(message.text)
        setHistoricoTick((tick) => tick + 1)
      }
    })

    const unsubscribeStatus = transcriptSocket.onStatus((status) => {
      setConectado(status)
      if (status) {
        window.setTimeout(() => carregarHistoricoSalvo(), 0)
      }
    })

    window.setTimeout(() => carregarHistoricoSalvo(), 0)

    return () => {
      unsubscribeTranscript()
      unsubscribeStatus()
    }
  }, [])

  const textoBase = useMemo(() => {
    const raw = (texto || textoFinal).trim()
    return temErro ? '' : raw
  }, [texto, textoFinal, temErro])

  const textoSimplificado = useMemo(() => {
    if (!textoBase) return ''
    return simplifyText(textoBase)
  }, [textoBase])

  const textoParaAvatar = useDebouncedValue(textoSimplificado, 700)

  const textoExibido = textoBase || 'Aguardando fala...'

  const statusLegenda = temErro
    ? 'Erro na transcrição'
    : traducaoFinal
      ? 'Legenda final'
      : textoBase
        ? 'Legenda ao vivo'
        : 'Pronto para ouvir'

  const avatarStatus = vlibrasStatus === 'ready'
    ? (textoParaAvatar ? 'Traduzindo...' : 'Aguardando')
    : vlibrasStatus === 'loading'
      ? 'Carregando avatar...'
      : vlibrasStatus === 'error'
        ? 'Erro no avatar'
        : 'Iniciando...'

  const statusDotClass = conectado
    ? 'bg-[#82E3FF] shadow-[0_0_18px_rgba(130,227,255,0.76)]'
    : 'bg-[#2F7BFF] shadow-[0_0_14px_rgba(47,123,255,0.7)]'
  const captionStatusClass = conectado ? 'text-[#82E3FF]' : 'text-[#53B8FF]'

  return (
    <main className="relative min-h-screen w-screen overflow-hidden bg-black text-[#F2F6FF] font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(83,184,255,0.20),transparent_22rem),radial-gradient(circle_at_82%_28%,rgba(47,123,255,0.16),transparent_24rem),linear-gradient(180deg,#000000_0%,#020B2B_56%,#000000_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(130,227,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(83,184,255,0.035)_1px,transparent_1px)] bg-[length:72px_72px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.7),transparent_76%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#145DFF]/10 shadow-[0_0_120px_rgba(20,93,255,0.14)]" />

      <VLibras
        text={textoParaAvatar}
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

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {/* BOTOES */}
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
            <FolderOpen className="w-4 h-4" /> Histórico de Aulas
          </button>

          <span className="flex min-h-8 max-w-full items-center justify-center gap-2 rounded-lg border border-[#82E3FF]/20 bg-[#031A5C]/60 px-3 py-2 text-xs font-bold text-[#F2F6FF] shadow-[0_18px_48px_rgba(2,11,43,0.42)] backdrop-blur-md sm:min-h-[34px]">
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${statusDotClass}`} />
            {conectado ? 'Backend conectado' : 'Aguardando backend'}
          </span>

          <span className={`flex min-h-8 max-w-full items-center justify-center rounded-lg border px-3 py-2 text-xs font-bold backdrop-blur-md sm:min-h-[34px] ${
            vlibrasStatus === 'error'
              ? 'border-red-500/30 bg-red-900/30 text-red-300'
              : vlibrasStatus === 'ready'
                ? 'border-green-500/30 bg-green-900/30 text-green-300'
                : 'border-[#82E3FF]/20 bg-[#031A5C]/60 text-[#F2F6FF]'
          }`}>
            {vlibrasStatus === 'loading' && 'Avatar'}
            {vlibrasStatus === 'ready' && 'Avatar pronto'}
            {vlibrasStatus === 'translating' && 'Traduzindo'}
            {vlibrasStatus === 'error' && 'Erro avatar'}
            {vlibrasStatus === 'idle' && 'Aguardando'}
          </span>

          <span className="flex min-h-8 max-w-full items-center justify-center rounded-lg border border-[#53B8FF]/50 bg-[#145DFF]/25 px-3 py-2 text-xs font-bold text-[#82E3FF] shadow-[0_18px_48px_rgba(2,11,43,0.42)] backdrop-blur-md sm:min-h-[34px]">
            VAD Ativo
          </span>
        </div>
      </header>

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

      {/* BOTÃO SAIR DO MODO FOCO (visível apenas no modo projetor) */}
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
