import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import LazyOutlet from '@/components/LazyOutlet';

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
const WorkerLayout = lazy(() => import('@/layouts/WorkerLayout'));
const WorkerDashboard = lazy(() => import('@/pages/worker/WorkerDashboard'));
const WorkerScan = lazy(() => import('@/pages/worker/WorkerScan'));
const WorkerAttendance = lazy(() => import('@/pages/worker/WorkerAttendance'));
const WorkerActivity = lazy(() => import('@/pages/worker/WorkerActivity'));

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
