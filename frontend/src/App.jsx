import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Home from './pages/Home';
import Stone from './pages/Stone';
import Login from './pages/Login';
import Admin from './pages/Admin';
import './styles.css';

function Header() {
  return (
    <header className="site-header">
      <Link to="/" className="site-logo">
        <span className="monogram">R&L</span>
        Wandersteine
      </Link>
    </header>
  );
}

function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');
    if (token) setUser({ token, role, username });
  }, []);

  const handleLogin = (data) => setUser(data);
  const handleLogout = () => setUser(null);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes with header */}
        <Route path="/" element={<><Header /><Home /></>} />
        <Route path="/stein/:number" element={<><Header /><Stone /></>} />

        {/* Auth */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        {/* Protected admin */}
        <Route path="/admin" element={
          <ProtectedRoute user={user}>
            <Admin user={user} onLogout={handleLogout} />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
