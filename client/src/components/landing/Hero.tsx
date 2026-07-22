import { ChevronDown, PlayCircle, Radio } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import heroBg from '../../assets/hero-bg.png';

interface Stat {
  value: string;
  label: string;
}

const stats: Stat[] = [
  { value: '98%', label: 'de compreensão em sala' },
  { value: '+40', label: 'escolas parceiras' },
  { value: '<1s', label: 'de latência na tradução' },
];

const revealClass =
  'motion-safe:opacity-0 motion-safe:animate-[fadeInUp_0.7s_ease-out_forwards]';
const revealStyle = (delayMs: number): CSSProperties => ({ animationDelay: `${delayMs}ms` });

export default function Hero() {
  return (
    <section id="inicio" className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4 py-24 overflow-hidden bg-background-dark">
      <div
        className="absolute inset-0 bg-cover bg-center scale-110 blur-sm"
        style={{ backgroundImage: `url(${heroBg})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-primary/50 mix-blend-multiply" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-gradient-to-b from-background-dark/90 via-background-dark/50 to-background-dark/95"
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center">
        <span
          className={`inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-logo text-xs uppercase tracking-[0.2em] ${revealClass}`}
          style={revealStyle(0)}
        >
          <Radio size={14} strokeWidth={2} aria-hidden="true" />
          Tradução em tempo real
        </span>

        <h1
          className={`font-ui font-extrabold tracking-tight leading-[1.05] text-text-light text-[2.75rem] md:text-6xl lg:text-7xl ${revealClass}`}
          style={revealStyle(100)}
        >
          Uma ponte em tempo real{' '}
          <span className="text-primary">entre voz e Libras.</span>
        </h1>

        <p
          className={`mt-8 max-w-xl mx-auto text-lg md:text-xl text-gray-mid leading-relaxed font-text ${revealClass}`}
          style={revealStyle(200)}
        >
          Nossa plataforma transforma a fala do professor em texto simplificado e tradução para Libras,
          permitindo que alunos surdos acompanhem a aula com a mesma clareza e ritmo dos colegas ouvintes.
        </p>

        <div
          className={`mt-10 flex flex-col sm:flex-row items-center gap-4 ${revealClass}`}
          style={revealStyle(300)}
        >
          <a
            href="#funcionamento"
            className="inline-flex items-center px-7 py-3.5 bg-gradient-to-r from-primary to-secondary text-text-light font-ui font-semibold tracking-wide rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:brightness-110 hover:scale-[1.02] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-dark"
          >
            Conheça a plataforma
          </a>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 px-7 py-3.5 text-text-light font-ui font-semibold tracking-wide rounded-full border border-text-light/20 hover:border-primary/60 hover:text-primary hover:scale-[1.02] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-dark"
          >
            <PlayCircle size={20} strokeWidth={1.75} aria-hidden="true" />
            Ver demonstração
          </Link>
        </div>

        <dl
          className={`mt-16 grid grid-cols-3 gap-6 sm:gap-12 w-full max-w-lg ${revealClass}`}
          style={revealStyle(400)}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-logo text-2xl md:text-3xl font-bold text-primary">{stat.value}</dd>
              <span className="mt-1 text-xs text-gray-mid font-text leading-snug">{stat.label}</span>
            </div>
          ))}
        </dl>
      </div>

      <div className="absolute z-10 bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-mid motion-safe:animate-bounce">
        <span className="font-logo text-[10px] uppercase tracking-[0.3em]">Scroll</span>
        <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" />
      </div>
    </section>
  );
}
