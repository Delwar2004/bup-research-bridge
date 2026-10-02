import { useSession } from '../auth/session';
import { ForbiddenPage } from '../features/system/ForbiddenPage';

export function RequireRole({ roles, children }) {
  const { user } = useSession();
  if (!user || !roles.includes(user.role)) {
    return <ForbiddenPage />;
  }
  return children;
}
