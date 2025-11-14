import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Home from '@/components/home/Home'
import { EarnPage } from '@/pages/EarnPage'
import Docs from '@/pages/Docs'
import { ROUTES } from '@/constants/routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10000, // 10 seconds
      gcTime: 300000, // 5 minutes (formerly cacheTime)
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}

export default App
