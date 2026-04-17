import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TabProvider } from './context/TabContext'
import Home from './pages/Home'
import Tab from './pages/Tab'

export default function App() {
  return (
    <TabProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tab/:id" element={<Tab />} />
        </Routes>
      </BrowserRouter>
    </TabProvider>
  )
}
