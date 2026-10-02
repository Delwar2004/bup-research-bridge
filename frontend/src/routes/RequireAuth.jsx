import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../auth/session';
import { LoadingState } from '../components/LoadingState';

export function RequireAuth({ children }) {
  const location = useLocation();
  const { status, isAuthenticated } = useSession();

  if (status === 'loading') {
    return <LoadingState label="Checking your session" />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
