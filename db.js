// PostgreSQL persistence layer.
// Graceful fallback: when DATABASE_URL is not set, all functions are no-ops
// and the app behaves exactly as the in-memory-only version.

const { Pool } = require("pg");

const isConfigured = Boolean(process.env.DATABASE_URL);

let pool = null;
if (isConfigured) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  pool.on("error", (err) => console.error("Unexpected PG pool error:", err.message));
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      key VARCHAR(32) PRIMARY KEY,
      created_at BIGINT,
      created_by VARCHAR(255)
    );
    CREATE TABLE IF NOT EXISTS media_items (
      id VARCHAR(255) PRIMARY KEY,
      room_key VARCHAR(32) REFERENCES rooms(key) ON DELETE CASCADE,
      name VARCHAR(255),
      url TEXT,
      cloudinary_id TEXT,
      type VARCHAR(16),
      uploaded_at BIGINT,
      uploaded_by VARCHAR(255),
      pos_x DOUBLE PRECISION DEFAULT 50,
      pos_y DOUBLE PRECISION DEFAULT 15
    );
  `);
}

async function upsertRoom(key, createdBy) {
  if (!pool) return;
  await pool.query(
    "INSERT INTO rooms (key, created_at, created_by) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING",
    [key, Date.now(), createdBy || ""]
  );
}

async function roomExists(key) {
  if (!pool) return false;
  const { rows } = await pool.query("SELECT 1 FROM rooms WHERE key = $1", [key]);
  return rows.length > 0;
}

async function getRoomMedia(roomKey) {
  if (!pool) return [];
  const { rows } = await pool.query(
    "SELECT id, name, url, cloudinary_id, type, uploaded_at, uploaded_by, pos_x, pos_y FROM media_items WHERE room_key = $1 ORDER BY uploaded_at ASC",
    [roomKey]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    cloudinaryId: r.cloudinary_id || null,
    type: r.type,
    uploadedAt: Number(r.uploaded_at),
    uploadedBy: r.uploaded_by || "anonymous",
    position: { x: Number(r.pos_x), y: Number(r.pos_y) },
  }));
}

async function insertMedia(item, roomKey) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO media_items (id, room_key, name, url, cloudinary_id, type, uploaded_at, uploaded_by, pos_x, pos_y)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
    [
      item.id, roomKey, item.name, item.url, item.cloudinaryId || null,
      item.type, item.uploadedAt, item.uploadedBy || "",
      item.position?.x ?? 50, item.position?.y ?? 15,
    ]
  );
}

async function updateMediaPos(id, x, y) {
  if (!pool) return;
  await pool.query("UPDATE media_items SET pos_x=$1, pos_y=$2 WHERE id=$3", [x, y, id]);
}

async function deleteMediaRow(id) {
  if (!pool) return;
  await pool.query("DELETE FROM media_items WHERE id=$1", [id]);
}

module.exports = {
  dbConfigured: isConfigured,
  initDb,
  upsertRoom,
  roomExists,
  getRoomMedia,
  insertMedia,
  updateMediaPos,
  deleteMediaRow,
};
