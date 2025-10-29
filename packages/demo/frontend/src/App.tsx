import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import Terminal from './components/Terminal'
import Home from './components/home/Home'
import { PrivyProvider } from './providers/PrivyProvider'
import { EarnPage } from './pages/EarnPage'
import DocsPage from './pages/DocsPage'
import { ROUTES } from './constants/routes'

function App() {
  // Prevent default scroll restoration to allow manual hash navigation
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  return (
    <Router>
      <div className="w-full h-screen bg-terminal-bg min-w-[475px]">
        <Routes>
          <Route path={ROUTES.HOME} element={<Home />} />
          <Route path={ROUTES.DOCS} element={<DocsPage />} />
          <Route
            path={ROUTES.DEMO}
            element={
              <PrivyProvider>
                <Terminal />
              </PrivyProvider>
            }
          />
          <Route path={ROUTES.EARN} element={<EarnPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
