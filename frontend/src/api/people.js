import { apiRequest } from './client';
import { toQuery } from './query';

const DIRECTORY_PAGE = { pageSize: 100, sort: 'fullName', order: 'asc' };

export function listFaculty(params) {
  return apiRequest(`/faculty${toQuery(params)}`);
}

export function getFaculty(userId) {
  return apiRequest(`/faculty/${userId}`);
}

export function listAlumni(params) {
  return apiRequest(`/alumni${toQuery(params)}`);
}

export function getAlumni(userId) {
  return apiRequest(`/alumni/${userId}`);
}

export function listStudents(params) {
  return apiRequest(`/students${toQuery(params)}`);
}

export function personLabel(person) {
  if (!person?.role) return person?.fullName || '';
  const role = person.role.charAt(0).toUpperCase() + person.role.slice(1);
  return `${person.fullName} (${role})`;
}

export function withSelf(people, user) {
  if (!user?.id || !['student', 'faculty', 'alumni'].includes(user.role)) return people;
  if (people.some((person) => person.id === user.id)) return people;
  return [...people, { id: user.id, fullName: user.fullName, role: user.role }]
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

export async function listPeopleDirectory(params = DIRECTORY_PAGE) {
  const [facultyPayload, alumniPayload, studentPayload] = await Promise.all([
    listFaculty(params),
    listAlumni(params),
    listStudents(params),
  ]);
  const people = [];
  const seen = new Set();
  [...(facultyPayload.data || []), ...(alumniPayload.data || []), ...(studentPayload.data || [])].forEach((person) => {
    if (!person?.id || seen.has(person.id)) return;
    seen.add(person.id);
    people.push({ id: person.id, fullName: person.fullName, role: person.role });
  });
  people.sort((left, right) => left.fullName.localeCompare(right.fullName));
  const truncated = [facultyPayload, alumniPayload, studentPayload]
    .some((payload) => (payload.meta?.totalPages || 1) > 1);
  return { people, truncated };
}
