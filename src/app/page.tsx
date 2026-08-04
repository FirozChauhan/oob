"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "./providers/SocketProvider";
import { useAuth, getFriendlyAuthError } from "./providers/AuthProvider";
import { generateRoomKey } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const { isConnected, connectionError } = useSocket();
  const { enabled, user, loading, signInWithGoogle, signInWithGoogleRedirect, redirectError, signOut } = useAuth();
  const [joinKey, setJoinKey] = useState("");
  const [userName, setUserName] = useState("");
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // When Firebase auth is on, identity comes from the signed-in Google user.
  // Otherwise we fall back to a manually typed name.
  const needsName = !enabled || !user;
  const name = user?.name || userName;
  const canProceed = name.trim().length > 0;

  useEffect(() => {
    // Only focus the name input when it's actually shown (no auth user)
    if (needsName) nameInputRef.current?.focus();
  }, [needsName]);

  const handleSignIn = async () => {
    setSignInBusy(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setSignInError(getFriendlyAuthError(err));
    } finally {
      setSignInBusy(false);
    }
  };

  const handleSignInRedirect = async () => {
    setSignInError(null);
    await signInWithGoogleRedirect();
  };

  const handleCreateRoom = () => {
    if (!canProceed) {
      if (needsName) nameInputRef.current?.focus();
      return;
    }
    setIsCreating(true);
    const key = generateRoomKey();
    setTimeout(() => {
      router.push(`/board/${key}?name=${encodeURIComponent(name.trim())}&create=1`);
    }, 300);
  };

  const handleJoinRoom = () => {
    const key = joinKey.trim().toUpperCase();
    if (!key) {
      setJoinError("Please enter a room key");
      joinInputRef.current?.focus();
      return;
    }
    if (!canProceed) {
      setJoinError("Please enter your name");
      if (needsName) nameInputRef.current?.focus();
      return;
    }
    const cleanKey = key.replace(/\s+/g, "").toUpperCase();
    if (cleanKey.length < 5) {
      setJoinError("Invalid room key format");
      return;
    }
    setJoinError("");
    router.push(`/board/${cleanKey}?name=${encodeURIComponent(name.trim())}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (activeTab === "create") {
        handleCreateRoom();
      } else {
        handleJoinRoom();
      }
    }
  };

  const formatJoinKey = (value: string) => {
    // Auto-format as user types: XXXX-XXXX
    const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleaned.length <= 4) return cleaned;
    return cleaned.slice(0, 4) + "-" + cleaned.slice(4, 8);
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen auth-dots relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#ffffff] opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#d9d9d9] opacity-10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#d9d9d9] opacity-5 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 flex flex-col items-center w-full max-w-md px-4">
        {/* Logo / Brand */}
        <div className="mb-10 text-center">
          <h1 className="text-7xl font-black text-white tracking-tight leading-none select-none">
            oob
          </h1>
          <p className="text-[#9c9c9c] mt-3 text-sm">
            Real-time media collaboration board
          </p>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="w-full mb-4 px-4 py-2.5 bg-[#ffffff]/5 border border-[#ffffff] text-[#cccccc] text-xs text-center flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {connectionError ? `Connection issue: ${connectionError}` : "Connecting to server..."}
          </div>
        )}

        {/* Auth gate — required when Firebase is configured */}
        {enabled && !user && (
          <div className="w-full bg-[#131313] border border-[#d9d9d9] p-6 mb-4 text-center">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="w-8 h-8 border-2 border-[#ffffff] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 mb-3">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-1">Sign in to continue</h3>
                <p className="text-[#9c9c9c] text-xs mb-4">Use your Google account to create or join a board</p>
                <button
                  onClick={handleSignIn}
                  disabled={signInBusy}
                  className="w-full py-3 px-4 bg-white text-gray-800 font-medium text-sm hover:bg-gray-100 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                  {signInBusy ? "Signing in..." : "Sign in with Google"}
                </button>
                {(signInError || redirectError) && (
                  <p className="text-red-400 text-xs mt-3 break-words">
                    {signInError || redirectError}
                  </p>
                )}
                <button
                  onClick={handleSignInRedirect}
                  className="mt-3 text-[#9c9c9c] hover:text-white text-xs underline underline-offset-2"
                >
                  Popup not working? Use redirect sign-in
                </button>
              </>
            )}
          </div>
        )}

        {/* Signed-in identity bar */}
        {enabled && user && (
          <div className="w-full mb-4 flex items-center justify-between px-4 py-2.5 bg-[#131313] border border-[#d9d9d9]">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.name} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ffffff] to-[#e0e0e0] flex items-center justify-center text-[11px] font-bold text-black">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white text-xs font-medium truncate">{user.name}</p>
                {user.email && <p className="text-[#9c9c9c] text-[10px] truncate">{user.email}</p>}
              </div>
            </div>
            <button onClick={() => signOut()} className="text-[#9c9c9c] hover:text-white text-xs px-2 py-1 hover:bg-[#1d1d1d] transition-all shrink-0">
              Sign out
            </button>
          </div>
        )}

        {/* Tab Switcher (hidden until signed in, when auth is on) */}
        {(!enabled || user) && (
          <div className="w-full flex bg-[#131313] p-1 mb-6 border border-[#d9d9d9]">
            <button
              onClick={() => setActiveTab("create")}
              className={`flex-1 py-2.5 px-4 text-sm font-medium transition-all duration-200 ${
                activeTab === "create"
                  ? "bg-[#ffffff] text-black shadow-lg shadow-[#ffffff]/30"
                  : "text-[#9c9c9c] hover:text-white hover:bg-[#1d1d1d]"
              }`}
            >
              Create Room
            </button>
            <button
              onClick={() => setActiveTab("join")}
              className={`flex-1 py-2.5 px-4 text-sm font-medium transition-all duration-200 ${
                activeTab === "join"
                  ? "bg-[#d9d9d9] text-black shadow-lg shadow-[#d9d9d9]/30"
                  : "text-[#9c9c9c] hover:text-white hover:bg-[#1d1d1d]"
              }`}
            >
              Join Room
            </button>
          </div>
        )}

        {/* Name Input (only when not using Google auth) */}
        {needsName && (
          <div className="w-full mb-4">
            <label className="block text-xs font-medium text-[#9c9c9c] mb-1.5 ml-1">
              Your Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your display name..."
              maxLength={20}
              className="w-full px-4 py-3 bg-[#131313] border border-[#d9d9d9] text-white placeholder-[#9c9c9c]/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#ffffff]/50 focus:border-[#ffffff] transition-all duration-200"
            />
          </div>
        )}

        {/* Create Room Panel */}
        {(!enabled || user) && activeTab === "create" && (
          <div className="w-full animate-fade-in">
            <div className="bg-[#131313] border border-[#d9d9d9] p-6 mb-4">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#ffffff]/10 mb-3">
                  <svg className="w-6 h-6 text-[#ffffff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold">Create a New Board</h3>
                <p className="text-[#9c9c9c] text-xs mt-1">
                  A unique room key will be generated for sharing
                </p>
              </div>
              <button
                onClick={handleCreateRoom}
                disabled={!isConnected || isCreating || !canProceed}
                className="w-full py-3 px-4 bg-[#ffffff] text-black font-medium text-sm hover:bg-[#cccccc] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#ffffff]/30"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Create Board
                  </span>
                )}
              </button>
            </div>
            <p className="text-[#9c9c9c] text-xs text-center">
              Share the generated key with anyone to collaborate in real-time
            </p>
          </div>
        )}

        {/* Join Room Panel */}
        {(!enabled || user) && activeTab === "join" && (
          <div className="w-full animate-fade-in">
            <div className="bg-[#131313] border border-[#d9d9d9] p-6 mb-4">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#d9d9d9]/10 mb-3">
                  <svg className="w-6 h-6 text-[#d9d9d9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold">Join a Board</h3>
                <p className="text-[#9c9c9c] text-xs mt-1">
                  Enter the room key shared with you
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-[#9c9c9c] mb-1.5 ml-1">
                  Room Key
                </label>
                <input
                  ref={joinInputRef}
                  type="text"
                  value={joinKey}
                  onChange={(e) => {
                    setJoinKey(formatJoinKey(e.target.value));
                    setJoinError("");
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#d9d9d9] text-white placeholder-[#9c9c9c]/50 text-sm text-center tracking-[0.2em] font-mono focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]/50 focus:border-[#d9d9d9] transition-all duration-200 uppercase"
                />
                {joinError && (
                  <p className="text-red-400 text-xs mt-1.5 ml-1">{joinError}</p>
                )}
              </div>
              <button
                onClick={handleJoinRoom}
                disabled={!isConnected || !joinKey.trim() || !canProceed}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#d9d9d9] to-[#e6e6e6] text-black font-medium text-sm hover:from-[#b0b0b0] hover:to-[#c4c4c4] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#d9d9d9]/20 hover:shadow-[#d9d9d9]/40"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Join Board
                </span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Brand signature — bottom right corner */}
      <span
        dir="rtl"
        className="signature-ruqaa text-2xl leading-none select-none fixed bottom-10 right-10"
        title="فیروز خان چوہان"
      >
        <span className="signature-white">فیروز</span>
        <span className="signature-gray"> خان چوہان</span>
      </span>
    </div>
  );
}