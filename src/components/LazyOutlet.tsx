import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import LoadingScreen from '@/components/LoadingScreen';

export default function LazyOutlet() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Outlet />
    </Suspense>
  );
}
