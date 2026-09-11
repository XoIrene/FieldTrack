import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ScanLine,
  CalendarCheck,
  ClipboardList,
  LogOut,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';
import { getInitials } from '../lib/utils';

const navItems = [
  { to: '/worker', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/worker/scan', label: 'Scan QR', icon: ScanLine },
  { to: '/worker/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/worker/activity', label: 'Activity', icon: ClipboardList },
];

export default function WorkerLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-semibold"
              title={user?.full_name ?? 'Worker'}
            >
              {user ? getInitials(user.full_name) : '?'}
            </div>
            <NavLink
              to="/profile"
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Profile"
            >
              <UserCircle className="w-5 h-5 text-slate-600" />
            </NavLink>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-danger-50 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5 text-danger-600" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30">
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-primary-600' : 'text-slate-500 hover:text-slate-700'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}