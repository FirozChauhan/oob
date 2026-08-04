"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useSocket } from "@/app/providers/SocketProvider";
import { useAuth, getFriendlyAuthError } from "@/app/providers/AuthProvider";
import type { MediaItem, RoomUser, ChatMessage } from "@/lib/types";
import { getMediaType } from "@/lib/types";
import UserList from "./UserList";
import ChatPanel from "./ChatPanel";

export default function BoardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const { enabled: authEnabled, user: authUser, loading: authLoading, getIdToken, signInWithGoogle, signInWithGoogleRedirect, redirectError } = useAuth();

  const roomKey = params.key as string;
  const isCreating = searchParams.get("create") === "1";
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/board/${roomKey}` : "";

  // Identity: when Firebase auth is on it comes from the signed-in Google user;
  // otherwise we fall back to the ?name= query param (set on the home page).
  const userName = authEnabled ? (authUser?.name || "") : (searchParams.get("name") || "Anonymous");
  const userId = authUser?.uid || "";
  const userPhoto = authUser?.photoURL || "";
  const [authReady, setAuthReady] = useState(!authEnabled);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFileRef = useRef<(file: File) => Promise<void>>(async () => {});
  const [activeMediaType, setActiveMediaType] = useState<"all" | "image" | "video" | "audio">("all");

  // Listen for room events. This effect runs once per socket and never
  // tears down after joining, so live updates (new joins, new media…) keep
  // arriving without needing a reload.
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.on("room-error", ({ message }) => {
      setRoomError(message);
    });

    socket.on("room-state", ({ media, users: roomUsers }) => {
      setMediaItems(media);
      setUsers(roomUsers);
      setIsJoined(true);
      setRoomError(null);
    });

    socket.on("user-joined", (user) => {
      setUsers((prev) => {
        if (prev.find((u) => u.id === user.id)) return prev;
        return [...prev, user];
      });
    });

    socket.on("user-left", (user) => {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    });

    socket.on("users-update", (updatedUsers) => {
      setUsers(updatedUsers);
    });

    socket.on("media-added", (mediaItem: MediaItem) => {
      setMediaItems((prev) => [...prev, mediaItem]);
    });

    socket.on("media-removed", (mediaId: string) => {
      setMediaItems((prev) => prev.filter((m) => m.id !== mediaId));
    });

    // Someone dragged a media item — update its position live
    socket.on("media-moved", ({ mediaId, x, y }: { mediaId: string; x: number; y: number }) => {
      setMediaItems((prev) =>
        prev.map((m) => (m.id === mediaId ? { ...m, position: { x, y } } : m))
      );
    });

    socket.on("chat-message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off("room-error");
      socket.off("room-state");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("users-update");
      socket.off("media-added");
      socket.off("media-removed");
      socket.off("media-moved");
      socket.off("chat-message");
    };
  }, [socket, isConnected]);

  // The admin creates a fresh room; everyone else joins an existing one.
  // Emits only once — the isJoined guard stops re-emits after the room is ready.
  useEffect(() => {
    if (!socket || !isConnected || isJoined) return;
    // Wait for auth to resolve before joining (when Firebase auth is on)
    if (authEnabled && (authLoading || !authUser || !authReady)) return;
    socket.emit(isCreating ? "create-room" : "join-room", {
      roomKey,
      userName,
      userId,
      userPhoto,
    });
  }, [socket, isConnected, isCreating, isJoined, roomKey, userName, authEnabled, authLoading, authUser, userId, userPhoto, authReady]);

  // Send the Firebase ID token to the server so it can verify the identity.
  useEffect(() => {
    if (!socket || !isConnected || !authEnabled || !authUser) return;
    (async () => {
      try {
        const token = await getIdToken();
        if (token) {
          setAuthReady(false);
          setAuthError(null);
          socket.emit("firebase-auth", { idToken: token });
        }
      } catch {
        /* token unavailable */
      }
    })();
  }, [socket, isConnected, authEnabled, authUser, getIdToken]);

  // Apply the server's verification result before allowing the join.
  useEffect(() => {
    if (!socket || !isConnected || !authEnabled) return;
    const onResult = ({ ok, error }: { ok: boolean; error?: string }) => {
      if (ok) {
        setAuthReady(true);
        setAuthError(null);
      } else {
        setAuthReady(false);
        setAuthError(error || "Sign-in could not be verified by the server.");
      }
    };
    socket.on("firebase-auth-result", onResult);
    return () => {
      socket.off("firebase-auth-result", onResult);
    };
  }, [socket, isConnected, authEnabled]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUploadComplete = (mediaItem: MediaItem) => {
    if (socket) {
      socket.emit("new-media", { roomKey, mediaItem });
    }
  };

  const openFilePicker = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
    // reset so picking the same file again still fires change
    e.target.value = "";
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("File too large. Maximum size is 50MB.");
      setIsUploading(false);
      return;
    }
    const type = getMediaType(file.name);
    if (type === "image") {
      const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
      if (!validImageTypes.includes(file.type)) {
        setUploadError("Unsupported image format.");
        setIsUploading(false);
        return;
      }
    }
    try {
      // 1) Read the file as base64 — progress 0–40%
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 40));
        };
        reader.readAsDataURL(file);
      });
      setUploadProgress(40);

      // 2) POST via XHR so we get real upload progress — 40–100%
      const uploaded = await new Promise<{ ok: boolean; data: any }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            const pct = 40 + Math.round((e.loaded / e.total) * 60);
            setUploadProgress(Math.min(99, pct));
          }
        };
        xhr.onload = () => {
          let data: any = null;
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            data = null;
          }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(
          JSON.stringify({
            fileName: file.name,
            fileData: base64,
            roomKey,
            mediaType: type,
            uploadedBy: userName || "anonymous",
          })
        );
      });

      if (!uploaded.ok || !uploaded.data?.success || !uploaded.data.mediaItem) {
        throw new Error(uploaded.data?.error || "Upload failed");
      }
      setUploadProgress(100);
      handleUploadComplete(uploaded.data.mediaItem);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed. Please try again.");
    } finally {
      // Keep the full bar visible briefly, then reset for the next upload.
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 300);
    }
  };
  // Keep a live reference so the paste listener always uses the latest uploadFile.
  uploadFileRef.current = uploadFile;

  // Paste-to-upload: paste an image (e.g. copied from Google) anywhere to upload it.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          const ext = (item.type.split("/")[1] || "png").toLowerCase().replace("jpeg", "jpg");
          const named = new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
          uploadFileRef.current(named);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleDeleteMedia = (mediaId: string) => {
    if (socket) {
      socket.emit("delete-media", { roomKey, mediaId });
    }
  };

  // Live-drag: update local state immediately and broadcast to others (throttled)
  const lastMoveEmit = useRef(0);
  const handleMoveMedia = useCallback(
    (mediaId: string, x: number, y: number) => {
      setMediaItems((prev) =>
        prev.map((m) => (m.id === mediaId ? { ...m, position: { x, y } } : m))
      );
      const now = Date.now();
      if (socket && now - lastMoveEmit.current > 50) {
        lastMoveEmit.current = now;
        socket.emit("media-move", { roomKey, mediaId, x, y });
      }
    },
    [socket, roomKey]
  );

  // Bring-to-front layers: every card gets a monotonically increasing z-index
  // when picked up, so whatever you drag stays on top of the others.
  const zCounter = useRef(100);
  const [zMap, setZMap] = useState<Record<string, number>>({});
  const bringToFront = useCallback((mediaId: string) => {
    zCounter.current += 1;
    setZMap((prev) => ({ ...prev, [mediaId]: zCounter.current }));
  }, []);

  const handleSendChat = (message: string) => {
    if (socket) {
      socket.emit("chat-message", { roomKey, message });
    }
  };

  const filteredMedia = activeMediaType === "all" 
    ? mediaItems 
    : mediaItems.filter((m) => m.type === activeMediaType);

  const getMediaCount = (type: "all" | "image" | "video" | "audio") => {
    if (type === "all") return mediaItems.length;
    return mediaItems.filter((m) => m.type === type).length;
  };

  if (roomError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] p-4">
        <div className="bg-[#131313] border border-red-500/30 p-8 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Room Not Found</h2>
          <p className="text-[#9c9c9c] text-sm mb-6">{roomError}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-[#ffffff] text-black hover:bg-[#cccccc] transition-all duration-200"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  if (authEnabled && authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="w-12 h-12 border-2 border-[#ffffff] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#9c9c9c] text-sm mt-4">Authenticating...</p>
      </div>
    );
  }

  if (authEnabled && !authUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] p-4">
        <div className="bg-[#131313] border border-[#d9d9d9] p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Sign in to join this board</h2>
          <p className="text-[#9c9c9c] text-sm mb-6">Room key: <span className="text-white font-mono">{roomKey}</span></p>
          <button
            onClick={async () => {
              setSignInError(null);
              try { await signInWithGoogle(); } catch (err) { setSignInError(getFriendlyAuthError(err)); }
            }}
            className="w-full py-3 px-4 bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Sign in with Google
          </button>
          {(signInError || redirectError) && (
            <p className="text-red-400 text-xs mt-3 break-words">{signInError || redirectError}</p>
          )}
          <button
            onClick={async () => { setSignInError(null); await signInWithGoogleRedirect(); }}
            className="mt-3 text-[#9c9c9c] hover:text-white text-xs underline underline-offset-2"
          >
            Popup not working? Use redirect sign-in
          </button>
          <button onClick={() => router.push("/")} className="mt-3 block w-full text-center text-[#9c9c9c] hover:text-white text-xs">Back to home</button>
        </div>
      </div>
    );
  }

  if (authEnabled && authUser && authError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] p-4">
        <div className="bg-[#131313] border border-[#d9d9d9] p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Sign-in could not be verified</h2>
          <p className="text-[#9c9c9c] text-sm mb-6">{authError}</p>
          <button
            onClick={async () => {
              try {
                const token = await getIdToken();
                if (token && socket) {
                  setAuthReady(false);
                  setAuthError(null);
                  socket.emit("firebase-auth", { idToken: token });
                }
              } catch {}
            }}
            className="w-full py-3 px-4 bg-[#ffffff] text-black font-medium text-sm hover:bg-[#cccccc] transition-all"
          >
            Try again
          </button>
          <button onClick={() => router.push("/")} className="mt-3 text-[#9c9c9c] hover:text-white text-xs">Back to home</button>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-[#ffffff] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#9c9c9c] text-sm">Joining room <span className="text-white font-mono">{roomKey}</span>...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#131313] border-b border-[#d9d9d9] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-2 hover:bg-[#1d1d1d] text-[#9c9c9c] hover:text-white transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-white font-extrabold text-base leading-none tracking-wider select-none">
                O.O.B
              </h1>
              <span className="text-[#9c9c9c] text-[9px] font-mono select-none">v1.2.1</span>
            </div>
            <p className="text-[#9c9c9c] text-[10px] mt-1">{roomKey}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Brand signature */}
          <span
            dir="rtl"
            className="signature-ruqaa text-xl leading-none select-none"
            title="فیروز خان چوہان"
          >
            <span className="signature-white">فیروز</span>
            <span className="signature-gray"> خان چوہان</span>
          </span>

          {/* Connection indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] ${
            isConnected ? "bg-[#ffffff]/10 text-[#e6e6e6]" : "bg-[#ffffff]/5 text-[#9c9c9c]"
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-white animate-pulse" : "bg-[#666666]"
            }`} />
            {isConnected ? "Live" : "Connecting..."}
          </div>

          {/* Copy share link */}
          <button
            onClick={handleCopyKey}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1d1d1d] hover:bg-[#d9d9d9] text-[#9c9c9c] hover:text-black text-xs transition-all"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-[#e6e6e6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                Share
              </>
            )}
          </button>

          {/* User avatars */}
          <div className="flex -space-x-2">
            {users.slice(0, 5).map((user, i) => (
              <div
                key={user.id}
                className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ffffff] to-[#e0e0e0] flex items-center justify-center text-[10px] font-bold text-black border-2 border-[#131313] overflow-hidden"
                title={user.name}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
            ))}
            {users.length > 5 && (
              <div className="w-7 h-7 rounded-full bg-[#1d1d1d] flex items-center justify-center text-[10px] text-[#9c9c9c] border-2 border-[#131313]">
                +{users.length - 5}
              </div>
            )}
          </div>

          {/* Toggle sidebar */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? "Hide panel" : "Show panel"}
            className="p-2 hover:bg-[#1d1d1d] text-[#9c9c9c] hover:text-white transition-all"
          >
            {showSidebar ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.75L5.25 12 9 14.25m6-4.5L18.75 12 15 14.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l6 6-6 6M9 6l-6 6 6 6" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.75L5.25 12 9 14.25m6-4.5L18.75 12 15 14.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Media Type Filter */}
          <div className="relative overflow-hidden flex items-center gap-1 px-4 py-2 bg-[#131313]/50 border-b border-[#d9d9d9] shrink-0">
            {[
              { type: "all" as const, label: "All" },
              { type: "image" as const, label: "Photos" },
              { type: "video" as const, label: "Videos" },
              { type: "audio" as const, label: "Audio" },
            ].map(({ type, label }) => (
              <button
                key={type}
                onClick={() => setActiveMediaType(type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all ${
                  activeMediaType === type
                    ? "bg-[#ffffff] text-black"
                    : "text-[#9c9c9c] hover:text-white hover:bg-[#1d1d1d]"
                }`}
              >
                {label}
                <span className={`ml-1 text-[9px] ${activeMediaType === type ? "text-black/60" : "text-[#9c9c9c]"}`}>
                  {getMediaCount(type)}
                </span>
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={openFilePicker}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ffffff] text-black text-xs font-medium hover:bg-[#cccccc] transition-all disabled:opacity-60"
            >
              {isUploading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              )}
              {isUploading ? "Uploading..." : "Upload"}
            </button>

            {/* Upload progress bar in this toolbar */}
            {isUploading && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#1d1d1d]">
                <div
                  className="h-full bg-white transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>

          {uploadError && (
            <div className="px-3 py-1.5 text-red-400 text-xs">{uploadError}</div>
          )}

          {/* Hidden file input — the Upload button triggers it directly */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.webm,.ogg,.mov,.mp3,.wav,.aac,.flac,.m4a"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Freeform Board */}
          <div
            className="relative flex-1 overflow-hidden board-grid"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) uploadFile(files[0]);
            }}
          >
            {filteredMedia.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-[#131313] border border-[#d9d9d9] flex items-center justify-center mb-4">
                  <svg className="w-10 h-10 text-[#d9d9d9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <h3 className="text-white font-medium mb-1">No media yet</h3>
                <p className="text-[#9c9c9c] text-xs max-w-xs">
                  {activeMediaType === "all"
                    ? "Upload videos, photos, or audio to get started"
                    : `No ${activeMediaType} files uploaded yet`}
                </p>
                {activeMediaType === "all" && (
                  <button
                    onClick={openFilePicker}
                    className="mt-4 px-4 py-2 bg-[#ffffff] text-black text-xs font-medium hover:bg-[#cccccc] transition-all"
                  >
                    Upload Media
                  </button>
                )}
              </div>
            ) : (
              filteredMedia.map((media) => (
                <MediaCard
                  key={media.id}
                  media={media}
                  onDelete={handleDeleteMedia}
                  onMove={handleMoveMedia}
                  onBringToFront={bringToFront}
                  zIndex={zMap[media.id] ?? 10}
                />
              ))
            )}
          </div>
        </div>

        {/* Sidebar (Users + Chat) — always mounted, animates width for a smooth slide */}
        <aside
          className="shrink-0 overflow-hidden border-l border-[#d9d9d9] bg-[#131313] transition-[width] duration-300 ease-in-out"
          style={{ width: showSidebar ? "20rem" : "0px" }}
        >
          <div className="w-80 h-full flex flex-col">
            <UserList users={users} />
            <div className="border-t border-[#d9d9d9] flex-1 flex flex-col overflow-hidden">
              <ChatPanel
                messages={chatMessages}
                onSendMessage={handleSendChat}
                currentUserId={socket?.id || ""}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function MediaCard({
  media,
  onDelete,
  onMove,
  zIndex,
  onBringToFront,
}: {
  media: MediaItem;
  onDelete: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  zIndex: number;
  onBringToFront: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cardWidth, setCardWidth] = useState(280);
  const [enlarged, setEnlarged] = useState(false);
  const drag = useRef<{ pointerId: number; sx: number; sy: number; px: number; py: number; pw: number; ph: number } | null>(null);
  const didDrag = useRef(false);

  const pos = media.position ?? { x: 50, y: 50 };

  const currentEl = () =>
    media.type === "audio" ? audioRef.current : videoRef.current;

  const togglePlay = () => {
    const el = currentEl();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    if (el.duration) setProgress((el.currentTime / el.duration) * 100);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    // Landscape videos get a bigger block
    if (media.type === "video" && el instanceof HTMLVideoElement && el.videoWidth > el.videoHeight) {
      setCardWidth(440);
    }
  };

  const seekAt = (clientX: number) => {
    const el = currentEl();
    const bar = cardRef.current?.querySelector<HTMLElement>("[data-seekbar]");
    if (!el || !bar || !el.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    el.currentTime = (pct / 100) * el.duration;
    setProgress(pct);
  };

  // Click-to-play lives on the card root, because pointer-capture sends the
  // resulting click event to the captured element (the card), not the media.
  const handleCardClick = (e: React.MouseEvent) => {
    if (media.type !== "video" && media.type !== "audio") return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    // Pointer capture retargets the click to this card — see what's actually
    // under the pointer to decide between seeking, deleting, or play/pause.
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (under?.closest("button")) return; // delete button
    if (under?.closest("[data-seekbar]")) {
      seekAt(e.clientX);
      return;
    }
    togglePlay();
  };

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    const el = cardRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    e.preventDefault();
    didDrag.current = false;
    drag.current = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      px: pos.x,
      py: pos.y,
      pw: parent.offsetWidth || 1,
      ph: parent.offsetHeight || 1,
    };
    el.setPointerCapture(e.pointerId);
    onBringToFront(media.id);
    setDragging(true);
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    const nx = clamp(d.px + (dx / d.pw) * 100, 0, 100);
    const ny = clamp(d.py + (dy / d.ph) * 100, 0, 100);
    onMove(media.id, Math.round(nx * 10) / 10, Math.round(ny * 10) / 10);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={cardRef}
      className={`absolute overflow-hidden bg-black border border-[#ffffff] group transition-shadow ${
        dragging
          ? "cursor-grabbing shadow-2xl ring-2 ring-[#ffffff]"
          : "cursor-grab"
      }`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: cardWidth,
        transform: "translate(-50%, -50%)",
        zIndex,
        touchAction: "none",
        userSelect: "none",
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={handleCardClick}
    >
      {media.type === "video" && (
        <div className="cursor-pointer">
          <video
            ref={videoRef}
            src={media.url}
            playsInline
            preload="metadata"
            className="w-full h-auto block object-contain"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
      )}
      {media.type === "image" && (
        <img
          src={media.url}
          alt={media.name}
          className="w-full h-auto block object-contain"
          loading="lazy"
          draggable={false}
        />
      )}
      {media.type === "audio" && (
        <div className="w-full flex items-center gap-2 p-3 cursor-pointer">
          <span className="text-white text-lg shrink-0 leading-none">
            {isPlaying ? "⏸" : "▶"}
          </span>
          <div
            data-seekbar
            className="relative flex-1 h-1.5 bg-white/20 cursor-pointer"
          >
            <div
              className="absolute inset-y-0 left-0 bg-[#ffffff]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <audio
            ref={audioRef}
            src={media.url}
            preload="metadata"
            className="hidden"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
      )}

      {/* Progress / seek bar overlay for video */}
      {media.type === "video" && (
        <div
          data-seekbar
          className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 cursor-pointer"
        >
          <div className="h-full bg-[#ffffff]" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Card toolbar: enlarge (video/image) + delete */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        {(media.type === "video" || media.type === "image") && (
          <button
            onClick={() => setEnlarged(true)}
            className="p-1 bg-black/60 text-white/90 hover:text-white"
            title="Enlarge"
            aria-label="Enlarge"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9V6.75A2.25 2.25 0 0 1 6 4.5h2.25M3.75 15v2.25A2.25 2.25 0 0 0 6 19.5h2.25M15 4.5h2.25A2.25 2.25 0 0 1 19.5 6.75V9m0 6v2.25A2.25 2.25 0 0 1 17.25 19.5H15" />
            </svg>
          </button>
        )}
        <button
          onClick={() => onDelete(media.id)}
          className="p-1 bg-black/60 text-white/90 hover:text-red-400"
          title="Delete"
          aria-label="Delete"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Enlarged fullscreen lightbox (rendered via portal so it covers the viewport) */}
      {enlarged &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-6"
            onClick={() => setEnlarged(false)}
          >
            <button
              onClick={() => setEnlarged(false)}
              className="absolute top-4 right-4 p-2 bg-white text-black hover:bg-[#d9d9d9]"
              title="Close"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {media.type === "video" ? (
              <video
                key={media.url}
                src={media.url}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={media.url}
                alt={media.name}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>,
          document.body
        )}
    </div>
  );
}