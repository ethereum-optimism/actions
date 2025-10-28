import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/home/Home'
import { PrivyProvider } from './providers/PrivyProvider'
import { EarnPage } from './pages/EarnPage'
import { ROUTES } from './constants/routes'

function App() {
  return (
    <Router>
      <div className="w-full h-screen bg-terminal-bg">
        <Routes>
          <Route path={ROUTES.HOME} element={<Home />} />
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
