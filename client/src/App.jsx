import { Routes, Route, Navigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

axios.defaults.withCredentials = true;

const API = import.meta.env.VITE_API_URL;

export default function App() {
  const [user, setUser]     = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [sid, setSid]       = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSid = params.get('sid');

    let activeSid = null;
    if (urlSid) {
      sessionStorage.setItem('sid', urlSid);
      activeSid = urlSid;
      window.history.replaceState({}, '', '/dashboard');
    } else {
      activeSid = sessionStorage.getItem('sid');
    }

    if (activeSid) {
      setSid(activeSid);
      axios.defaults.headers.common['x-session-id'] = activeSid;
    }

    axios
      .get(`${API}/auth/me`, {
        headers: activeSid ? { 'x-session-id': activeSid } : {}
      })
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, sid }}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route
          path="/dashboard"
          element={user ? <DashboardPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}