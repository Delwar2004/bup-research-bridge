const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function resolveReferenceData(client, profile, publications) {
  const department = await client.query(
    'SELECT id FROM departments WHERE code = $1',
    [profile.departmentCode],
  );
  if (!department.rows[0]) {
    throw new Error(`Department ${profile.departmentCode} is missing. Run migrations first.`);
  }

  const slugs = [...new Set([
    ...profile.researchAreaSlugs,
    ...publications.flatMap((publication) => publication.researchAreaSlugs),
  ])];
  const areas = await client.query(
    'SELECT id, slug FROM research_areas WHERE slug = ANY($1::text[])',
    [slugs],
  );
  if (areas.rowCount !== slugs.length) {
    const found = new Set(areas.rows.map((area) => area.slug));
    const missing = slugs.filter((slug) => !found.has(slug));
    throw new Error(`Missing research areas: ${missing.join(', ')}. Run migrations first.`);
  }

  return {
    departmentId: department.rows[0].id,
    areaIds: new Map(areas.rows.map((area) => [area.slug, area.id])),
  };
}

async function upsertFaculty(client, profile, departmentId) {
  const existing = await client.query(
    'SELECT id, role FROM users WHERE email = $1',
    [profile.email],
  );

  let userId;
  if (existing.rows[0]) {
    if (existing.rows[0].role !== 'faculty') {
      throw new Error(`${profile.email} already belongs to a non-faculty account.`);
    }
    userId = existing.rows[0].id;
    await client.query(
      `UPDATE users
       SET full_name = $2, status = 'active'
       WHERE id = $1`,
      [userId, profile.fullName],
    );
  } else {
    const password = process.env.FACULTY_INITIAL_PASSWORD;
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      throw new Error('FACULTY_INITIAL_PASSWORD must be 8 to 72 characters when creating the faculty account.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'faculty', 'active')
       RETURNING id`,
      [profile.fullName, profile.email, passwordHash],
    );
    userId = created.rows[0].id;
  }

  await client.query(
    `INSERT INTO faculty (
       user_id, department_id, designation, mentoring_availability, profile_photo_url, bio
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       department_id = EXCLUDED.department_id,
       designation = EXCLUDED.designation,
       mentoring_availability = EXCLUDED.mentoring_availability,
       profile_photo_url = EXCLUDED.profile_photo_url,
       bio = EXCLUDED.bio`,
    [
      userId,
      departmentId,
      profile.designation,
      profile.mentoringAvailability,
      profile.profilePhotoUrl,
      profile.bio,
    ],
  );

  return userId;
}

async function replaceFacultyAreas(client, profile, userId, areaIds) {
  await client.query(
    'DELETE FROM faculty_research_areas WHERE faculty_user_id = $1',
    [userId],
  );
  await client.query(
    `INSERT INTO faculty_research_areas (faculty_user_id, research_area_id)
     SELECT $1, unnest($2::uuid[])`,
    [userId, profile.researchAreaSlugs.map((slug) => areaIds.get(slug))],
  );
}

function publicationParams(userId, publication) {
  return [
    userId,
    publication.category,
    publication.title,
    publication.publicationYear,
    publication.journalName || null,
    publication.conferenceName || null,
    publication.proceedingsTitle || null,
    publication.volume || null,
    publication.issue || null,
    publication.pageRange || null,
    publication.publisher || null,
    publication.keywords,
    publication.doi,
    publication.url,
    publication.publishedOn || null,
  ];
}

async function attachAuthor(client, publicationId, userId, requestedOrder) {
  const current = await client.query(
    `SELECT user_id, author_order
     FROM publication_authors
     WHERE publication_id = $1`,
    [publicationId],
  );
  const occupied = new Set(
    current.rows
      .filter((author) => author.user_id !== userId)
      .map((author) => author.author_order),
  );
  let authorOrder = requestedOrder;
  while (occupied.has(authorOrder)) authorOrder += 1;

  await client.query(
    `INSERT INTO publication_authors (publication_id, user_id, author_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (publication_id, user_id) DO UPDATE
       SET author_order = EXCLUDED.author_order`,
    [publicationId, userId, authorOrder],
  );
}

async function upsertPublication(client, userId, publication, areaIds) {
  const existing = await client.query(
    'SELECT id FROM publications WHERE lower(doi) = lower($1)',
    [publication.doi],
  );

  let publicationId;
  if (existing.rows[0]) {
    publicationId = existing.rows[0].id;
    await client.query(
      `UPDATE publications SET
         category = $1,
         title = $2,
         publication_year = $3,
         journal_name = $4,
         conference_name = $5,
         proceedings_title = $6,
         volume = $7,
         issue = $8,
         page_range = $9,
         publisher = $10,
         keywords = $11,
         doi = $12,
         url = $13,
         published_on = $14,
         moderation_status = 'approved'
       WHERE id = $15`,
      [...publicationParams(userId, publication).slice(1), publicationId],
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO publications (
         created_by_user_id, category, title, publication_year, journal_name,
         conference_name, proceedings_title, volume, issue, page_range,
         publisher, keywords, doi, url, published_on, moderation_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, 'approved'
       )
       RETURNING id`,
      publicationParams(userId, publication),
    );
    publicationId = inserted.rows[0].id;
  }

  await attachAuthor(client, publicationId, userId, publication.authorOrder);
  await client.query(
    `INSERT INTO publication_research_areas (publication_id, research_area_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [
      publicationId,
      publication.researchAreaSlugs.map((slug) => areaIds.get(slug)),
    ],
  );
}

async function importFaculty({ profile, publications }) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const { departmentId, areaIds } = await resolveReferenceData(client, profile, publications);
    const userId = await upsertFaculty(client, profile, departmentId);
    await replaceFacultyAreas(client, profile, userId, areaIds);
    for (const publication of publications) {
      await upsertPublication(client, userId, publication, areaIds);
    }
    await client.query('COMMIT');
    return { userId, publicationCount: publications.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

module.exports = { importFaculty };
