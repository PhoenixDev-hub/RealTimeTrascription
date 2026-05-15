import { useEffect, useState } from 'react'
import VLibras from './components/VLibras'
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
  const textoExibido = textoParaLibras || 'Aguardando fala...'
  const statusLegenda = temErro
    ? 'Erro na transcrição'
    : traducaoFinal
      ? 'Legenda final'
      : textoParaLibras
        ? 'Legenda ao vivo'
        : 'Pronto para ouvir'

  return (
    <main className="app-shell">
      <VLibras text={textoParaLibras} targetId={CONTENT_ID} />

      <section className="status-panel" aria-label="Status da transcrição">
        <div className="status-line">
          <span
            className="status-dot"
            data-connected={conectado}
          />
          {conectado ? 'Backend conectado' : 'Aguardando backend'}
          <span className="status-separator">|</span>
          {temErro ? 'Erro' : traducaoFinal ? 'Texto final' : 'Texto parcial'}
        </div>
      </section>

      <section
        className="caption-area"
        aria-label="Legenda da transcrição"
        data-connected={conectado}
        data-final={traducaoFinal}
      >
        <div className="caption-frame">
          <div className="caption-header" aria-hidden="true">
            <span>{statusLegenda}</span>
            <span>{conectado ? 'Enviando para Libras' : 'Sem conexão'}</span>
          </div>

          <p
            id={CONTENT_ID}
            className="caption-text"
            data-error={temErro}
            data-empty={!textoParaLibras}
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
