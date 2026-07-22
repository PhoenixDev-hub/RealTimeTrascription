import { ArrowRight, GraduationCap, Quote, School, Smile, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';

interface ImpactStat {
  icon: LucideIcon;
  value: string;
  label: string;
  description: string;
}

const impactStats: ImpactStat[] = [
  {
    icon: GraduationCap,
    value: '+1.200',
    label: 'alunos surdos atendidos',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  },
  {
    icon: School,
    value: '+40',
    label: 'escolas parceiras',
    description: 'Praesent libero sed cursus ante dapibus diam nisi.',
  },
  {
    icon: Timer,
    value: '<1s',
    label: 'de latência na tradução',
    description: 'Duis sagittis ipsum praesent mauris fusce nec tellus.',
  },
  {
    icon: Smile,
    value: '98%',
    label: 'de satisfação reportada',
    description: 'Vivamus lacinia odio vitae vestibulum vestibulum.',
  },
];

export default function Impacto() {
  const [headerRef, headerInView] = useInView<HTMLDivElement>();
  const [statsRef, statsInView] = useInView<HTMLDivElement>({ threshold: 0.1 });
  const [quoteRef, quoteInView] = useInView<HTMLDivElement>();
  const [ctaRef, ctaInView] = useInView<HTMLDivElement>();

  return (
    <section id="impacto" className="relative bg-background-dark px-4 py-24 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-5xl mx-auto text-center">
        <div
          ref={headerRef}
          className={`transition-all duration-700 ease-out ${
            headerInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-logo text-xs uppercase tracking-[0.2em]">
            Impacto
          </span>

          <h2 className="font-ui font-extrabold tracking-tight leading-tight text-text-light text-3xl md:text-4xl lg:text-5xl">
            Transformando a experiência <span className="text-primary">em sala de aula.</span>
          </h2>

          <p className="mt-6 max-w-2xl mx-auto text-base md:text-lg text-gray-mid leading-relaxed font-text">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus lacinia odio vitae
            vestibulum vestibulum. Cras venenatis euismod malesuada.
          </p>
        </div>

        {/* Grid de estatísticas */}
        <div ref={statsRef} className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {impactStats.map(({ icon: Icon, value, label, description }, index) => (
            <div
              key={label}
              style={{ transitionDelay: statsInView ? `${index * 120}ms` : '0ms' }}
              className={`text-left p-6 rounded-2xl border border-primary/10 bg-secondary/10 hover:border-primary/30 hover:-translate-y-1 transition-all duration-700 ease-out ${
                statsInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="mb-4 w-11 h-11 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="font-logo text-3xl font-bold text-primary">{value}</div>
              <div className="mt-1 font-ui font-medium text-text-light text-sm">{label}</div>
              <p className="mt-2 text-xs text-gray-mid font-text leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        {/* Depoimento */}
        <div
          ref={quoteRef}
          className={`mt-16 max-w-2xl mx-auto p-8 md:p-10 rounded-2xl border border-primary/10 bg-secondary/10 transition-all duration-700 ease-out ${
            quoteInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <Quote size={28} strokeWidth={1.5} className="text-primary/50 mx-auto mb-4" aria-hidden="true" />
          <p className="font-text text-text-light/90 text-base md:text-lg leading-relaxed italic">
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse potenti integer nec
            odio praesent libero sed cursus ante dapibus diam."
          </p>
          <div className="mt-5 font-ui text-sm text-gray-mid">
            <span className="text-primary font-semibold">Nome Sobrenome</span> — Professora, Escola Exemplo
          </div>
        </div>

        {/* CTA final */}
        <div
          ref={ctaRef}
          className={`mt-20 relative overflow-hidden rounded-3xl px-8 py-14 md:py-16 bg-gradient-to-br from-primary to-secondary transition-all duration-700 ease-out ${
            ctaInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h3 className="font-ui font-extrabold text-text-light text-2xl md:text-3xl">
            Pronto para transformar sua sala de aula?
          </h3>
          <p className="mt-3 text-text-light/80 font-text max-w-xl mx-auto">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </p>
          <Link
            to="/app"
            className="mt-8 inline-flex items-center gap-2 px-7 py-3.5 bg-background-dark text-text-light font-ui font-semibold tracking-wide rounded-full hover:scale-[1.03] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-light focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            Cadastre-se gratuitamente
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
