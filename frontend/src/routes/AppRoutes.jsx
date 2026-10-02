import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { AdminGatePage } from '../features/admin/AdminGatePage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from '../features/system/NotFoundPage';
import { PublicOnly } from './PublicOnly';
import { RequireAuth } from './RequireAuth';
import { RequireRole } from './RequireRole';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      </Route>
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="admin"
          element={<RequireRole roles={['admin']}><AdminGatePage /></RequireRole>}
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
