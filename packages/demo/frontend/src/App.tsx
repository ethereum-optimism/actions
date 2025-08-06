import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/Home'
import Revolut from './components/Revolut'
import Venmo from './components/Venmo'

function App() {
  return (
    <Router>
      <div className="w-full h-screen bg-terminal-bg">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/venmo" element={<Venmo />} />
          <Route path="/demo" element={<Terminal />} />
          <Route path="/revolut" element={<Revolut />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
