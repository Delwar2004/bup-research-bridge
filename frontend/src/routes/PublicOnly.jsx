import { Navigate } from 'react-router-dom';
import { useSession } from '../auth/session';
import { LoadingState } from '../components/LoadingState';

export function PublicOnly({ children }) {
  const { status, isAuthenticated } = useSession();

  if (status === 'loading') {
    return <LoadingState label="Checking your session" />;
  }
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
