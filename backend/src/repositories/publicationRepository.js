const PUB_FROM = `FROM publications p`;

const PUB_SELECT = `
SELECT
  p.id,
  p.created_by_user_id,
  p.title,
  p.abstract,
  p.venue,
  p.publication_year,
  p.doi,
  p.url,
  p.published_on,
  p.moderation_status,
  p.published_at,
  p.created_at,
  p.updated_at,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'id', ra.id, 'slug', ra.slug, 'name', ra.name::text,
      'description', ra.description, 'isActive', ra.is_active
    ) ORDER BY ra.name::text), '[]'::json)
    FROM publication_research_areas pra
    JOIN research_areas ra ON ra.id = pra.research_area_id
    WHERE pra.publication_id = p.id
  ) AS research_areas,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'userId', pa.user_id, 'fullName', u.full_name, 'authorOrder', pa.author_order
    ) ORDER BY pa.author_order), '[]'::json)
    FROM publication_authors pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.publication_id = p.id
  ) AS authors
${PUB_FROM}
`;

async function insertPublication(db, row) {
  const { rows } = await db.query(
    `INSERT INTO publications (
       created_by_user_id, title, abstract, venue, publication_year, doi, url, published_on, moderation_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      row.createdByUserId,
      row.title,
      row.abstract,
      row.venue,
      row.publicationYear,
      row.doi,
      row.url,
      row.publishedOn,
      row.moderationStatus,
    ],
  );
  return rows[0].id;
}

async function replaceAreas(db, publicationId, areaIds) {
  await db.query(`DELETE FROM publication_research_areas WHERE publication_id = $1`, [publicationId]);
  if (!areaIds.length) return;
  await db.query(
    `INSERT INTO publication_research_areas (publication_id, research_area_id)
     SELECT $1, unnest($2::uuid[])`,
    [publicationId, areaIds],
  );
}

async function replaceAuthors(db, publicationId, authors) {
  await db.query(`DELETE FROM publication_authors WHERE publication_id = $1`, [publicationId]);
  for (const author of authors) {
    await db.query(
      `INSERT INTO publication_authors (publication_id, user_id, author_order) VALUES ($1, $2, $3)`,
      [publicationId, author.userId, author.authorOrder],
    );
  }
}

async function findById(db, id) {
  const { rows } = await db.query(`${PUB_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

function buildFilters(filters) {
  const clauses = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('$?', `$${params.length}`));
  };
  if (filters.q) add(`p.search_vector @@ websearch_to_tsquery('english', $?)`, filters.q);
  if (filters.authorUserId) {
    add(`EXISTS (SELECT 1 FROM publication_authors pa WHERE pa.publication_id = p.id AND pa.user_id = $?)`, filters.authorUserId);
  }
  if (filters.yearFrom != null) add(`p.publication_year >= $?`, filters.yearFrom);
  if (filters.yearTo != null) add(`p.publication_year <= $?`, filters.yearTo);
  if (filters.venue) add(`p.venue ILIKE $? ESCAPE '\\'`, filters.venue);
  if (filters.mineUserId) add(`p.created_by_user_id = $?`, filters.mineUserId);
  if (filters.moderationStatus) add(`p.moderation_status = $?`, filters.moderationStatus);
  if (filters.areaIds && filters.areaIds.length) {
    params.push(filters.areaIds);
    const ref = `$${params.length}::uuid[]`;
    if (filters.areaMatch === 'all') {
      clauses.push(`(
        SELECT count(DISTINCT research_area_id) FROM publication_research_areas
        WHERE publication_id = p.id AND research_area_id = ANY(${ref})
      ) = ${filters.areaIds.length}`);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM publication_research_areas
        WHERE publication_id = p.id AND research_area_id = ANY(${ref})
      )`);
    }
  }
  return { where: clauses.join(' AND '), params };
}

async function list(db, filters, paging) {
  const { where, params } = buildFilters(filters);
  const count = await db.query(`SELECT count(*)::int AS total ${PUB_FROM} WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `${PUB_SELECT} WHERE ${where}
     ORDER BY ${paging.orderBy}, p.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function updatePublication(db, id, fields) {
  const sets = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.title !== undefined) push('title', fields.title);
  if (fields.abstract !== undefined) push('abstract', fields.abstract);
  if (fields.venue !== undefined) push('venue', fields.venue);
  if (fields.publicationYear !== undefined) push('publication_year', fields.publicationYear);
  if (fields.doi !== undefined) push('doi', fields.doi);
  if (fields.url !== undefined) push('url', fields.url);
  if (fields.publishedOn !== undefined) push('published_on', fields.publishedOn);
  if (fields.moderationStatus !== undefined) push('moderation_status', fields.moderationStatus);
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE publications SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function deletePublication(db, id) {
  const { rowCount } = await db.query(`DELETE FROM publications WHERE id = $1`, [id]);
  return rowCount;
}

module.exports = {
  insertPublication,
  replaceAreas,
  replaceAuthors,
  findById,
  list,
  updatePublication,
  deletePublication,
};
