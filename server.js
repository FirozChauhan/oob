// Next.js loads env vars for the app bundle, but this plain Node process needs
// dotenv to see them too (CLOUDINARY_*, DATABASE_URL, Firebase…).
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const { cloudinaryConfigured, uploadBuffer, destroyAsset } = require("./cloudinary");
const { adminConfigured, verifyIdToken } = require("./firebaseAdmin");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

// Content types for serving uploaded files directly from disk.
const CONTENT_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".bmp": "image/bmp", ".avif": "image/avif",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".aac": "audio/aac",
  ".flac": "audio/flac", ".m4a": "audio/mp4", ".wma": "audio/x-ms-wma",
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Active rooms — the fast real-time source of truth. Postgres (when configured)
// mirrors this so rooms + media survive server restarts/redeploys.
const rooms = new Map();

// Throttle position DB writes (~1/sec per item) so dragging stays smooth.
const lastPosWrite = new Map();
function persistPos(mediaId, x, y) {
  const now = Date.now();
  if (now - (lastPosWrite.get(mediaId) || 0) > 800) {
    lastPosWrite.set(mediaId, now);
    db.updateMediaPos(mediaId, x, y).catch((e) => console.error("pos persist err:", e.message));
  }
}

app.prepare().then(async () => {
  await db.initDb().catch((e) => console.error("DB init failed:", e.message));
  console.log(`> Storage: Cloudinary ${cloudinaryConfigured ? "ON" : "off (disk fallback)"}, Postgres ${db.dbConfigured ? "ON" : "off (in-memory)"}, Firebase Admin ${adminConfigured ? "ON" : "off (trust client)"}`);
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    
    // Handle file uploads
    if (req.method === "POST" && parsedUrl.pathname === "/api/upload") {
      let body = "";
      let tooLarge = false;
      // The client caps files at 50MB, but the server must enforce it too —
      // base64 inflates the payload ~33%, so allow ~70MB of raw body.
      const MAX_BODY = 70 * 1024 * 1024;
      req.on("data", (chunk) => {
        body += chunk.toString();
        if (!tooLarge && body.length > MAX_BODY) {
          // Reject immediately and stop buffering — no point holding 70MB+
          // in memory just to refuse it.
          tooLarge = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "File too large. Maximum size is 50MB." }));
          req.destroy();
        }
      });
      req.on("end", async () => {
        if (tooLarge || res.headersSent) return;
        try {
          const { fileName, fileData, roomKey, mediaType, uploadedBy } = JSON.parse(body);
          const buffer = Buffer.from(fileData, "base64");
          if (buffer.length > 50 * 1024 * 1024) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "File too large. Maximum size is 50MB." }));
            return;
          }

          // Sanitize the filename — spaces, #, ? and emoji in names would break
          // the <video>/<img> src URL (a # is a fragment delimiter).
          const namedot = fileName.lastIndexOf(".");
          const ext = namedot > 0 ? fileName.slice(namedot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "";
          const base = namedot > 0 ? fileName.slice(0, namedot) : fileName;
          const safeBase = base.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
          const uniqueName = `${Date.now()}-${safeBase}${ext ? "." + ext.toLowerCase() : ""}`;

          let url;
          let cloudinaryId = null;
          if (cloudinaryConfigured) {
            // Store in Cloudinary — no local disk, survives restarts/redeploys.
            try {
              const up = await uploadBuffer(buffer, uniqueName, mediaType);
              url = up.url;
              cloudinaryId = up.publicId;
            } catch (cErr) {
              // If Cloudinary fails (bad creds, network, rate-limit…), fall back
              // to disk so the upload still succeeds instead of erroring out.
              console.error("[upload] Cloudinary failed, falling back to disk:", cErr.message);
              const uploadDir = path.join(process.cwd(), "public", "uploads");
              if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
              fs.writeFileSync(path.join(uploadDir, uniqueName), buffer);
              url = `/uploads/${uniqueName}`;
            }
          } else {
            // Fallback: write to local disk (original behaviour).
            const uploadDir = path.join(process.cwd(), "public", "uploads");
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, uniqueName), buffer);
            url = `/uploads/${uniqueName}`;
          }

          const mediaItem = {
            id: uniqueName,
            name: fileName,
            url,
            cloudinaryId,
            type: mediaType,
            uploadedAt: Date.now(),
            uploadedBy: uploadedBy || req.socket?.remoteAddress || "anonymous",
          };

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, mediaItem }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Serve uploaded files directly from disk. Next.js in production only
    // serves public/ assets that existed at build time, so runtime uploads
    // must be served here explicitly or they would 404.
    if (parsedUrl.pathname && parsedUrl.pathname.startsWith("/uploads/")) {
      const safeName = path.basename(decodeURIComponent(parsedUrl.pathname));
      const filePath = path.join(process.cwd(), "public", "uploads", safeName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=3600" });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
      return;
    }

    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Verify the client's Firebase ID token. Without Firebase Admin configured
    // this is a no-op and we trust the client-provided identity.
    socket.on("firebase-auth", async ({ idToken } = {}) => {
      // Admin not configured → no verification needed; let the client proceed.
      if (!adminConfigured) {
        socket.emit("firebase-auth-result", { ok: true, verified: false, required: false });
        return;
      }
      if (!idToken) {
        socket.emit("firebase-auth-result", { ok: false, verified: false, required: true, error: "No token provided" });
        return;
      }
      try {
        const verified = await verifyIdToken(idToken);
        socket.data.verified = verified;
        socket.emit("firebase-auth-result", { ok: true, verified: true, required: true });
      } catch (err) {
        socket.data.verified = null;
        socket.emit("firebase-auth-result", { ok: false, verified: false, required: true, error: err.message });
      }
    });

    // Shared create/join logic: load the room (from DB if needed), register the
    // user, then broadcast the room state to everyone.
    async function enterRoom(sock, { roomKey, userName, userId, userPhoto, create }) {
      // With Firebase Admin on, the verified identity is authoritative — the
      // client can't spoof uid/name/photo. Require verification before joining.
      if (adminConfigured) {
        const v = sock.data.verified;
        if (!v) {
          sock.emit("room-error", { message: "Authentication required. Please sign in again." });
          return;
        }
        userName = v.name;
        userId = v.uid;
        userPhoto = v.photoURL;
      }

      let room = rooms.get(roomKey);
      if (!room) {
        if (db.dbConfigured) {
          const exists = await db.roomExists(roomKey);
          if (!exists && !create) {
            sock.emit("room-error", { message: "Invalid room key. This room does not exist." });
            return;
          }
          const media = await db.getRoomMedia(roomKey);
          room = { media, users: new Map(), createdAt: Date.now() };
          rooms.set(roomKey, room);
        } else if (create) {
          room = { media: [], users: new Map(), createdAt: Date.now() };
          rooms.set(roomKey, room);
        } else {
          sock.emit("room-error", { message: "Invalid room key. This room does not exist." });
          return;
        }
      }
      if (create) {
        db.upsertRoom(roomKey, userId || userName).catch((e) => console.error("room upsert err:", e.message));
      }

      room.users.set(sock.id, {
        id: sock.id,
        name: userName || "Anonymous",
        userId: userId || "",
        photoURL: userPhoto || null,
        joinedAt: Date.now(),
      });

      sock.join(roomKey);
      sock.data.roomKey = roomKey;
      sock.data.userName = userName || "Anonymous";

      sock.emit("room-state", {
        media: room.media,
        users: Array.from(room.users.values()),
      });
      sock.to(roomKey).emit("user-joined", {
        id: sock.id,
        name: sock.data.userName,
        userId: userId || "",
        photoURL: userPhoto || null,
      });
      io.to(roomKey).emit("users-update", Array.from(room.users.values()));
      console.log(`Room ${roomKey}: ${sock.data.userName} joined`);
    }

    // Create a new room
    socket.on("create-room", (payload) => enterRoom(socket, { ...payload, create: true }));
    // Join existing room
    socket.on("join-room", (payload) => enterRoom(socket, { ...payload, create: false }));

    // New media uploaded
    socket.on("new-media", ({ roomKey, mediaItem }) => {
      // Sanity-check the payload — never trust the client blindly.
      if (!mediaItem || typeof mediaItem.id !== "string" || typeof mediaItem.url !== "string") return;
      if (rooms.has(roomKey)) {
        const room = rooms.get(roomKey);
        // Default to a staggered spot so new items don't land on top of each other
        if (mediaItem && !mediaItem.position) {
          const n = room.media.length;
          mediaItem.position = {
            x: 15 + ((n * 18) % 70),
            y: 15 + ((n * 23) % 65),
          };
        }
        room.media.push(mediaItem);
        // Persist to Postgres (no-op when DB isn't configured)
        db.insertMedia(mediaItem, roomKey).catch((e) => console.error("media insert err:", e.message));
        // Broadcast to ALL users in the room including sender
        io.to(roomKey).emit("media-added", mediaItem);
        console.log(`Room ${roomKey}: New media ${mediaItem.name} added`);
      }
    });

    // Free-drag position sync
    socket.on("media-move", ({ roomKey, mediaId, x, y }) => {
      if (rooms.has(roomKey)) {
        const item = rooms.get(roomKey).media.find((m) => m.id === mediaId);
        if (item && Number.isFinite(x) && Number.isFinite(y)) {
          item.position = {
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
          };
          persistPos(mediaId, item.position.x, item.position.y);
          socket.to(roomKey).emit("media-moved", { mediaId, x: item.position.x, y: item.position.y });
        }
      }
    });

    // Playback sync — last action wins, kept deliberately simple.
    socket.on("media-play", ({ roomKey, mediaId, currentTime }) => {
      socket.to(roomKey).emit("media-play", { mediaId, currentTime, playedBy: socket.data.userName });
    });

    socket.on("media-pause", ({ roomKey, mediaId, currentTime }) => {
      socket.to(roomKey).emit("media-pause", { mediaId, currentTime, pausedBy: socket.data.userName });
    });

    socket.on("media-seek", ({ roomKey, mediaId, currentTime }) => {
      socket.to(roomKey).emit("media-seek", { mediaId, currentTime });
    });

    // Delete media
    socket.on("delete-media", ({ roomKey, mediaId }) => {
      if (rooms.has(roomKey)) {
        const room = rooms.get(roomKey);
        const item = room.media.find((m) => m.id === mediaId);
        room.media = room.media.filter((m) => m.id !== mediaId);
        io.to(roomKey).emit("media-removed", mediaId);

        // Remove from Postgres (no-op when DB isn't configured)
        db.deleteMediaRow(mediaId).catch((e) => console.error("media delete err:", e.message));

        // Remove the stored asset: Cloudinary when configured, else the local file.
        if (item) {
          if (cloudinaryConfigured && item.cloudinaryId) {
            destroyAsset(item.cloudinaryId, item.type).catch(() => {});
          } else if (item.url && item.url.startsWith("/uploads/")) {
            try {
              const filePath = path.join(process.cwd(), "public", "uploads", path.basename(item.url));
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (err) {
              console.error(`Failed to delete file for ${mediaId}:`, err.message);
            }
          }
        }
      }
    });

    // Chat messages
    socket.on("chat-message", ({ roomKey, message }) => {
      if (typeof message !== "string" || !message.trim()) return;
      const chatMsg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        userId: socket.id,
        userName: socket.data.userName,
        message: message.trim().slice(0, 2000),
        timestamp: Date.now(),
      };
      io.to(roomKey).emit("chat-message", chatMsg);
    });

    // Disconnect
    socket.on("disconnect", () => {
      const roomKey = socket.data.roomKey;
      if (roomKey && rooms.has(roomKey)) {
        const room = rooms.get(roomKey);
        room.users.delete(socket.id);
        
        if (room.users.size === 0) {
          rooms.delete(roomKey);
          console.log(`Room ${roomKey} deleted (no users left)`);
        } else {
          socket.to(roomKey).emit("user-left", {
            id: socket.id,
            name: socket.data.userName,
          });
          io.to(roomKey).emit("users-update", Array.from(room.users.values()));
        }
      }
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});