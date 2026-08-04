// Cloudinary media storage.
// Graceful fallback: when credentials are missing, exports report not
// configured and the upload handler falls back to local disk uploads.

const cloudinary = require("cloudinary").v2;

const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Cloudinary's "video" resource type covers both video and audio files.
const RESOURCE_TYPE = { image: "image", video: "video", audio: "video" };

// Upload a buffer to Cloudinary. Returns { url, publicId }.
function uploadBuffer(buffer, publicId, mediaType) {
  return new Promise((resolve, reject) => {
    const resourceType = RESOURCE_TYPE[mediaType] || "auto";
    // public_id must not include the file format/extension.
    const cleanPublicId = publicId.replace(/\.[^.]+$/, "");
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: cleanPublicId,
        resource_type: resourceType,
        folder: "oob",
        overwrite: true,
      },
      (err, result) => {
        if (err) reject(err);
        else resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

// Delete an asset from Cloudinary by its public id.
function destroyAsset(publicId, mediaType) {
  const resourceType = RESOURCE_TYPE[mediaType] || "auto";
  return new Promise((resolve) => {
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (err) => {
      if (err) console.error("Cloudinary delete failed:", err.message);
      resolve();
    });
  });
}

module.exports = {
  cloudinaryConfigured: isConfigured,
  uploadBuffer,
  destroyAsset,
};
