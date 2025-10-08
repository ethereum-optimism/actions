import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Terminal from './components/Terminal'
import Home from './components/home/Home'
import Earn from './components/Earn'
import { PrivyProvider } from './providers/PrivyProvider'

function App() {
  return (
      <PrivyProvider>
        <Router>
          <div className="w-full h-screen bg-terminal-bg">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/demo" element={<Terminal />} />
              <Route path="/earn" element={<Earn />} />
            </Routes>
          </div>
        </Router>
      </PrivyProvider>
  )
}

export default App
