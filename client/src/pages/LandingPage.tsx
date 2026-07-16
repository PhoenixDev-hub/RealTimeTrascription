import { Features } from '../components/landing/Features'
import { Footer } from '../components/landing/Footer'
import { Header } from '../components/landing/Header'
import { Hero } from '../components/landing/Hero'
import { Impact } from '../components/landing/Impact'

export const LandingPage = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Features />
      <Impact />
      <Footer />
    </div>
  )
}
