import { LogIn, Menu, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../common/Button'

export const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed top-0 w-full bg-white/90 backdrop-blur-md shadow-sm z-50 border-b border-gray-100">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-primary">DUAL</span>
          <span className="text-2xl font-bold text-secondary">LIBRAS</span>
          <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full font-bold">AI</span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex gap-8 text-gray-700 font-medium">
          <a href="#sobre" className="hover:text-secondary transition">Sobre</a>
          <a href="#tecnologia" className="hover:text-secondary transition">Tecnologia</a>
          <a href="#impacto" className="hover:text-secondary transition">Impacto</a>
          <a href="#contato" className="hover:text-secondary transition">Contato</a>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex gap-3">
          <Button variant="outline" className="text-sm px-4 py-2">
            <LogIn size={16} /> Entrar
          </Button>
          <Button variant="primary" className="text-sm px-4 py-2">
            <UserPlus size={16} /> Cadastrar
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-gray-700"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-4">
          <a href="#sobre" className="hover:text-secondary transition">Sobre</a>
          <a href="#tecnologia" className="hover:text-secondary transition">Tecnologia</a>
          <a href="#impacto" className="hover:text-secondary transition">Impacto</a>
          <a href="#contato" className="hover:text-secondary transition">Contato</a>
          <div className="flex flex-col gap-2 mt-2">
            <Button variant="outline" className="w-full justify-center text-sm py-2">
              <LogIn size={16} /> Entrar
            </Button>
            <Button variant="primary" className="w-full justify-center text-sm py-2">
              <UserPlus size={16} /> Cadastrar
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
