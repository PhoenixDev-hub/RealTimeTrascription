import { Cpu, Hand, Mic, type LucideIcon } from 'lucide-react';
import { useInView } from '../../hooks/useInView';

interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
}

const steps: Step[] = [
  {
    icon: Mic,
    title: 'Captura da fala',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse potenti in sagittis.',
  },
  {
    icon: Cpu,
    title: 'Processamento em tempo real',
    text: 'Praesent libero sed cursus ante dapibus diam. Sed nisi nulla quis sem at nibh.',
  },
  {
    icon: Hand,
    title: 'Tradução para Libras',
    text: 'Duis sagittis ipsum praesent mauris fusce nec tellus sed augue semper porta.',
  },
];

export default function Funcionamento() {
  const [headerRef, headerInView] = useInView<HTMLDivElement>();
  const [flowRef, flowInView] = useInView<HTMLDivElement>({ threshold: 0.1 });

  return (
    <section id="funcionamento" className="relative bg-background-dark px-4 py-24 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-5xl mx-auto text-center">
        <div
          ref={headerRef}
          className={`transition-all duration-700 ease-out ${
            headerInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-logo text-xs uppercase tracking-[0.2em]">
            Como funciona
          </span>

          <h2 className="font-ui font-extrabold tracking-tight leading-tight text-text-light text-3xl md:text-4xl lg:text-5xl">
            Da fala ao sinal, <span className="text-primary">em segundos.</span>
          </h2>

          <p className="mt-6 max-w-2xl mx-auto text-base md:text-lg text-gray-mid leading-relaxed font-text">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum
            vestibulum. Cras venenatis euismod malesuada.
          </p>
        </div>

        <div ref={flowRef} className="relative mt-20 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6">
          <div
            className={`hidden md:block absolute top-8 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-primary/10 via-primary/60 to-primary/10 transition-opacity duration-700 ${
              flowInView ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          />

          {steps.map(({ icon: Icon, title, text }, index) => (
            <div
              key={title}
              style={{ transitionDelay: flowInView ? `${index * 150}ms` : '0ms' }}
              className={`relative flex flex-col items-center text-center transition-all duration-700 ease-out ${
                flowInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="relative z-10 mb-6 w-16 h-16 flex items-center justify-center rounded-full bg-background-dark border-2 border-primary/40 text-primary shadow-[0_0_24px_-6px_rgba(47,105,177,0.6)]">
                <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
                <span className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-text-light font-logo text-xs font-bold">
                  {index + 1}
                </span>
              </div>
              <h3 className="font-ui font-semibold text-text-light text-lg mb-3">{title}</h3>
              <p className="text-sm text-gray-mid leading-relaxed font-text max-w-xs">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
