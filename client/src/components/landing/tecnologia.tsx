import {
  ArrowDown,
  ArrowRight,
  Atom,
  AudioLines,
  Braces,
  Cable,
  Container,
  Cpu,
  Globe,
  Hand,
  Layers,
  Mic,
  Palette,
  Radio,
  Rocket,
  Terminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useInView } from '../../hooks/useInView';

interface TechItem {
  icon: LucideIcon;
  label: string;
}

interface Category {
  title: string;
  icon: LucideIcon;
  items: TechItem[];
}

const categories: Category[] = [
  {
    title: 'Frontend',
    icon: Atom,
    items: [
      { icon: Atom, label: 'React 19' },
      { icon: Braces, label: 'TypeScript' },
      { icon: Zap, label: 'Vite' },
      { icon: Palette, label: 'Tailwind CSS 4' },
      { icon: Radio, label: 'WebRTC' },
      { icon: Hand, label: 'VLibras' },
    ],
  },
  {
    title: 'Backend',
    icon: Terminal,
    items: [
      { icon: Terminal, label: 'Python' },
      { icon: Rocket, label: 'FastAPI' },
      { icon: Cable, label: 'WebSockets' },
      { icon: Mic, label: 'AssemblyAI' },
      { icon: AudioLines, label: 'Faster Whisper' },
    ],
  },
  {
    title: 'Infraestrutura',
    icon: Container,
    items: [
      { icon: Container, label: 'Docker' },
      { icon: Layers, label: 'Docker Compose' },
      { icon: Globe, label: 'Nginx' },
    ],
  },
];

interface ArchNode {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

const archNodes: ArchNode[] = [
  { icon: Mic, title: 'Navegador', subtitle: 'Captura de áudio via WebRTC' },
  { icon: Cable, title: 'WebSocket', subtitle: 'Streaming em tempo real' },
  { icon: Cpu, title: 'Backend / IA', subtitle: 'Transcrição e processamento' },
  { icon: Hand, title: 'VLibras', subtitle: 'Renderização em Libras' },
];

export default function Tecnologias() {
  const [headerRef, headerInView] = useInView<HTMLDivElement>();
  const [cardsRef, cardsInView] = useInView<HTMLDivElement>({ threshold: 0.1 });
  const [archRef, archInView] = useInView<HTMLDivElement>({ threshold: 0.1 });

  return (
    <section id="tecnologias" className="relative bg-background-dark px-4 py-24 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-5xl mx-auto text-center">
        <div
          ref={headerRef}
          className={`transition-all duration-700 ease-out ${
            headerInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-logo text-xs uppercase tracking-[0.2em]">
            Tecnologias
          </span>

          <h2 className="font-ui font-extrabold tracking-tight leading-tight text-text-light text-3xl md:text-4xl lg:text-5xl">
            Construído com <span className="text-primary">tecnologia de ponta.</span>
          </h2>

          <p className="mt-6 max-w-2xl mx-auto text-base md:text-lg text-gray-mid leading-relaxed font-text">
            Uma stack pensada para latência baixa e tradução confiável, do captador de áudio no navegador
            até o processamento de voz e a geração de Libras em tempo real.
          </p>
        </div>

        {/* Cards de categoria */}
        <div ref={cardsRef} className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map(({ title, icon: HeaderIcon, items }, index) => (
            <div
              key={title}
              style={{ transitionDelay: cardsInView ? `${index * 120}ms` : '0ms' }}
              className={`group text-left p-7 rounded-2xl border border-primary/10 bg-secondary/10 hover:border-primary/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 transition-all duration-700 ease-out ${
                cardsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                  <HeaderIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 className="font-ui font-semibold text-text-light text-lg">{title}</h3>
              </div>

              <ul className="space-y-3">
                {items.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-3 text-sm text-gray-mid font-text">
                    <Icon size={16} strokeWidth={1.75} className="text-primary/70 shrink-0" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Arquitetura */}
        <div
          ref={archRef}
          className={`mt-24 pt-16 border-t border-primary/10 transition-all duration-700 ease-out ${
            archInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h3 className="font-ui font-semibold text-text-light text-xl md:text-2xl mb-12">
            Arquitetura do sistema
          </h3>

          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-4">
            {archNodes.map(({ icon: Icon, title, subtitle }, index) => (
              <div key={title} className="flex items-center gap-6 md:gap-4">
                <div
                  style={{ transitionDelay: archInView ? `${index * 150}ms` : '0ms' }}
                  className={`flex flex-col items-center text-center w-40 transition-all duration-700 ease-out ${
                    archInView ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                  }`}
                >
                  <div className="mb-3 w-14 h-14 flex items-center justify-center rounded-full bg-background-dark border-2 border-primary/40 text-primary shadow-[0_0_20px_-6px_rgba(47,105,177,0.6)]">
                    <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <span className="font-ui font-semibold text-text-light text-sm">{title}</span>
                  <span className="mt-1 text-xs text-gray-mid font-text leading-snug">{subtitle}</span>
                </div>

                {index < archNodes.length - 1 && (
                  <>
                    <ArrowRight
                      className="hidden md:block text-primary/40 shrink-0"
                      size={20}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <ArrowDown
                      className="md:hidden text-primary/40 shrink-0"
                      size={20}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
