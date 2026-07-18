import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { label: 'Início', href: '/' },
  { label: 'Problema', href: '/problema' },
  { label: 'Solução', href: '/solucao' },
  { label: 'Tecnologias', href: '/tecnologias' },
  { label: 'Impacto', href: '/impacto' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const linkClass = ({ isActive }) =>
    `font-ui text-sm tracking-wide transition-colors ${
      isActive ? 'text-primary' : 'text-text-light/80 hover:text-primary'
    }`;

  return (
    <header className="relative bg-background-dark sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            to="/"
            className="text-2xl font-logo font-bold text-primary tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            DualLibras.ai
          </Link>

          <nav className="hidden md:flex items-center space-x-8" aria-label="Navegação principal">
            {navItems.map((item) => (
              <NavLink key={item.label} to={item.href} className={linkClass}>
                {item.label}
              </NavLink>
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
                className="px-5 py-2 font-ui text-sm font-semibold tracking-wide text-text-light bg-gradient-to-r from-primary to-secondary rounded-full hover:brightness-110 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-dark"
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
              <NavLink
                key={item.label}
                to={item.href}
                className={({ isActive }) =>
                  `block px-2 py-1 text-sm tracking-wide transition-colors ${
                    isActive ? 'text-primary' : 'text-text-light/80 hover:text-primary'
                  }`
                }
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </NavLink>
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

      {/* linha de assinatura no lugar do vidro/borda cinza */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
    </header>
  );
}
