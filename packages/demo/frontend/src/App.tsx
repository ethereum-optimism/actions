import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/home/Home'
import { PrivyProvider } from './providers/PrivyProvider'
import { EarnWithPrivyServerWallet } from './components/EarnWithPrivyServerWallet'
import { ActivityLogProvider } from './contexts/ActivityLogContext'

function App() {
  return (
    <PrivyProvider>
      <Router>
        <div className="w-full h-screen bg-terminal-bg">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/demo" element={<Terminal />} />
            <Route
              path="/earn"
              element={
                <ActivityLogProvider>
                  <EarnWithPrivyServerWallet />
                </ActivityLogProvider>
              }
            />
          </Routes>
        </div>
      </Router>
    </PrivyProvider>
  )
}

export default App
