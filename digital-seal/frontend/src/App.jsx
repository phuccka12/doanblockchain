import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Studio from './pages/Studio';
import Verify from './pages/Verify';
import Explorer from './pages/Explorer';
import Provenance from './pages/Provenance';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0a0a1a] text-white font-sans selection:bg-indigo-500/30">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/provenance" element={<Provenance />} />
          </Routes>
        </main>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#1a1a2e', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' },
          }}
        />
      </div>
    </BrowserRouter>
  );
}