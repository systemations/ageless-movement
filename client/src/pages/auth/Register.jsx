import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('client');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await register(email, password, name, role);
      navigate(data.user.role === 'coach' ? '/coach/messages' : '/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <img src="/logo.png" alt="Ageless Movement" className="auth-logo" />
      <h1 className="auth-title">Get Started</h1>
      <p className="auth-subtitle">Create your Ageless Movement account</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <div className="role-selector">
          <button
            type="button"
            className={`role-option ${role === 'client' ? 'selected' : ''}`}
            onClick={() => setRole('client')}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={role === 'client' ? '#3DFFD2' : '#8E8E93'} strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <h3>Client</h3>
            <p>Train with a coach</p>
          </button>
          <button
            type="button"
            className={`role-option ${role === 'coach' ? 'selected' : ''}`}
            onClick={() => setRole('coach')}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={role === 'coach' ? '#3DFFD2' : '#8E8E93'} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <h3>Coach</h3>
            <p>Manage clients</p>
          </button>
        </div>

        <div className="input-group">
          <label>Name</label>
          <input
            type="text"
            className="input-field"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>

        <div className="input-group">
          <label>Email</label>
          <input
            type="email"
            className="input-field"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input
            type="password"
            className="input-field"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="auth-link">
        Already have an account? <Link to="/login">Sign In</Link>
      </p>
    </div>
  );
}
