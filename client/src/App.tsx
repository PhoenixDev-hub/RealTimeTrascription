import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppPrincipal from './pages/AppPrincipal';
import { LandingPage } from './pages/LandingPage';


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppPrincipal />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
