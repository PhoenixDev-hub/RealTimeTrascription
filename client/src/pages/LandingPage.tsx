import Footer from '../components/landing/Footer';
import Funcionamento from '../components/landing/Funcionamento';
import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';
import Impacto from '../components/landing/Impacto';
import Problema from '../components/landing/Problema';
import Tecnologias from '../components/landing/tecnologia';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Problema />
        <Funcionamento />
        <Tecnologias />
        <Impacto />
        <Footer />
      </main>
    </div>
  );
}
