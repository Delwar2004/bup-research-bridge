const { AppError, conflict, validation } = require('./errors');

function fieldError(field, rule, message) {
  return validation([{ field, rule, message }]);
}

function mapDatabaseError(err) {
  if (!(err instanceof Error) || err instanceof AppError) return err;
  if (err.code === '23505') {
    const name = err.constraint || '';
    if (name.includes('email')) return conflict('An account with this email already exists.');
    if (name.includes('doi')) return conflict('A publication with this DOI already exists.');
    if (name.includes('mentorship_requests_one_pending')) {
      return conflict('A pending mentorship request already exists for this mentor.');
    }
    if (name.includes('slug')) return conflict('A research area with this slug already exists.');
    if (name.includes('research_areas_name')) return conflict('A research area with this name already exists.');
    if (name.includes('publication_authors_order')) {
      return fieldError('authors', 'unique', 'Author order must be unique within the publication.');
    }
    return conflict('This value is already in use.');
  }
  if (err.code === '23503') {
    return fieldError('id', 'reference', 'A related record does not exist.');
  }
  if (err.code === '23514' || err.code === '23502') {
    return fieldError('body', 'constraint', safeRuleMessage(err.message));
  }
  if (err.code === '22P02') {
    return new AppError(400, 'BAD_REQUEST', 'A value has the wrong format.', {});
  }
  return err;
}

function safeRuleMessage(message) {
  const text = String(message || '');
  const rules = [
    [/at least one research area/i, 'At least one research area is required.'],
    [/at least one member/i, 'At least one project member is required.'],
    [/at least one author/i, 'At least one author is required.'],
    [/academic profile required/i, 'The user must have a student, faculty, or alumni profile.'],
    [/is not active/i, 'The user must have an active account.'],
    [/has role/i, 'The user does not have the required role.'],
    [/profile can be created only/i, 'That profile does not match the account role.'],
    [/cannot remove the/i, 'The active profile cannot be removed.'],
    [/only the student or the mentor/i, 'Only the student or the mentor can post in this request.'],
    [/student profile required/i, 'A student profile is required.'],
    [/faculty profile required/i, 'A faculty profile is required.'],
    [/alumni profile required/i, 'An alumni profile is required.'],
    [/distinct/i, 'The student and the mentor must be different people.'],
  ];
  for (const [pattern, friendly] of rules) {
    if (pattern.test(text)) return friendly;
  }
  return 'The request conflicts with a data rule.';
}

module.exports = { mapDatabaseError };
