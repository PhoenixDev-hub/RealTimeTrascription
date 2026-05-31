import { useEffect, useState } from 'react'
import VLibras from './components/VLibras'
import simplifyText from './services/simplify'
import transcriptSocket from './services/websocket'

const CONTENT_ID = 'conteudo-libras'

function App() {
  const [texto, setTexto] = useState('')
  const [textoFinal, setTextoFinal] = useState('')
  const [conectado, setConectado] = useState(false)
  const [traducaoFinal, setTraducaoFinal] = useState(false)
  const [temErro, setTemErro] = useState(false)

  useEffect(() => {
    const unsubscribeTranscript = transcriptSocket.onTranscript((message) => {
      setTexto(message.text)
      setTraducaoFinal(message.isFinal)
      setTemErro(message.error)

      if (message.isFinal && !message.error) {
        setTextoFinal(message.text)
      }
    })

    const unsubscribeStatus = transcriptSocket.onStatus(setConectado)

    return () => {
      unsubscribeTranscript()
      unsubscribeStatus()
    }
  }, [])

  const textoParaLibras = (texto || textoFinal).trim()
  const textoParaLibrasSimplificado = simplifyText(textoParaLibras)
  const textoExibido = textoParaLibras || 'Aguardando fala...'
  const statusLegenda = temErro
    ? 'Erro na transcrição'
    : traducaoFinal
      ? 'Legenda final'
      : textoParaLibras
        ? 'Legenda ao vivo'
        : 'Pronto para ouvir'

  const textoDoAvatar = traducaoFinal && !temErro ? textoParaLibrasSimplificado : ''
  const avatarStatus = traducaoFinal && !temErro ? 'Avatar em fila' : 'Avatar aguardando'
  const statusDotClass = conectado
    ? 'bg-[#82E3FF] shadow-[0_0_18px_rgba(130,227,255,0.76)]'
    : 'bg-[#2F7BFF] shadow-[0_0_14px_rgba(47,123,255,0.7)]'
  const captionStatusClass = conectado ? 'text-[#82E3FF]' : 'text-[#53B8FF]'

  return (
    <main className="relative min-h-screen w-screen overflow-hidden bg-black text-[#F2F6FF] font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(83,184,255,0.20),transparent_22rem),radial-gradient(circle_at_82%_28%,rgba(47,123,255,0.16),transparent_24rem),linear-gradient(180deg,#000000_0%,#020B2B_56%,#000000_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(130,227,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(83,184,255,0.035)_1px,transparent_1px)] bg-[length:72px_72px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.7),transparent_76%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#145DFF]/10 shadow-[0_0_120px_rgba(20,93,255,0.14)]" />

      <VLibras text={textoDoAvatar} />

      <header
        className="absolute left-4 right-4 top-4 z-30 flex flex-col gap-3 sm:left-8 sm:right-8 sm:top-5 lg:flex-row lg:items-center lg:justify-between"
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
          <span className="flex min-h-8 max-w-full items-center justify-center gap-2 rounded-lg border border-[#82E3FF]/20 bg-[#031A5C]/60 px-3 py-2 text-xs font-bold text-[#F2F6FF] shadow-[0_18px_48px_rgba(2,11,43,0.42)] backdrop-blur-md sm:min-h-[34px]">
            <span
              className={`h-2.5 w-2.5 flex-none rounded-full ${statusDotClass}`}
            />
            {conectado ? 'Backend conectado' : 'Aguardando backend'}
          </span>
          <span className="flex min-h-8 max-w-full items-center justify-center rounded-lg border border-[#82E3FF]/20 bg-[#031A5C]/60 px-3 py-2 text-xs font-bold text-[#F2F6FF] shadow-[0_18px_48px_rgba(2,11,43,0.42)] backdrop-blur-md sm:min-h-[34px]">
            {temErro ? 'Erro' : traducaoFinal ? 'Texto final' : 'Texto parcial'}
          </span>
          <span className="flex min-h-8 max-w-full items-center justify-center rounded-lg border border-[#53B8FF]/50 bg-[#145DFF]/25 px-3 py-2 text-xs font-bold text-[#82E3FF] shadow-[0_18px_48px_rgba(2,11,43,0.42)] backdrop-blur-md sm:min-h-[34px]">
            Velocidade alta
          </span>
        </div>
      </header>

      <section
        className="absolute bottom-5 left-1/2 z-20 flex min-h-[136px] w-[min(92vw,960px)] -translate-x-1/2 items-end justify-center sm:bottom-[clamp(28px,8vh,84px)] sm:min-h-[clamp(120px,20vh,188px)]"
        aria-label="Legenda da transcrição"
      >
        <div className="w-full overflow-hidden rounded-lg border border-[#82E3FF]/25 bg-[linear-gradient(180deg,rgba(3,26,92,0.80),rgba(2,11,43,0.92))] shadow-[0_24px_80px_rgba(2,11,43,0.76),0_0_0_1px_rgba(83,184,255,0.08)] backdrop-blur-md">
          <div
            className="flex flex-col items-center justify-between gap-1 border-b border-[#82E3FF]/15 px-4 py-2 text-xs font-extrabold uppercase tracking-normal text-[#B7C8EF] sm:flex-row sm:gap-3 sm:px-[clamp(16px,3vw,28px)]"
            aria-hidden="true"
          >
            <span>{statusLegenda}</span>
            <span className={captionStatusClass}>
              {conectado ? avatarStatus : 'Sem conexão'}
            </span>
          </div>

          <p
            id={CONTENT_ID}
            className={`m-0 line-clamp-4 w-full overflow-hidden px-5 py-4 text-center text-[clamp(1.25rem,2.8vw,2.3rem)] font-extrabold leading-[1.32] text-balance outline-none transition-colors sm:line-clamp-3 sm:px-[clamp(18px,4vw,40px)] sm:pb-5 sm:pt-[18px] ${
              temErro
                ? 'text-[#82E3FF]'
                : textoParaLibras
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
      </section>
    </main>
  )
}

export default App
