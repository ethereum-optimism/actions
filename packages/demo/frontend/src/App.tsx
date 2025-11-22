import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from '@/components/home/Home'
import { EarnPage } from '@/pages/EarnPage'
import Docs from '@/pages/Docs'
import { ROUTES } from '@/constants/routes'

function App() {
  return (
    <Router>
      <div className="w-full h-screen bg-terminal-bg min-w-[400px]">
        <Routes>
          <Route path={ROUTES.HOME} element={<Home />} />
          <Route path={ROUTES.DOCS} element={<Docs />} />
          <Route path={ROUTES.DEMO} element={<EarnPage />} />
          <Route path={ROUTES.EARN} element={<EarnPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
