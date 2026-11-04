import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { BrandProvider } from './lib/brand'
import './index.css'
import { registerServiceWorker } from './lib/pwa'
import { supabase } from './lib/supabase'
import { RECOVERY_KEY } from './lib/auth'

registerServiceWorker()

// Enlace de un correo de Supabase (#access_token=...): la app usa el # para sus pantallas,
// así que primero dejamos que Supabase lea la sesión y después limpiamos la dirección.
async function start() {
  const hash = window.location.hash
  if (supabase && /access_token=|error_description=/.test(hash)) {
    if (/type=recovery/.test(hash)) {
      try { sessionStorage.setItem(RECOVERY_KEY, '1') } catch { /* sin almacenamiento */ }
    }
    await supabase.auth.getSession()
    window.history.replaceState(null, '', window.location.pathname + '#/perfil')
  }
  render()
}

// Si el enlace se abre con la app ya cargada, solo cambia el #: recargamos para procesarlo igual.
// Va antes que el router (que escucha 'popstate' y cambiaría la dirección primero).
const reloadOnToken = () => { if (/access_token=/.test(window.location.hash)) window.location.reload() }
window.addEventListener('popstate', reloadOnToken)
window.addEventListener('hashchange', reloadOnToken)

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <BrandProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrandProvider>
    </HashRouter>
  </StrictMode>,
)

void start()
