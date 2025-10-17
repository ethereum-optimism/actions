import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/home/Home'
import { PrivyProvider } from './providers/PrivyProvider'
import { EarnPage } from './pages/EarnPage'

function App() {
  return (
    <Router>
      <div className="w-full h-screen bg-terminal-bg">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/demo"
            element={
              <PrivyProvider>
                <Terminal />
              </PrivyProvider>
            }
          />
          <Route path="/earn" element={<EarnPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
