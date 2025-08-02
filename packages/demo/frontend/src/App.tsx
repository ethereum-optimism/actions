import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/Home'

function App() {
  return (
    <Router>
      <div className="w-full h-screen bg-terminal-bg">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/demo" element={<Terminal />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
