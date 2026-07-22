import { Briefcase, Camera, Code, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FooterLink {
  label: string;
  href: string;
}

const productLinks: FooterLink[] = [
  { label: 'Problema', href: '#problema' },
  { label: 'Funcionamento', href: '#funcionamento' },
  { label: 'Tecnologias', href: '#tecnologias' },
  { label: 'Impacto', href: '#impacto' },
];

const companyLinks: FooterLink[] = [
  { label: 'Sobre nós', href: '#impacto' },
  { label: 'Contato', href: 'mailto:contato@duallibras.ai' },
  { label: 'Privacidade', href: '#inicio' },
  { label: 'Termos de uso', href: '#inicio' },
];

const socialLinks = [
  { icon: Code, label: 'GitHub', href: 'https://github.com' },
  { icon: Briefcase, label: 'LinkedIn', href: 'https://linkedin.com' },
  { icon: Camera, label: 'Instagram', href: 'https://instagram.com' },
  { icon: Mail, label: 'E-mail', href: 'mailto:contato@duallibras.ai' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative bg-background-dark px-4 pt-20 pb-8">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-12">
          {/* Marca */}
          <div>
            <Link
              to="/"
              className="text-2xl font-logo font-bold text-primary tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              DualLibras.ai
            </Link>
            <p className="mt-4 max-w-xs text-sm text-gray-mid font-text leading-relaxed">
              Uma ponte em tempo real entre voz e Libras, para que nenhum aluno surdo fique de fora da aula.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-primary/20 text-gray-mid hover:text-primary hover:border-primary/50 hover:scale-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Produto */}
          <div>
            <h4 className="font-ui font-semibold text-text-light text-sm uppercase tracking-wide mb-4">
              Produto
            </h4>
            <ul className="space-y-3">
              {productLinks.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    className="text-sm text-gray-mid hover:text-primary transition-colors font-text"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h4 className="font-ui font-semibold text-text-light text-sm uppercase tracking-wide mb-4">
              Empresa
            </h4>
            <ul className="space-y-3">
              {companyLinks.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    className="text-sm text-gray-mid hover:text-primary transition-colors font-text"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Barra final */}
        <div className="mt-16 pt-6 border-t border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-mid font-text">
          <span>© {year} DualLibras.ai. Todos os direitos reservados.</span>
          <span>Feito com acessibilidade em mente.</span>
        </div>
      </div>
    </footer>
  );
}
