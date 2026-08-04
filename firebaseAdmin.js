// Server-side Firebase Admin — verifies Google ID tokens sent by the client.
// Uses the firebase-admin v13+ modular subpath exports, because
// require("firebase-admin") no longer exposes credential/auth at the root.

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Private keys are stored with literal "\n" escapes; restore real newlines.
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const isConfigured = Boolean(projectId && clientEmail && privateKey);

if (isConfigured) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

// Verify a Firebase ID token. Returns the decoded user (uid, name, email,
// picture) or throws. Returns null when admin isn't configured.
async function verifyIdToken(idToken) {
  if (!isConfigured) return null;
  const decoded = await getAuth().verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    name: decoded.name || decoded.email?.split("@")[0] || "Anonymous",
    email: decoded.email || null,
    photoURL: decoded.picture || null,
  };
}

module.exports = {
  adminConfigured: isConfigured,
  verifyIdToken,
};

