import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TabProvider } from './context/TabContext'
import Home from './pages/Home'
import Tab from './pages/Tab'
import EditMenuPage from './pages/EditMenuPage'
import EditItemsPage from './pages/EditItemsPage'

export default function App() {
  return (
    <TabProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tab/:id" element={<Tab />} />
          <Route path="/tab/:id/menu" element={<EditMenuPage />} />
          <Route path="/tab/:id/items" element={<EditItemsPage />} />
        </Routes>
      </BrowserRouter>
    </TabProvider>
  )
}
