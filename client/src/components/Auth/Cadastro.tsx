import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import heroBg from '../../assets/hero-bg.png';

export default function Cadastro() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="min-h-screen flex bg-background-dark">
      {/* Painel de marca (some em telas pequenas) */}
      <div className="hidden lg:flex relative w-1/2 items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 blur-sm"
          style={{ backgroundImage: `url(${heroBg})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-primary/50 mix-blend-multiply" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-gradient-to-br from-background-dark/90 via-background-dark/40 to-background-dark/95"
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-md px-10 text-center">
          <Link to="/" className="text-3xl font-logo font-bold text-primary tracking-tight">
            DualLibras.ai
          </Link>
          <h2 className="mt-6 font-ui font-extrabold text-[#EDEDED] text-3xl leading-tight">
            Comece a incluir <span className="text-[#2F69B1]">todos os alunos hoje.</span>
          </h2>
          <p className="mt-4 text-gray-mid font-text leading-relaxed">
            Crie sua conta gratuita e leve tradução em tempo real para a sua sala de aula.
          </p>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <Link
            to="/"
            className="lg:hidden inline-block mb-10 text-2xl font-logo font-bold text-primary tracking-tight"
          >
            DualLibras.ai
          </Link>

          <span className="inline-flex items-center px-4 py-1.5 rounded-full border border-[#2F69B1]/30 bg-[#2F69B1]/10 text-[#2F69B1] font-logo text-xs uppercase tracking-[0.2em]">
            Cadastro gratuito
          </span>

          <h1 className="mt-5 font-ui font-extrabold text-background-dark text-3xl">Criar conta</h1>
          <p className="mt-2 text-sm text-background-dark font-text">
            Já tem uma conta?{' '}
            <Link to="/entrar" className="text-primary hover:text-primary/80 font-medium">
              Entrar
            </Link>
          </p>

          <form className="mt-8 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-ui font-medium text-background-dark mb-2">
                Nome completo
              </label>
              <div className="relative">
                <User
                  size={18}
                  strokeWidth={1.75}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-mid"
                  aria-hidden="true"
                />
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-primary/20 bg-secondary/10 text-[#EDEDED] placeholder:text-gray-mid/60 font-text text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-ui font-medium text-background-dark mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  strokeWidth={1.75}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-mid"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@escola.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-primary/20 bg-secondary/10 text-[#EDEDED] placeholder:text-gray-mid/60 font-text text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-ui font-medium text-background-dark mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  strokeWidth={1.75}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-mid"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-primary/20 bg-secondary/10 text-[#EDEDED] placeholder:text-gray-mid/60 font-text text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-mid hover:text-primary transition-colors"
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-ui font-medium text-background-dark mb-2">
                Confirmar senha
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  strokeWidth={1.75}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-mid"
                  aria-hidden="true"
                />
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-primary/20 bg-secondary/10 text-[#EDEDED] placeholder:text-gray-mid/60 font-text text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-mid hover:text-primary transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-background-dark font-text">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded border-primary/30 bg-secondary/10 text-primary focus:ring-primary/40"
              />
              Concordo com os{' '}
              <Link to="/termos" className="text-primary hover:text-primary/80">
                Termos de uso
              </Link>{' '}
              e a{' '}
              <Link to="/privacidade" className="text-primary hover:text-primary/80">
                Política de privacidade
              </Link>
            </label>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-[#2F69B1] to-[#25589B] text-[#EDEDED] font-ui font-semibold tracking-wide rounded-full shadow-lg shadow-[#2F69B1]/20 hover:shadow-[#2F69B1]/40 hover:brightness-110 hover:scale-[1.01] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F69B1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04133B]"
            >
              Criar conta
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
