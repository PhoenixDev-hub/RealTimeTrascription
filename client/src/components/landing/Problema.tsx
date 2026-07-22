import { BookX, Clock3, EarOff, type LucideIcon } from 'lucide-react';
import { useInView } from "../../hooks/useInView";

interface ProblemItem {
  icon: LucideIcon;
  title: string;
  text: string;
}

const problems: ProblemItem[] = [
  {
    icon: EarOff,
    title: 'Acesso limitado em sala',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse potenti. Integer nec odio.',
  },
  {
    icon: Clock3,
    title: 'Atraso na tradução',
    text: 'Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet.',
  },
  {
    icon: BookX,
    title: 'Conteúdo simplificado ausente',
    text: 'Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper porta. Mauris massa.',
  },
];

export default function Problema() {
  const [headerRef, headerInView] = useInView<HTMLDivElement>();
  const [gridRef, gridInView] = useInView<HTMLDivElement>({ threshold: 0.1 });

  return (
    <section id="problema" className="relative bg-background-dark px-4 py-24 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-5xl mx-auto text-center">
        <div
          ref={headerRef}
          className={`transition-all duration-700 ease-out ${
            headerInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-logo text-xs uppercase tracking-[0.2em]">
            O problema
          </span>

          <h2 className="font-ui font-extrabold tracking-tight leading-tight text-text-light text-3xl md:text-4xl lg:text-5xl">
            A sala de aula ainda não é <span className="text-primary">acessível para todos.</span>
          </h2>

          <p className="mt-6 max-w-2xl mx-auto text-base md:text-lg text-gray-mid leading-relaxed font-text">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae vestibulum
            vestibulum. Cras venenatis euismod malesuada.
          </p>
        </div>

        <div ref={gridRef} className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map(({ icon: Icon, title, text }, index) => (
            <div
              key={title}
              style={{ transitionDelay: gridInView ? `${index * 120}ms` : '0ms' }}
              className={`flex flex-col items-center text-center p-8 rounded-2xl border border-primary/10 bg-secondary/10 hover:border-primary/30 hover:-translate-y-1 transition-all duration-700 ease-out ${
                gridInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="mb-5 w-12 h-12 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon size={36} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <h3 className="font-ui font-semibold text-text-light text-lg mb-3">{title}</h3>
              <p className="text-sm text-gray-mid leading-relaxed font-text">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
