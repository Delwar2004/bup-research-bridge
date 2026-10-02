import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { ActivityLogPage } from '../features/admin/ActivityLogPage';
import { AdminHomePage } from '../features/admin/AdminHomePage';
import { ReportPage } from '../features/admin/ReportPage';
import { ResearchAreaPage } from '../features/admin/ResearchAreaPage';
import { UserCreatePage } from '../features/admin/UserCreatePage';
import { UserDetailPage } from '../features/admin/UserDetailPage';
import { UserListPage } from '../features/admin/UserListPage';
import { LoginPage } from '../features/auth/LoginPage';
import { PasswordPage } from '../features/auth/PasswordPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DirectoryPage } from '../features/directory/DirectoryPage';
import { PersonPage } from '../features/directory/PersonPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { HomePage } from '../features/home/HomePage';
import { OpportunityDetailPage } from '../features/opportunities/OpportunityDetailPage';
import { OpportunityFormPage } from '../features/opportunities/OpportunityFormPage';
import { OpportunityListPage } from '../features/opportunities/OpportunityListPage';
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage';
import { ProjectFormPage } from '../features/projects/ProjectFormPage';
import { ProjectListPage } from '../features/projects/ProjectListPage';
import { MentorshipDetailPage } from '../features/mentorship/MentorshipDetailPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { MentorshipFormPage } from '../features/mentorship/MentorshipFormPage';
import { MentorshipListPage } from '../features/mentorship/MentorshipListPage';
import { SearchPage } from '../features/search/SearchPage';
import { PublicationDetailPage } from '../features/publications/PublicationDetailPage';
import { PublicationFormPage } from '../features/publications/PublicationFormPage';
import { PublicationListPage } from '../features/publications/PublicationListPage';
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
        <Route path="search" element={<SearchPage />} />
        <Route path="mentorship" element={<MentorshipListPage />} />
        <Route
          path="mentorship/new"
          element={<RequireRole roles={['student']}><MentorshipFormPage /></RequireRole>}
        />
        <Route path="mentorship/:requestId" element={<MentorshipDetailPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="opportunities" element={<OpportunityListPage />} />
        <Route
          path="opportunities/new"
          element={<RequireRole roles={['faculty', 'admin']}><OpportunityFormPage mode="create" /></RequireRole>}
        />
        <Route path="opportunities/:opportunityId/edit" element={<OpportunityFormPage mode="edit" />} />
        <Route path="opportunities/:opportunityId" element={<OpportunityDetailPage />} />
        <Route path="research-projects" element={<ProjectListPage />} />
        <Route
          path="research-projects/new"
          element={<RequireRole roles={['faculty', 'alumni', 'admin']}><ProjectFormPage mode="create" /></RequireRole>}
        />
        <Route path="research-projects/:projectId/edit" element={<ProjectFormPage mode="edit" />} />
        <Route path="research-projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="publications" element={<PublicationListPage />} />
        <Route
          path="publications/new"
          element={<RequireRole roles={['faculty', 'alumni', 'admin']}><PublicationFormPage mode="create" /></RequireRole>}
        />
        <Route path="publications/:publicationId/edit" element={<PublicationFormPage mode="edit" />} />
        <Route path="publications/:publicationId" element={<PublicationDetailPage />} />
        <Route path="faculty" element={<DirectoryPage kind="faculty" />} />
        <Route path="faculty/:userId" element={<PersonPage kind="faculty" />} />
        <Route path="alumni" element={<DirectoryPage kind="alumni" />} />
        <Route path="alumni/:userId" element={<PersonPage kind="alumni" />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="account/password" element={<PasswordPage />} />
        <Route path="admin" element={<RequireRole roles={['admin']}><AdminHomePage /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole roles={['admin']}><UserListPage /></RequireRole>} />
        <Route path="admin/users/new" element={<RequireRole roles={['admin']}><UserCreatePage /></RequireRole>} />
        <Route path="admin/users/:userId" element={<RequireRole roles={['admin']}><UserDetailPage /></RequireRole>} />
        <Route path="admin/activity-logs" element={<RequireRole roles={['admin']}><ActivityLogPage /></RequireRole>} />
        <Route path="admin/reports" element={<RequireRole roles={['admin']}><ReportPage /></RequireRole>} />
        <Route path="admin/research-areas" element={<RequireRole roles={['admin']}><ResearchAreaPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
