import { Info, Play } from 'lucide-react'
import { Button } from '../common/Button'

export const Hero = () => {
  return (
    <section className="pt-32 pb-20 bg-gradient-to-br from-light to-blue-50">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center gap-12">
        <div className="flex-1 text-center md:text-left">
          <span className="inline-block bg-secondary/10 text-secondary font-semibold px-4 py-1 rounded-full text-sm mb-4">
            Tecnologia para Inclusão
          </span>
          <h1 className="text-4xl md:text-6xl font-bold text-primary leading-tight">
            Transcrição em tempo real <br />
            <span className="text-secondary">traduzida para Libras</span>
          </h1>
          <p className="text-gray-600 text-lg mt-6 max-w-2xl">
            Quebrando barreiras na educação. Nossa IA captura a voz do professor, transcreve e traduz
            instantaneamente para Libras, garantindo acessibilidade para alunos surdos.
          </p>
          <div className="flex flex-wrap gap-4 mt-8 justify-center md:justify-start">
            <Button variant="primary" className="text-lg px-8 py-4">
              <Play size={20} /> Começar Agora
            </Button>
            <Button variant="outline" className="text-lg px-8 py-4">
              <Info size={20} /> Saiba Mais
            </Button>
          </div>
        </div>

        {/* Ilustração / Avatar VLibras simulado */}
        <div className="flex-1 flex justify-center">
          <div className="w-72 h-72 bg-gradient-to-br from-secondary to-primary rounded-3xl flex items-center justify-center shadow-2xl">
            <div className="text-white text-center">
              <span className="font-bold text-xl">Libras em Ação</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
