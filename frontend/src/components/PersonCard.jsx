import { Link } from 'react-router-dom';

function departmentLabel(department) {
  if (!department) return 'No department listed';
  return `${department.code} — ${department.name}`;
}

export function PersonCard({ person, href, areaHref }) {
  const areas = person.researchAreas || [];

  return (
    <article className="person-card">
      <h2><Link to={href}>{person.fullName}</Link></h2>
      <p className="person-meta">
        {person.role === 'faculty' && person.designation ? `${person.designation} · ` : null}
        {person.role === 'alumni' && person.currentOrganization ? `${person.currentOrganization} · ` : null}
        {departmentLabel(person.department)}
      </p>
      {person.role === 'alumni' && person.batch ? <p className="person-meta">Batch {person.batch}</p> : null}
      {person.mentoringAvailability === true ? <p className="person-meta">Available for mentorship</p> : null}
      {person.mentoringAvailability === false ? <p className="person-meta">Not available for mentorship</p> : null}
      {person.bio ? <p className="clamp">{person.bio}</p> : null}
      {areas.length ? (
        <ul className="tag-list">
          {areas.map((area) => (
            <li key={area.id}>
              <Link className="tag" to={areaHref(area.id)}>{area.name}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
