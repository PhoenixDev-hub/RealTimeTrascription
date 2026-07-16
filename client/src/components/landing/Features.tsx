import { Accessibility, Bot, Mic } from 'lucide-react'

const features = [
  {
    icon: Mic,
    title: 'Captura de Áudio',
    desc: 'Microfone do professor capturado com VAD robusto, filtrando ruídos de sala de aula.'
  },
  {
    icon: Bot,
    title: 'Transcrição IA',
    desc: 'Modelos de ponta (u3-rt-pro + fallback Whisper) otimizados para português.'
  },
  {
    icon: Accessibility,
    title: 'Tradução para Libras',
    desc: 'Integração com VLibras para exibir um avatar animado em tempo real.'
  }
]

export const Features = () => {
  return (
    <section id="tecnologia" className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-primary">Como Funciona?</h2>
          <p className="text-gray-500 mt-2">Três passos simples para uma sala de aula inclusiva</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <div key={i} className="bg-light p-8 rounded-2xl shadow-md hover:shadow-xl transition text-center border border-gray-100">
              <div className="text-5xl mb-4 text-secondary mx-auto">
                <f.icon size={48} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-primary">{f.title}</h3>
              <p className="text-gray-600 mt-2">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
