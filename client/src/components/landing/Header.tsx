import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface NavItem {
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { label: 'Início', href: '#inicio' },
  { label: 'Problema', href: '#problema' },
  { label: 'Funcionamento', href: '#funcionamento' },
  { label: 'Tecnologias', href: '#tecnologias' },
  { label: 'Impacto', href: '#impacto' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const linkClass =
    'relative font-ui text-sm tracking-wide py-1 text-text-light/80 hover:text-primary transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-px after:bg-primary after:w-0 after:transition-all after:duration-300 hover:after:w-full';

  const mobileLinkClass = 'block px-2 py-1 text-sm tracking-wide text-text-light/80 hover:text-primary transition-colors';

  return (
    <header className="relative bg-background-dark sticky top-0 z-50 motion-safe:opacity-0 motion-safe:animate-[fadeInDown_0.5s_ease-out_forwards]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            to="/"
            className="text-2xl font-logo font-bold text-primary tracking-tight transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            DualLibras.ai
          </Link>

          <nav className="hidden md:flex items-center space-x-8" aria-label="Navegação principal">
            {navItems.map((item) => (
              <a key={item.label} href={item.href} className={linkClass}>
                {item.label}
              </a>
            ))}
            <div className="flex items-center space-x-3 ml-4">
              <Link
                to="/entrar"
                className="px-4 py-2 font-ui text-sm font-medium tracking-wide text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
              >
                Entrar
              </Link>
              <Link
                to="/cadastrar"
                className="px-5 py-2 font-ui text-sm font-semibold tracking-wide text-text-light bg-gradient-to-r from-primary to-secondary rounded-full hover:brightness-110 hover:scale-[1.03] transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-dark"
              >
                Cadastrar
              </Link>
            </div>
          </nav>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 rounded-md text-text-light/80 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <div
          id="mobile-nav"
          className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
            mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <nav className="border-t border-primary/10 py-5 space-y-4 font-ui" aria-label="Navegação mobile">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={mobileLinkClass}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="flex flex-col space-y-2 pt-3 border-t border-primary/10">
              <Link
                to="/entrar"
                className="px-4 py-2 text-center text-sm text-primary hover:text-primary/80"
                onClick={() => setMobileOpen(false)}
              >
                Entrar
              </Link>
              <Link
                to="/cadastrar"
                className="px-4 py-2 text-center text-sm font-semibold text-text-light bg-gradient-to-r from-primary to-secondary rounded-full hover:brightness-110 transition-all"
                onClick={() => setMobileOpen(false)}
              >
                Cadastrar
              </Link>
            </div>
          </nav>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
    </header>
  );
}
