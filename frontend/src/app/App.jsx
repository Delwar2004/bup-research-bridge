import { SessionProvider } from '../auth/session';
import { AppRoutes } from '../routes/AppRoutes';

export default function App() {
  return (
    <SessionProvider>
      <AppRoutes />
    </SessionProvider>
  );
}
