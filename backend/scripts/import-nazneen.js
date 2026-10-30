const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { profile, publications } = require('../data/nazneenAkhter');

async function resolveReferenceData(client) {
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

async function upsertFaculty(client, departmentId) {
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

async function replaceFacultyAreas(client, userId, areaIds) {
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

async function upsertPublication(client, userId, publication, areaIds) {
  const existing = await client.query(
    'SELECT id, created_by_user_id FROM publications WHERE lower(doi) = lower($1)',
    [publication.doi],
  );

  let publicationId;
  if (existing.rows[0]) {
    if (existing.rows[0].created_by_user_id !== userId) {
      throw new Error(`DOI ${publication.doi} is already owned by another account.`);
    }
    publicationId = existing.rows[0].id;
    await client.query(
      `UPDATE publications SET
         created_by_user_id = $1,
         category = $2,
         title = $3,
         publication_year = $4,
         journal_name = $5,
         conference_name = $6,
         proceedings_title = $7,
         volume = $8,
         issue = $9,
         page_range = $10,
         publisher = $11,
         keywords = $12,
         doi = $13,
         url = $14,
         published_on = $15,
         moderation_status = 'approved'
       WHERE id = $16`,
      [...publicationParams(userId, publication), publicationId],
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

  await client.query(
    `INSERT INTO publication_authors (publication_id, user_id, author_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (publication_id, user_id) DO UPDATE
       SET author_order = EXCLUDED.author_order`,
    [publicationId, userId, publication.authorOrder],
  );
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

async function importNazneen() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const { departmentId, areaIds } = await resolveReferenceData(client);
    const userId = await upsertFaculty(client, departmentId);
    await replaceFacultyAreas(client, userId, areaIds);
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

if (require.main === module) {
  importNazneen()
    .then(({ userId, publicationCount }) => {
      console.log(`Imported ${profile.fullName} (${userId}) with ${publicationCount} publications.`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { importNazneen };
