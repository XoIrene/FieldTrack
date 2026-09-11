import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, clearSupabaseAuthStorage } from '../lib/supabase';
import type { Profile, UserRole } from '../types';
import { getErrorMessage } from '../lib/utils';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isWorker: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (fullName: string, email: string, phone: string, password: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string): Promise<Profile | null> {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const profile = data as Profile;
        setUser(profile);
        return profile;
      }

      // No profile row yet (PGRST116 with .single()). This happens for:
      // - users created in the Dashboard before the trigger existed,
      // - a trigger that failed / was dropped,
      // - a race where the trigger hasn't committed yet.
      // Self-heal: create the row from the auth user metadata. RLS
      // "Users can insert own profile" (migration 0003) allows this.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || authUser.id !== userId) {
        console.error('Error fetching profile: no profile row for user', userId);
        setUser(null);
        return null;
      }

      const meta = (authUser.user_metadata ?? {}) as Record<string, string>;
      const role = meta.role === 'admin' ? 'admin' : 'worker';
      const { data: healed, error: healError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            full_name: meta.full_name || authUser.email?.split('@')[0] || 'Unnamed',
            email: authUser.email ?? '',
            phone: meta.phone || '',
            role,
          },
          { onConflict: 'id' }
        )
        .select()
        .maybeSingle();

      if (healError || !healed) {
        console.error('Error fetching profile: missing profile row and self-heal failed:', healError ?? 'no row returned');
        setUser(null);
        return null;
      }
      const profile = healed as Profile;
      setUser(profile);
      return profile;
    } catch (error) {
      console.error('Error fetching profile:', error);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string): Promise<Profile> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(getErrorMessage(error));
    if (!data.session?.user) {
      throw new Error('Login failed: no session returned. Please try again.');
    }
    // Wait for the profile/role to load before returning so callers
    // can redirect based on role without a race condition.
    const profile = await fetchProfile(data.session.user.id);
    if (!profile) {
      throw new Error('Login succeeded but the user profile could not be loaded.');
    }
    return profile;
  }

  async function signUp(
    fullName: string,
    email: string,
    phone: string,
    password: string,
    role: UserRole = 'worker'
  ) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          role,
        },
      },
    });
    if (error) throw new Error(getErrorMessage(error));
  }

  async function signOut() {
    // Explicit Sign Out must clear the local session immediately, even if
    // the network revocation request fails (offline). The finally block
    // guarantees local state + session-scoped storage are wiped.
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(getErrorMessage(error));
    } finally {
      clearSupabaseAuthStorage();
      setUser(null);
    }
  }

  async function refreshProfile() {
    const userId = user?.id ?? (await supabase.auth.getSession()).data.session?.user.id;
    if (userId) {
      await fetchProfile(userId);
    }
  }

  const value = {
    user,
    loading,
    isAdmin: user?.role === 'admin',
    isWorker: user?.role === 'worker',
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}