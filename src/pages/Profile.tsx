import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';

export default function Profile() {
  const { user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim()) {
      toast.error('Full name is required.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() || null })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success('Profile updated!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500">Manage your account</p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-600 text-white flex items-center justify-center text-lg font-semibold">
            {getInitials(user.full_name)}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{user.full_name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            <span className="badge-primary mt-1 capitalize">{user.role}</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input
              id="phone"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+252 61 234 5678"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input opacity-60" value={user.email} disabled readOnly />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? <span className="spinner w-4 h-4" /> : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="card p-6">
        <button onClick={handleSignOut} className="btn-danger w-full">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <UserCircle className="w-4 h-4" />
          {user.is_active ? 'Account active' : 'Account inactive'}
        </p>
      </div>
    </div>
  );
}
