const ROLES = ['student', 'faculty', 'alumni', 'admin'];
const SELF_REGISTER_ROLES = ['student', 'faculty', 'alumni'];
const ACCOUNT_STATUS = ['pending', 'active', 'suspended', 'rejected'];
const MODERATION = ['draft', 'pending', 'approved', 'rejected', 'archived'];
const AVAILABILITY = ['open', 'closed', 'filled'];
const MENTORSHIP_STATUS = ['pending', 'accepted', 'rejected', 'cancelled', 'completed'];
const OPPORTUNITY_TYPES = ['thesis', 'research'];
const PROJECT_TYPES = ['thesis', 'research', 'academic_project'];
const MEMBER_ROLES = ['supervisor', 'co_supervisor', 'author'];
const NOTIFICATION_TYPES = [
  'opportunity_published',
  'mentorship_requested',
  'mentorship_updated',
  'message_received',
  'content_moderated',
  'account_updated',
];

const SEEDED_DEPARTMENTS = {
  CSE: '00000000-0000-4000-8000-000000000001',
  ICT: '00000000-0000-4000-8000-000000000002',
};

module.exports = {
  ROLES,
  SELF_REGISTER_ROLES,
  ACCOUNT_STATUS,
  MODERATION,
  AVAILABILITY,
  MENTORSHIP_STATUS,
  OPPORTUNITY_TYPES,
  PROJECT_TYPES,
  MEMBER_ROLES,
  NOTIFICATION_TYPES,
  SEEDED_DEPARTMENTS,
};
