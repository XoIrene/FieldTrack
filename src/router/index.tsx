import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import LazyOutlet from '@/components/LazyOutlet';

// Worker chunks are content-hashed, so after a new deployment (or a PWA
// service-worker update) the browser can attempt to load a stale chunk URL
// that no longer exists and the dynamic import rejects with
// "error loading dynamically imported module". Retry once via a single
// reload so the fresh index.html / service worker is picked up; otherwise
// rethrow to avoid a reload loop. Scoped to worker routes only.
const WORKER_CHUNK_RELOAD_KEY = 'ft-worker-chunk-reloaded';

function lazyWithRetry<T extends ComponentType<any>>(importer: () => Promise<{ default: T }>) {
  return lazy(() =>
    importer().catch((error: unknown) => {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(WORKER_CHUNK_RELOAD_KEY) === '1';
        if (!alreadyReloaded) {
          sessionStorage.setItem(WORKER_CHUNK_RELOAD_KEY, '1');
        } else {
          sessionStorage.removeItem(WORKER_CHUNK_RELOAD_KEY);
        }
      } catch {
        // sessionStorage unavailable (e.g. private mode): surface the error.
      }
      if (!alreadyReloaded) {
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    })
  );
}

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const DashboardRedirect = lazy(() => import('@/pages/DashboardRedirect'));
const Profile = lazy(() => import('@/pages/Profile'));
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminWorkers = lazy(() => import('@/pages/admin/AdminWorkers'));
const AdminFields = lazy(() => import('@/pages/admin/AdminFields'));
const AdminAttendance = lazy(() => import('@/pages/admin/AdminAttendance'));
const AdminReports = lazy(() => import('@/pages/admin/AdminReports'));
const AdminHistory = lazy(() => import('@/pages/admin/AdminHistory'));
const WorkerLayout = lazyWithRetry(() => import('@/layouts/WorkerLayout'));
const WorkerDashboard = lazyWithRetry(() => import('@/pages/worker/WorkerDashboard'));
const WorkerScan = lazyWithRetry(() => import('@/pages/worker/WorkerScan'));
const WorkerAttendance = lazyWithRetry(() => import('@/pages/worker/WorkerAttendance'));
const WorkerActivity = lazyWithRetry(() => import('@/pages/worker/WorkerActivity'));

export const router = createBrowserRouter([
  {
    element: <LazyOutlet />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },

      {
        element: <ProtectedRoute />,
        children: [
          { path: '/dashboard', element: <DashboardRedirect /> },
          { path: '/profile', element: <Profile /> },
        ],
      },

      {
        element: <ProtectedRoute allowedRoles={['admin']} />,
        children: [
          {
            path: '/admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminDashboard /> },
              { path: 'workers', element: <AdminWorkers /> },
              { path: 'fields', element: <AdminFields /> },
              { path: 'attendance', element: <AdminAttendance /> },
              { path: 'reports', element: <AdminReports /> },
              { path: 'history', element: <AdminHistory /> },
            ],
          },
        ],
      },

      {
        element: <ProtectedRoute allowedRoles={['worker']} />,
        children: [
          {
            path: '/worker',
            element: <WorkerLayout />,
            children: [
              { index: true, element: <WorkerDashboard /> },
              { path: 'scan', element: <WorkerScan /> },
              { path: 'attendance', element: <WorkerAttendance /> },
              { path: 'activity', element: <WorkerActivity /> },
            ],
          },
        ],
      },

      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
