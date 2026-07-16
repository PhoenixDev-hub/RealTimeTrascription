import { Mail, MapPin, Phone } from 'lucide-react'

export const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 py-12">
      <div className="container mx-auto px-6 grid md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl font-bold text-white">DUAL</span>
            <span className="text-2xl font-bold text-secondary">LIBRAS</span>
            <span className="text-xs bg-accent text-white px-2 py-0.5 rounded-full">AI</span>
          </div>
          <p className="text-sm">Tecnologia para inclusão e acessibilidade na educação.</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Plataforma</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="#" className="hover:text-white">Professores</a></li>
            <li><a href="#" className="hover:text-white">Alunos</a></li>
            <li><a href="#" className="hover:text-white">Administradores</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Suporte</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="#" className="hover:text-white">Ajuda</a></li>
            <li><a href="#" className="hover:text-white">Documentação</a></li>
            <li><a href="#" className="hover:text-white">Contato</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Contato</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Mail size={16} /> contato@duallibras.ai</li>
            <li className="flex items-center gap-2"><Phone size={16} /> +55 (11) 99999-9999</li>
            <li className="flex items-center gap-2"><MapPin size={16} /> São Paulo, Brasil</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-800 mt-8 pt-6 text-center text-sm text-gray-500">
        © 2026 DualLibras.AI. Todos os direitos reservados.
      </div>
    </footer>
  )
}
