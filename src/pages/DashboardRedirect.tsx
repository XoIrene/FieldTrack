import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LoadingScreen from '@/components/LoadingScreen';

export default function DashboardRedirect() {
  const { user, loading, isAdmin, isWorker } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (isWorker) {
    return <Navigate to="/worker" replace />;
  }

  return <Navigate to="/login" replace />;
}
