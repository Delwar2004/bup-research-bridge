const { execFileSync } = require('child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32';
process.env.DATABASE_URL = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('test')
  ? process.env.DATABASE_URL
  : 'postgres:///bup_research_bridge_test?host=/var/run/postgresql';
process.env.CORS_ORIGIN = '';

const CSE = '00000000-0000-4000-8000-000000000001';
const ML = '00000000-0000-4000-8000-000000000102';

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const app = createApp();

function ensureDatabase() {
  try {
    execFileSync('psql', ['postgres:///postgres?host=/var/run/postgresql', '-c', 'CREATE DATABASE bup_research_bridge_test'], { stdio: 'pipe' });
  } catch (err) {
    if (!String(err.stderr || err.message).includes('already exists')) throw err;
  }
}

function migrate() {
  execFileSync('node', ['scripts/migrate.js'], {
    cwd: require('path').join(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}

async function reset() {
  await query(`
    TRUNCATE TABLE
      activity_logs,
      notifications,
      mentorship_messages,
      mentorship_requests,
      publication_research_areas,
      publication_authors,
      publications,
      project_members,
      project_research_areas,
      research_projects,
      opportunity_research_areas,
      thesis_opportunities,
      alumni_experiences,
      alumni_research_areas,
      faculty_research_areas,
      student_research_areas,
      refresh_tokens,
      alumni,
      faculty,
      students,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function adminToken() {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('AdminPass123', 4);
  await query(
    `INSERT INTO users (full_name, email, password_hash, role, status)
     VALUES ('Admin User', 'admin@bup.test', $1, 'admin', 'active')`,
    [hash],
  );
  const login = await request(app).post('/api/v1/auth/login').send({
    email: 'admin@bup.test',
    password: 'AdminPass123',
  });
  assert.equal(login.status, 200);
  return login.body.data.accessToken;
}

async function register(role, extra) {
  const response = await request(app).post('/api/v1/auth/register').send({
    fullName: `${role} Person`,
    email: `${role}@bup.test`,
    password: 'password123',
    role,
    departmentId: CSE,
    ...extra,
  });
  return response;
}

async function activate(token, email) {
  const listed = await request(app)
    .get('/api/v1/admin/users')
    .set('Authorization', `Bearer ${token}`)
    .query({ q: email });
  assert.equal(listed.status, 200);
  const id = listed.body.data[0].id;
  const updated = await request(app)
    .patch(`/api/v1/admin/users/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'active' });
  assert.equal(updated.status, 200);
  return id;
}

async function login(email, password = 'password123') {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

test.before(async () => {
  ensureDatabase();
  try {
    await query('SELECT 1 FROM departments LIMIT 1');
  } catch {
    migrate();
  }
  const seeded = await query('SELECT count(*)::int AS total FROM departments');
  if (!seeded.rows[0].total) migrate();
});

test.beforeEach(async () => {
  await reset();
});

test.after(async () => {
  await closePool();
});

test('public registration stays pending and duplicate email conflicts', async () => {
  const created = await register('student', { batch: 'BICE-2024' });
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.data.status, 'pending');
  assert.equal(created.body.data.passwordHash, undefined);
  const again = await register('student', { batch: 'BICE-2024' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'CONFLICT');
  const adminAttempt = await request(app).post('/api/v1/auth/register').send({
    fullName: 'Bad Admin',
    email: 'bad-admin@bup.test',
    password: 'password123',
    role: 'admin',
  });
  assert.equal(adminAttempt.status, 422);
});

test('login hides inactive accounts until the password matches', async () => {
  await register('faculty', { designation: 'Lecturer' });
  const wrong = await login('faculty@bup.test', 'wrong-password');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'UNAUTHORIZED');
  const pending = await login('faculty@bup.test');
  assert.equal(pending.status, 403);
  assert.equal(pending.body.error.code, 'ACCOUNT_PENDING');
  const missing = await request(app).get('/api/v1/faculty');
  assert.equal(missing.status, 401);
});

test('faculty opportunity, approval notifications, and mentorship', async () => {
  const token = await adminToken();
  await register('faculty', { designation: 'Professor', researchAreaIds: [ML] });
  await register('student', { batch: 'BICE-2024', researchAreaIds: [ML] });
  const facultyId = await activate(token, 'faculty@bup.test');
  const studentId = await activate(token, 'student@bup.test');
  const facultyLogin = await login('faculty@bup.test');
  const studentLogin = await login('student@bup.test');
  const facultyToken = facultyLogin.body.data.accessToken;
  const studentToken = studentLogin.body.data.accessToken;

  const denied = await request(app)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ opportunityType: 'thesis', title: 'Nope', description: 'Not allowed for students.' });
  assert.equal(denied.status, 403);

  const draft = await request(app)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({
      opportunityType: 'thesis',
      title: 'Secure systems thesis',
      description: 'Study secure software for the department.',
      researchAreaIds: [ML],
    });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.moderationStatus, 'draft');
  const hidden = await request(app)
    .get(`/api/v1/opportunities/${draft.body.data.id}`)
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(hidden.status, 404);

  const approved = await request(app)
    .patch(`/api/v1/admin/opportunities/${draft.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.availabilityStatus, 'open');
  assert.ok(approved.body.data.publishedAt);

  const visible = await request(app)
    .get('/api/v1/opportunities')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(visible.status, 200);
  assert.equal(visible.body.data.length, 1);

  const notes = await request(app)
    .get('/api/v1/notifications')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(notes.status, 200);
  assert.equal(notes.body.data.some((item) => item.notificationType === 'opportunity_published'), true);

  const requestRow = await request(app)
    .post('/api/v1/mentorship-requests')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      mentorUserId: facultyId,
      opportunityId: draft.body.data.id,
      subject: 'Thesis supervision',
      message: 'I would like to work on this topic.',
    });
  assert.equal(requestRow.status, 201);
  assert.equal(requestRow.body.data.status, 'pending');
  assert.equal(requestRow.body.data.initialMessage.body, 'I would like to work on this topic.');

  const duplicate = await request(app)
    .post('/api/v1/mentorship-requests')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      mentorUserId: facultyId,
      opportunityId: draft.body.data.id,
      subject: 'Again',
      message: 'Second try.',
    });
  assert.equal(duplicate.status, 409);

  const accepted = await request(app)
    .patch(`/api/v1/mentorship-requests/${requestRow.body.data.id}`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ status: 'accepted' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.status, 'accepted');

  const outsider = await request(app)
    .get(`/api/v1/mentorship-requests/${requestRow.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(outsider.status, 404);

  const reply = await request(app)
    .post(`/api/v1/mentorship-requests/${requestRow.body.data.id}/messages`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ body: 'Welcome to the project.' });
  assert.equal(reply.status, 201);

  const studentNotes = await request(app)
    .get('/api/v1/notifications')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(studentNotes.body.data.some((item) => item.notificationType === 'mentorship_updated'), true);
  assert.equal(studentNotes.body.data.some((item) => item.notificationType === 'message_received'), true);

  const faculty = await request(app)
    .get('/api/v1/faculty')
    .query({ researchAreaId: ML })
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(faculty.status, 200);
  assert.equal(faculty.body.data[0].id, facultyId);
  assert.equal(faculty.body.data[0].email, undefined);

  const self = await request(app)
    .get(`/api/v1/users/${studentId}`)
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(self.status, 404);

  assert.ok(studentId);
});

test('publications, repository search, and admin report', async () => {
  const token = await adminToken();
  await register('alumni', { batch: '2018', currentOrganization: 'BUP Lab' });
  const alumniId = await activate(token, 'alumni@bup.test');
  const alumniLogin = await login('alumni@bup.test');
  const alumniToken = alumniLogin.body.data.accessToken;

  const publication = await request(app)
    .post('/api/v1/publications')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({
      title: 'Learning systems paper',
      publicationYear: 2024,
      doi: '10.1000/test.doi',
      researchAreaIds: [ML],
      authors: [{ userId: alumniId, authorOrder: 1 }],
      moderationStatus: 'pending',
    });
  assert.equal(publication.status, 201);
  const conflict = await request(app)
    .post('/api/v1/publications')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({ title: 'Other', doi: '10.1000/TEST.DOI' });
  assert.equal(conflict.status, 409);

  const project = await request(app)
    .post('/api/v1/research-projects')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({
      departmentId: CSE,
      title: 'Earlier thesis on learning',
      projectType: 'thesis',
      projectYear: 2018,
      researchAreaIds: [ML],
      members: [{ userId: alumniId, memberRole: 'author' }],
    });
  assert.equal(project.status, 201);
  const moderated = await request(app)
    .patch(`/api/v1/admin/research-projects/${project.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved', note: 'Looks complete.' });
  assert.equal(moderated.status, 200);

  const found = await request(app)
    .get('/api/v1/search')
    .query({ q: 'learning', type: 'research_projects' })
    .set('Authorization', `Bearer ${alumniToken}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.data.items.length, 1);

  const report = await request(app)
    .get('/api/v1/admin/reports/summary')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(report.status, 200);
  assert.equal(typeof report.body.data.usersByRole.alumni, 'number');
  assert.equal(report.body.data.projectsByModeration.approved, 1);

  const forbidden = await request(app)
    .get('/api/v1/admin/activity-logs')
    .set('Authorization', `Bearer ${alumniToken}`);
  assert.equal(forbidden.status, 403);

  const experience = await request(app)
    .post('/api/v1/me/experiences')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({ organization: 'BUP Lab', positionTitle: 'Researcher', isCurrent: true });
  assert.equal(experience.status, 201);
  const shared = await request(app)
    .get(`/api/v1/alumni/${alumniId}/experiences`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(shared.status, 200);
  assert.equal(shared.body.data.length, 1);
});

test('remaining contract paths for profiles, content, and administration', async () => {
  const token = await adminToken();
  await register('faculty', { designation: 'Lecturer' });
  await register('student', { batch: 'BICE-2023' });
  await register('alumni', { batch: '2016' });
  const facultyId = await activate(token, 'faculty@bup.test');
  const studentId = await activate(token, 'student@bup.test');
  await activate(token, 'alumni@bup.test');
  const facultyToken = (await login('faculty@bup.test')).body.data.accessToken;
  const studentToken = (await login('student@bup.test')).body.data.accessToken;
  const alumniToken = (await login('alumni@bup.test')).body.data.accessToken;

  const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${studentToken}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.email, 'student@bup.test');

  const areas = await request(app).get('/api/v1/research-areas');
  assert.equal(areas.status, 200);
  assert.ok(areas.body.data.length >= 1);

  const patched = await request(app)
    .patch('/api/v1/me/profile')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ bio: 'Networks and security.' });
  assert.equal(patched.status, 200);
  const replaced = await request(app)
    .put('/api/v1/me/research-areas')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ researchAreaIds: [ML] });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.data.researchAreas.length, 1);

  const alumniList = await request(app).get('/api/v1/alumni').set('Authorization', `Bearer ${studentToken}`);
  assert.equal(alumniList.status, 200);
  assert.equal(alumniList.body.data.length, 1);
  const alumniProfile = await request(app).get(`/api/v1/alumni/${alumniList.body.data[0].id}`).set('Authorization', `Bearer ${studentToken}`);
  assert.equal(alumniProfile.status, 200);
  const own = await request(app).get(`/api/v1/users/${studentId}`).set('Authorization', `Bearer ${studentToken}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.email, 'student@bup.test');

  const badDates = await request(app)
    .post('/api/v1/me/experiences')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({ organization: 'Lab', startDate: '2020-05-01', endDate: '2019-01-01' });
  assert.equal(badDates.status, 422);
  const experience = await request(app)
    .post('/api/v1/me/experiences')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({ organization: 'Lab', isCurrent: true });
  const edited = await request(app)
    .patch(`/api/v1/me/experiences/${experience.body.data.id}`)
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({ positionTitle: 'Engineer' });
  assert.equal(edited.status, 200);
  const removed = await request(app)
    .delete(`/api/v1/me/experiences/${experience.body.data.id}`)
    .set('Authorization', `Bearer ${alumniToken}`);
  assert.equal(removed.status, 200);

  const opening = await request(app)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ opportunityType: 'research', title: 'Lab opening', description: 'A current opening for students.' });
  assert.equal(opening.status, 201);
  const submitted = await request(app)
    .post(`/api/v1/opportunities/${opening.body.data.id}/submit`)
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.moderationStatus, 'pending');
  const missingArea = await request(app)
    .patch(`/api/v1/admin/opportunities/${opening.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  assert.equal(missingArea.status, 422);
  const withArea = await request(app)
    .patch(`/api/v1/opportunities/${opening.body.data.id}`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ researchAreaIds: [ML] });
  assert.equal(withArea.status, 200);
  const approved = await request(app)
    .patch(`/api/v1/admin/opportunities/${opening.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  assert.equal(approved.status, 200);
  const closed = await request(app)
    .patch(`/api/v1/opportunities/${opening.body.data.id}/availability`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ availabilityStatus: 'closed' });
  assert.equal(closed.status, 200);
  const listedClosed = await request(app)
    .get('/api/v1/opportunities')
    .query({ availabilityStatus: 'closed' })
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(listedClosed.body.data.length, 1);

  const project = await request(app)
    .post('/api/v1/research-projects')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ departmentId: CSE, title: 'Old thesis', projectType: 'thesis', projectYear: 2020 });
  assert.equal(project.status, 201);
  const projectSubmit = await request(app)
    .post(`/api/v1/research-projects/${project.body.data.id}/submit`)
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(projectSubmit.status, 200);
  const projectPatched = await request(app)
    .patch(`/api/v1/research-projects/${project.body.data.id}`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({
      description: 'Completed work.',
      researchAreaIds: [ML],
      members: [{ userId: facultyId, memberRole: 'supervisor' }],
    });
  assert.equal(projectPatched.status, 200);
  const projectApproved = await request(app)
    .patch(`/api/v1/admin/research-projects/${project.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  assert.equal(projectApproved.status, 200);
  const projectGet = await request(app)
    .get(`/api/v1/research-projects/${project.body.data.id}`)
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(projectGet.status, 200);
  const projectList = await request(app)
    .get('/api/v1/research-projects')
    .query({ q: 'thesis' })
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(projectList.status, 200);

  const publication = await request(app)
    .post('/api/v1/publications')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ title: 'Draft note' });
  assert.equal(publication.status, 201);
  const bareApprove = await request(app)
    .patch(`/api/v1/admin/publications/${publication.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  assert.equal(bareApprove.status, 422);
  const publicationPatched = await request(app)
    .patch(`/api/v1/publications/${publication.body.data.id}`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ authors: [{ userId: facultyId, authorOrder: 1 }], researchAreaIds: [ML] });
  assert.equal(publicationPatched.status, 200);
  const publicationSubmitted = await request(app)
    .post(`/api/v1/publications/${publication.body.data.id}/submit`)
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(publicationSubmitted.status, 200);
  const publicationApproved = await request(app)
    .patch(`/api/v1/admin/publications/${publication.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  assert.equal(publicationApproved.status, 200);
  const publicationList = await request(app)
    .get('/api/v1/publications')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(publicationList.body.data.length, 1);
  const publicationGet = await request(app)
    .get(`/api/v1/publications/${publication.body.data.id}`)
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(publicationGet.status, 200);

  const draftOnly = await request(app)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ opportunityType: 'thesis', title: 'Disposable', description: 'Can be removed.' });
  const deleted = await request(app)
    .delete(`/api/v1/opportunities/${draftOnly.body.data.id}`)
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(deleted.status, 200);

  const searchFaculty = await request(app)
    .get('/api/v1/search')
    .query({ q: 'faculty', type: 'faculty' })
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(searchFaculty.status, 200);
  const emptySearch = await request(app)
    .get('/api/v1/search')
    .query({ q: ' ', type: 'publications' })
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(emptySearch.status, 422);

  const mentoring = await request(app)
    .post('/api/v1/mentorship-requests')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ mentorUserId: facultyId, subject: 'General', message: 'Hello.' });
  assert.equal(mentoring.status, 201);
  const blockedDelete = await request(app)
    .delete(`/api/v1/opportunities/${opening.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(blockedDelete.status, 200);
  const blockedByRequest = await request(app)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({
      opportunityType: 'thesis',
      title: 'Linked opening',
      description: 'Students can request this.',
      researchAreaIds: [ML],
      moderationStatus: 'pending',
    });
  await request(app)
    .patch(`/api/v1/admin/opportunities/${blockedByRequest.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'approved' });
  const linked = await request(app)
    .post('/api/v1/mentorship-requests')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      mentorUserId: facultyId,
      opportunityId: blockedByRequest.body.data.id,
      subject: 'Linked',
      message: 'Please supervise this opening.',
    });
  assert.equal(linked.status, 201);
  const cannotDelete = await request(app)
    .delete(`/api/v1/opportunities/${blockedByRequest.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(cannotDelete.status, 409);

  const inbox = await request(app)
    .get('/api/v1/mentorship-requests')
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(inbox.status, 200);
  const thread = await request(app)
    .get(`/api/v1/mentorship-requests/${linked.body.data.id}/messages`)
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(thread.status, 200);
  assert.equal(thread.body.data.length, 1);

  const unread = await request(app)
    .get('/api/v1/notifications/unread-count')
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.ok(unread.body.data.unreadCount >= 1);
  const firstNote = (await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${facultyToken}`)).body.data[0];
  const marked = await request(app)
    .patch(`/api/v1/notifications/${firstNote.id}`)
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ isRead: true });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.data.isRead, true);
  const allRead = await request(app)
    .post('/api/v1/notifications/read-all')
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(allRead.status, 200);

  const createdAdmin = await request(app)
    .post('/api/v1/admin/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Second Admin', email: 'second@bup.test', password: 'password123', role: 'admin', status: 'active' });
  assert.equal(createdAdmin.status, 201);
  const detail = await request(app)
    .get(`/api/v1/admin/users/${studentId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(detail.status, 200);
  const graduated = await request(app)
    .post(`/api/v1/admin/users/${studentId}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role: 'alumni', profile: { departmentId: CSE, batch: 'BICE-2023' } });
  assert.equal(graduated.status, 200);
  assert.equal(graduated.body.data.role, 'alumni');
  const profileEdit = await request(app)
    .patch(`/api/v1/admin/users/${facultyId}/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({ designation: 'Associate Professor' });
  assert.equal(profileEdit.status, 200);

  const slug = `edge-${Date.now()}`;
  const area = await request(app)
    .post('/api/v1/admin/research-areas')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, name: `Edge ${slug}` });
  assert.equal(area.status, 201);
  const areaUpdated = await request(app)
    .patch(`/api/v1/admin/research-areas/${area.body.data.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isActive: false });
  assert.equal(areaUpdated.status, 200);
  assert.equal(areaUpdated.body.data.isActive, false);

  const badId = await request(app)
    .get('/api/v1/faculty/not-a-uuid')
    .set('Authorization', `Bearer ${studentToken}`);
  assert.equal(badId.status, 400);
  const badJson = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":');
  assert.equal(badJson.status, 400);

  const session = await login('faculty@bup.test');
  const refreshed = await request(app).post('/api/v1/auth/refresh').send({
    refreshToken: session.body.data.refreshToken,
  });
  assert.equal(refreshed.status, 200);
  const stale = await request(app).post('/api/v1/auth/refresh').send({
    refreshToken: session.body.data.refreshToken,
  });
  assert.equal(stale.status, 401);
  const changed = await request(app)
    .post('/api/v1/auth/password')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ currentPassword: 'password123', newPassword: 'new-password-123' });
  assert.equal(changed.status, 200);
  const oldSession = await request(app).post('/api/v1/auth/refresh').send({
    refreshToken: refreshed.body.data.refreshToken,
  });
  assert.equal(oldSession.status, 401);
  const relogin = await login('faculty@bup.test', 'new-password-123');
  assert.equal(relogin.status, 200);
  const loggedOut = await request(app)
    .post('/api/v1/auth/logout-all')
    .set('Authorization', `Bearer ${relogin.body.data.accessToken}`);
  assert.equal(loggedOut.status, 200);
  assert.ok(loggedOut.body.data.revokedCount >= 1);
});

test('deletes, faculty detail, search types, and activity logs', async () => {
  const token = await adminToken();
  await register('faculty', { designation: 'Lecturer' });
  await register('alumni', { batch: '2015' });
  const facultyId = await activate(token, 'faculty@bup.test');
  await activate(token, 'alumni@bup.test');
  const facultyToken = (await login('faculty@bup.test')).body.data.accessToken;
  const alumniToken = (await login('alumni@bup.test')).body.data.accessToken;

  const faculty = await request(app).get(`/api/v1/faculty/${facultyId}`).set('Authorization', `Bearer ${alumniToken}`);
  assert.equal(faculty.status, 200);
  assert.equal(faculty.body.data.designation, 'Lecturer');

  const project = await request(app)
    .post('/api/v1/research-projects')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({ departmentId: CSE, title: 'Throwaway project', projectType: 'academic_project', projectYear: 2021 });
  const projectGone = await request(app)
    .delete(`/api/v1/research-projects/${project.body.data.id}`)
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(projectGone.status, 200);

  const publication = await request(app)
    .post('/api/v1/publications')
    .set('Authorization', `Bearer ${alumniToken}`)
    .send({ title: 'Throwaway paper' });
  const publicationGone = await request(app)
    .delete(`/api/v1/publications/${publication.body.data.id}`)
    .set('Authorization', `Bearer ${alumniToken}`);
  assert.equal(publicationGone.status, 200);

  const opening = await request(app)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${facultyToken}`)
    .send({
      opportunityType: 'research',
      title: 'Searchable opening',
      description: 'Keyword alpha-bridge for discovery.',
      researchAreaIds: [ML],
      moderationStatus: 'pending',
    });
  const rejected = await request(app)
    .patch(`/api/v1/admin/opportunities/${opening.body.data.id}/moderation`)
    .set('Authorization', `Bearer ${token}`)
    .send({ moderationStatus: 'rejected' });
  assert.equal(rejected.status, 200);

  const logs = await request(app).get('/api/v1/admin/activity-logs').set('Authorization', `Bearer ${token}`);
  assert.equal(logs.status, 200);
  assert.ok(logs.body.data.some((row) => row.action === 'opportunity.moderated'));

  const byOpportunity = await request(app)
    .get('/api/v1/search')
    .query({ q: 'alpha-bridge', type: 'opportunities' })
    .set('Authorization', `Bearer ${token}`);
  assert.equal(byOpportunity.status, 200);
  const byAlumni = await request(app)
    .get('/api/v1/search')
    .query({ q: 'alumni', type: 'alumni' })
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(byAlumni.status, 200);
  assert.equal(byAlumni.body.data.items.length, 1);
  const byPublication = await request(app)
    .get('/api/v1/search')
    .query({ q: 'nothing-matches-xyz', type: 'publications' })
    .set('Authorization', `Bearer ${facultyToken}`);
  assert.equal(byPublication.status, 200);
  assert.equal(byPublication.body.data.items.length, 0);
});

test('validation and logout revoke refresh tokens', async () => {
  const departments = await request(app).get('/api/v1/departments');
  assert.equal(departments.status, 200);
  assert.ok(departments.body.data.some((row) => row.code === 'CSE'));

  const bad = await request(app).post('/api/v1/auth/register').send({
    fullName: 'Short',
    email: 'not-an-email',
    password: 'short',
    role: 'student',
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');

  const token = await adminToken();
  const loginResponse = await login('admin@bup.test', 'AdminPass123');
  const refreshToken = loginResponse.body.data.refreshToken;
  const loggedOut = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
  assert.equal(loggedOut.status, 200);
  const reused = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
  assert.equal(reused.status, 401);
  assert.ok(token);
});
