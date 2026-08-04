export interface MediaItem {
  id: string;
  name: string;
  url: string;
  type: "image" | "video" | "audio";
  uploadedAt: number;
  uploadedBy: string;
  isPlaying?: boolean;
  currentTime?: number;
  /** Position on the board, as percentages of the board area (center point). */
  position?: { x: number; y: number };
  /** Cloudinary public id, when the asset is stored in Cloudinary. */
  cloudinaryId?: string | null;
}

export interface RoomUser {
  id: string;
  name: string;
  joinedAt: number;
  userId?: string;
  photoURL?: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

export interface RoomState {
  media: MediaItem[];
  users: RoomUser[];
}

export function getMediaType(fileName: string): MediaItem["type"] {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext || "")) {
    return "image";
  }
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext || "")) {
    return "video";
  }
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma"].includes(ext || "")) {
    return "audio";
  }
  return "image";
}

export function generateRoomKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < 8; i++) {
    if (i > 0 && i % 4 === 0) key += "-";
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}