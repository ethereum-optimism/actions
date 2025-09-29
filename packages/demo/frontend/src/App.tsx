import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/Home'
import { Turnkey as TurnkeyProvider } from './providers/TurnkeyProvider'

function App() {
  return (
    <TurnkeyProvider>
      <Router>
        <div className="w-full h-screen bg-terminal-bg">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/demo" element={<Terminal />} />
          </Routes>
        </div>
      </Router>
    </TurnkeyProvider>
  )
}

export default App
