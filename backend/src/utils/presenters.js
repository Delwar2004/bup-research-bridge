function iso(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function dateOnly(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function departmentOf(row) {
  if (!row.department_id) return null;
  return {
    id: row.department_id,
    code: row.department_code,
    name: row.department_name,
    description: row.department_description ?? null,
  };
}

function researchAreasOf(row) {
  const areas = row.research_areas || [];
  return areas.map((area) => ({
    id: area.id,
    slug: area.slug,
    name: area.name,
    description: area.description ?? null,
    isActive: area.isActive ?? area.is_active,
  }));
}

function toPublicProfile(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    department: departmentOf(row),
    batch: row.batch ?? null,
    designation: row.designation ?? null,
    mentoringAvailability: row.mentoring_availability ?? null,
    currentOrganization: row.current_organization ?? null,
    profilePhotoUrl: row.profile_photo_url ?? null,
    bio: row.bio ?? null,
    researchAreas: researchAreasOf(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toPrivateAccount(row) {
  return {
    ...toPublicProfile(row),
    email: row.email,
    status: row.status,
    lastLoginAt: iso(row.last_login_at),
  };
}

function toExperience(row) {
  return {
    id: row.id,
    organization: row.organization,
    positionTitle: row.position_title ?? null,
    description: row.description ?? null,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    isCurrent: row.is_current,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toOpportunity(row) {
  return {
    id: row.id,
    facultyUserId: row.faculty_user_id,
    facultyName: row.faculty_name,
    facultyAccountRole: row.faculty_account_role,
    designation: row.designation,
    mentoringAvailability: row.mentoring_availability,
    department: departmentOf(row),
    createdByUserId: row.created_by_user_id,
    opportunityType: row.opportunity_type,
    title: row.title,
    description: row.description,
    deadline: dateOnly(row.deadline),
    slots: row.slots ?? null,
    requiredSkills: row.required_skills ?? null,
    prerequisites: row.prerequisites ?? null,
    availabilityStatus: row.availability_status,
    moderationStatus: row.moderation_status,
    publishedAt: iso(row.published_at),
    researchAreas: researchAreasOf(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toProject(row) {
  return {
    id: row.id,
    department: departmentOf(row),
    opportunityId: row.opportunity_id ?? null,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    description: row.description ?? null,
    projectType: row.project_type,
    projectYear: row.project_year,
    externalLink: row.external_link ?? null,
    moderationStatus: row.moderation_status,
    publishedAt: iso(row.published_at),
    researchAreas: researchAreasOf(row),
    members: (row.members || []).map((member) => ({
      userId: member.userId,
      fullName: member.fullName,
      memberRole: member.memberRole,
    })),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toPublication(row) {
  return {
    id: row.id,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    abstract: row.abstract ?? null,
    venue: row.venue ?? null,
    publicationYear: row.publication_year ?? null,
    doi: row.doi ?? null,
    url: row.url ?? null,
    publishedOn: dateOnly(row.published_on),
    moderationStatus: row.moderation_status,
    publishedAt: iso(row.published_at),
    authors: (row.authors || []).map((author) => ({
      userId: author.userId,
      fullName: author.fullName,
      authorOrder: author.authorOrder,
    })),
    researchAreas: researchAreasOf(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMentorship(row) {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    studentName: row.student_name,
    mentorUserId: row.mentor_user_id,
    mentorName: row.mentor_name,
    mentorRole: row.mentor_role,
    opportunityId: row.opportunity_id ?? null,
    opportunityTitle: row.opportunity_title ?? null,
    subject: row.subject,
    status: row.status,
    respondedAt: iso(row.responded_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMessage(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: iso(row.created_at),
  };
}

function toNotification(row) {
  return {
    id: row.id,
    notificationType: row.notification_type,
    message: row.message,
    isRead: row.is_read,
    readAt: iso(row.read_at),
    opportunityId: row.opportunity_id ?? null,
    mentorshipRequestId: row.mentorship_request_id ?? null,
    payload: row.payload || {},
    createdAt: iso(row.created_at),
  };
}

function toActivity(row) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    actorName: row.actor_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    summary: row.summary ?? null,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  };
}

function toResearchArea(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    isActive: row.is_active,
  };
}

module.exports = {
  toPublicProfile,
  toPrivateAccount,
  toExperience,
  toOpportunity,
  toProject,
  toPublication,
  toMentorship,
  toMessage,
  toNotification,
  toActivity,
  toResearchArea,
};
