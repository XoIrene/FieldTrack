import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff, User, Phone, ShieldCheck, HardHat, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';
import { isValidEmail, isValidPassword, isValidPhone } from '../lib/utils';
import type { UserRole } from '../types';

// Optional admin invite code. Set VITE_ADMIN_SIGNUP_CODE in .env to protect
// admin self-registration. If unset, anyone can register as admin (dev mode).
const ADMIN_SIGNUP_CODE = import.meta.env.VITE_ADMIN_SIGNUP_CODE as string | undefined;

export default function Register() {
  const { signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('worker');
  const [adminCode, setAdminCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Don't leave an authenticated user stranded on /register.
  useEffect(() => {
    if (!authLoading && user) {
      navigate(user.role === 'admin' ? '/admin' : '/worker', { replace: true });
    }
  }, [user, authLoading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!fullName || !email || !phone || !password || !confirmPassword) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    if (!isValidPhone(phone)) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    if (!isValidPassword(password)) {
      toast.error('Password must be at least 8 characters with uppercase, lowercase, and numbers.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (role === 'admin' && ADMIN_SIGNUP_CODE && adminCode !== ADMIN_SIGNUP_CODE) {
      toast.error('Invalid admin access code.');
      return;
    }

    setLoading(true);
    try {
      await signUp(fullName, email, phone, password, role);
      toast.success(
        role === 'admin'
          ? 'Admin account created! Please sign in to access the admin panel.'
          : 'Account created successfully! Please sign in.'
      );
      navigate('/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-primary-50 via-white to-slate-50">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center">Create Account</h2>
          <p className="mt-1 text-sm text-slate-500 text-center">
            {role === 'admin'
              ? 'Register as an administrator'
              : 'Register as a field worker'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <span className="label">I want to register as</span>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setRole('worker')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    role === 'worker'
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <HardHat className="w-4 h-4" />
                  Field Worker
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                    role === 'admin'
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin
                </button>
              </div>
              {role === 'admin' && (
                <p className="mt-2 text-xs text-slate-500">
                  Admins manage projects, generate attendance QR codes, and view reports.
                  No QR code is needed to register — you create QR codes after signing in.
                </p>
              )}
            </div>

            {role === 'admin' && ADMIN_SIGNUP_CODE && (
              <div>
                <label htmlFor="adminCode" className="label">Admin Access Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="adminCode"
                    type="password"
                    className="input pl-10"
                    placeholder="Enter admin access code"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="fullName" className="label">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="fullName"
                  type="text"
                  className="input pl-10"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  className="input pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="label">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="phone"
                  type="tel"
                  className="input pl-10"
                  placeholder="+252 61 234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-10 pr-10"
                  placeholder="Min 8 chars with uppercase, lowercase & number"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <span className="spinner w-4 h-4" />
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Sign In
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Simple. Secure. Accountable Field Attendance.
        </p>
      </div>
    </div>
  );
}