import Catalog from './pages/Catalog'
import MyNumbers from './pages/MyNumbers'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import Home from './pages/Home'
import Raffle from './pages/Raffle'
import Results from './pages/Results'
import Profile from './pages/Profile'
import Invite from './pages/Invite'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/bienvenida" element={<Welcome />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/sorteo/:id" element={<Raffle />} />
        <Route path="/mis-numeros" element={<MyNumbers />} />
        <Route path="/premios" element={<Catalog />} />
        <Route path="/resultados" element={<Results />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/invitar" element={<Invite />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
