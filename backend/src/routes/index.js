const express = require('express');
const { authenticate, optionalAuthenticate, requireRoles } = require('../middleware/authenticate');
const { send } = require('../middleware/errorHandler');
const { badRequest } = require('../utils/errors');
const { isUuid, parseQueryBool } = require('../validators/common');
const referenceRepository = require('../repositories/referenceRepository');
const { toResearchArea } = require('../utils/presenters');
const authService = require('../services/authService');
const profileService = require('../services/profileService');
const opportunityService = require('../services/opportunityService');
const projectService = require('../services/projectService');
const publicationService = require('../services/publicationService');
const mentorshipService = require('../services/mentorshipService');
const notificationService = require('../services/notificationService');
const searchService = require('../services/searchService');
const adminService = require('../services/adminService');

const router = express.Router();

function uuidParam(name) {
  return (req, res, next) => {
    if (!isUuid(req.params[name])) {
      return next(badRequest(`Path parameter ${name} must be a UUID.`));
    }
    return next();
  };
}

function handle(fn, status, message) {
  return async (req, res, next) => {
    try {
      const result = await fn(req);
      if (result && Object.prototype.hasOwnProperty.call(result, 'data')) {
        send(res, status, message, result.data, result.meta);
      } else {
        send(res, status, message, result === undefined ? null : result);
      }
    } catch (err) {
      next(err);
    }
  };
}

router.post('/auth/register', handle((req) => authService.register(req.body), 201, 'Account created and is waiting for an administrator to activate it.'));
router.post('/auth/login', handle((req) => authService.login(req.body, req), 200, 'Logged in.'));
router.post('/auth/refresh', handle((req) => authService.refresh(req.body), 200, 'Token refreshed.'));
router.post('/auth/logout', handle(async (req) => { await authService.logout(req.body); return null; }, 200, 'Logged out.'));
router.post('/auth/logout-all', authenticate, handle((req) => authService.logoutAll(req.user.id), 200, 'Logged out on every device.'));
router.get('/auth/me', authenticate, handle((req) => authService.me(req.user.id), 200, 'Current account retrieved.'));
router.post('/auth/password', authenticate, handle(async (req) => { await authService.changePassword(req.user.id, req.body); return null; }, 200, 'Password updated. Please log in again.'));

router.get('/departments', handle(async () => referenceRepository.listDepartments(), 200, 'Departments retrieved.'));
router.get('/research-areas', optionalAuthenticate, handle(async (req) => {
  const requested = parseQueryBool(req.query.includeInactive, 'includeInactive') === true;
  const includeInactive = requested && req.user && req.user.role === 'admin';
  const rows = await referenceRepository.listResearchAreas({ includeInactive });
  return rows.map(toResearchArea);
}, 200, 'Research areas retrieved.'));

router.patch('/me/profile', authenticate, handle((req) => profileService.updateMe(req.user, req.body), 200, 'Profile updated.'));
router.put('/me/research-areas', authenticate, handle((req) => profileService.replaceAreas(req.user, req.body), 200, 'Research areas updated.'));
router.get('/faculty', authenticate, handle((req) => profileService.listFaculty(req.user, req.query), 200, 'Faculty retrieved.'));
router.get('/faculty/:userId', authenticate, uuidParam('userId'), handle((req) => profileService.getFaculty(req.params.userId), 200, 'Faculty profile retrieved.'));
router.get('/alumni', authenticate, handle((req) => profileService.listAlumni(req.query), 200, 'Alumni retrieved.'));
router.get('/alumni/:userId/experiences', authenticate, uuidParam('userId'), handle((req) => profileService.listExperiences(req.params.userId), 200, 'Experiences retrieved.'));
router.get('/alumni/:userId', authenticate, uuidParam('userId'), handle((req) => profileService.getAlumni(req.params.userId), 200, 'Alumni profile retrieved.'));
router.get('/users/:userId', authenticate, uuidParam('userId'), handle((req) => profileService.getUser(req.user, req.params.userId), 200, 'Profile retrieved.'));

router.post('/me/experiences', authenticate, handle((req) => profileService.createExperience(req.user, req.body), 201, 'Experience created.'));
router.patch('/me/experiences/:experienceId', authenticate, uuidParam('experienceId'), handle((req) => profileService.updateExperience(req.user, req.params.experienceId, req.body), 200, 'Experience updated.'));
router.delete('/me/experiences/:experienceId', authenticate, uuidParam('experienceId'), handle((req) => profileService.removeExperience(req.user, req.params.experienceId), 200, 'Experience deleted.'));

router.post('/opportunities', authenticate, handle((req) => opportunityService.create(req.user, req.body), 201, 'Opportunity created.'));
router.get('/opportunities', authenticate, handle((req) => opportunityService.list(req.user, req.query), 200, 'Opportunities retrieved.'));
router.get('/opportunities/:opportunityId', authenticate, uuidParam('opportunityId'), handle((req) => opportunityService.get(req.user, req.params.opportunityId), 200, 'Opportunity retrieved.'));
router.patch('/opportunities/:opportunityId/availability', authenticate, uuidParam('opportunityId'), handle((req) => opportunityService.updateAvailability(req.user, req.params.opportunityId, req.body), 200, 'Availability updated.'));
router.post('/opportunities/:opportunityId/submit', authenticate, uuidParam('opportunityId'), handle((req) => opportunityService.submit(req.user, req.params.opportunityId, req.body), 200, 'Opportunity submitted for review.'));
router.patch('/opportunities/:opportunityId', authenticate, uuidParam('opportunityId'), handle((req) => opportunityService.update(req.user, req.params.opportunityId, req.body), 200, 'Opportunity updated.'));
router.delete('/opportunities/:opportunityId', authenticate, uuidParam('opportunityId'), handle((req) => opportunityService.remove(req.user, req.params.opportunityId), 200, 'Opportunity deleted.'));

router.post('/research-projects', authenticate, handle((req) => projectService.create(req.user, req.body), 201, 'Research project created.'));
router.get('/research-projects', authenticate, handle((req) => projectService.list(req.user, req.query), 200, 'Research projects retrieved.'));
router.get('/research-projects/:projectId', authenticate, uuidParam('projectId'), handle((req) => projectService.get(req.user, req.params.projectId), 200, 'Research project retrieved.'));
router.post('/research-projects/:projectId/submit', authenticate, uuidParam('projectId'), handle((req) => projectService.submit(req.user, req.params.projectId, req.body), 200, 'Research project submitted for review.'));
router.patch('/research-projects/:projectId', authenticate, uuidParam('projectId'), handle((req) => projectService.update(req.user, req.params.projectId, req.body), 200, 'Research project updated.'));
router.delete('/research-projects/:projectId', authenticate, uuidParam('projectId'), handle((req) => projectService.remove(req.user, req.params.projectId), 200, 'Research project deleted.'));

router.post('/publications', authenticate, handle((req) => publicationService.create(req.user, req.body), 201, 'Publication created.'));
router.get('/publications', authenticate, handle((req) => publicationService.list(req.user, req.query), 200, 'Publications retrieved.'));
router.get('/publications/:publicationId', authenticate, uuidParam('publicationId'), handle((req) => publicationService.get(req.user, req.params.publicationId), 200, 'Publication retrieved.'));
router.post('/publications/:publicationId/submit', authenticate, uuidParam('publicationId'), handle((req) => publicationService.submit(req.user, req.params.publicationId, req.body), 200, 'Publication submitted for review.'));
router.patch('/publications/:publicationId', authenticate, uuidParam('publicationId'), handle((req) => publicationService.update(req.user, req.params.publicationId, req.body), 200, 'Publication updated.'));
router.delete('/publications/:publicationId', authenticate, uuidParam('publicationId'), handle((req) => publicationService.remove(req.user, req.params.publicationId), 200, 'Publication deleted.'));

router.get('/search', authenticate, handle((req) => searchService.search(req.user, req.query), 200, 'Search completed.'));

router.post('/mentorship-requests', authenticate, handle((req) => mentorshipService.create(req.user, req.body), 201, 'Mentorship request submitted.'));
router.get('/mentorship-requests', authenticate, handle((req) => mentorshipService.list(req.user, req.query), 200, 'Mentorship requests retrieved.'));
router.get('/mentorship-requests/:requestId/messages', authenticate, uuidParam('requestId'), handle((req) => mentorshipService.listMessages(req.user, req.params.requestId, req.query), 200, 'Messages retrieved.'));
router.post('/mentorship-requests/:requestId/messages', authenticate, uuidParam('requestId'), handle((req) => mentorshipService.createMessage(req.user, req.params.requestId, req.body), 201, 'Message sent.'));
router.get('/mentorship-requests/:requestId', authenticate, uuidParam('requestId'), handle((req) => mentorshipService.get(req.user, req.params.requestId), 200, 'Mentorship request retrieved.'));
router.patch('/mentorship-requests/:requestId', authenticate, uuidParam('requestId'), handle((req) => mentorshipService.updateStatus(req.user, req.params.requestId, req.body), 200, 'Mentorship request updated.'));

router.get('/notifications/unread-count', authenticate, handle((req) => notificationService.unread(req.user), 200, 'Unread count retrieved.'));
router.post('/notifications/read-all', authenticate, handle((req) => notificationService.readAll(req.user), 200, 'Notifications marked as read.'));
router.get('/notifications', authenticate, handle((req) => notificationService.list(req.user, req.query), 200, 'Notifications retrieved.'));
router.patch('/notifications/:notificationId', authenticate, uuidParam('notificationId'), handle((req) => notificationService.update(req.user, req.params.notificationId, req.body), 200, 'Notification updated.'));

const admin = express.Router();
admin.use(authenticate, requireRoles('admin'));
admin.get('/users', handle((req) => adminService.listUsers(req.query), 200, 'Users retrieved.'));
admin.post('/users', handle((req) => adminService.createUser(req.user, req.body), 201, 'User created.'));
admin.get('/users/:userId', uuidParam('userId'), handle((req) => adminService.getUser(req.params.userId), 200, 'User retrieved.'));
admin.patch('/users/:userId/profile', uuidParam('userId'), handle((req) => adminService.updateProfile(req.user, req.params.userId, req.body), 200, 'Profile updated.'));
admin.post('/users/:userId/role', uuidParam('userId'), handle((req) => adminService.changeRole(req.user, req.params.userId, req.body), 200, 'Role updated.'));
admin.patch('/users/:userId', uuidParam('userId'), handle((req) => adminService.updateUser(req.user, req.params.userId, req.body), 200, 'User updated.'));
admin.patch('/opportunities/:opportunityId/moderation', uuidParam('opportunityId'), handle((req) => adminService.moderate(req.user, 'opportunity', req.params.opportunityId, req.body), 200, 'Opportunity moderated.'));
admin.patch('/research-projects/:projectId/moderation', uuidParam('projectId'), handle((req) => adminService.moderate(req.user, 'project', req.params.projectId, req.body), 200, 'Research project moderated.'));
admin.patch('/publications/:publicationId/moderation', uuidParam('publicationId'), handle((req) => adminService.moderate(req.user, 'publication', req.params.publicationId, req.body), 200, 'Publication moderated.'));
admin.get('/activity-logs', handle((req) => adminService.listActivity(req.query), 200, 'Activity logs retrieved.'));
admin.get('/reports/summary', handle((req) => adminService.report(req.query), 200, 'Report generated.'));
admin.post('/research-areas', handle((req) => adminService.createArea(req.user, req.body), 201, 'Research area created.'));
admin.patch('/research-areas/:researchAreaId', uuidParam('researchAreaId'), handle((req) => adminService.updateArea(req.user, req.params.researchAreaId, req.body), 200, 'Research area updated.'));
router.use('/admin', admin);

module.exports = router;
