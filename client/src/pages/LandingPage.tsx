import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
      </main>
    </div>
  );
}
