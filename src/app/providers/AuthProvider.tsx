"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, googleProvider, firebaseEnabled } from "@/lib/firebase";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
  onIdTokenChanged,
  type User as FbUser,
} from "firebase/auth";

export interface BoardUser {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  enabled: boolean;
  loading: boolean;
  user: BoardUser | null;
  /** Current Firebase ID token (auto-refreshes when it expires), or null. */
  idToken: string | null;
  /** Error from a redirect sign-in that returned to this page, if any. */
  redirectError: string | null;
  /** Returns the current Firebase ID token (refreshes automatically), or null. */
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  enabled: false,
  loading: false,
  user: null,
  idToken: null,
  redirectError: null,
  getIdToken: async () => null,
  signInWithGoogle: async () => {},
  signInWithGoogleRedirect: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Map common Firebase auth errors to friendly, actionable messages.
export function getFriendlyAuthError(err: unknown): string {
  const code = (err as { code?: string; message?: string })?.code || "";
  const msg = (err as { message?: string })?.message || "Sign-in failed. Please try again.";
  if (code.includes("unauthorized-domain") || code.includes("operation-not-allowed") || msg.includes("domain"))
    return "Google sign-in isn't allowed on this domain yet. Add it in Firebase → Authentication → Authorized domains, and to your Google OAuth client's Authorized JavaScript origins.";
  if (code.includes("popup-closed-by-user")) return "The sign-in popup was closed. Tap the button to try again.";
  if (code.includes("popup-blocked")) return "Your browser blocked the popup. Use the redirect option, or allow popups for this site.";
  if (code.includes("network-request-failed")) return "A network error occurred. Check your connection and try again.";
  if (code.includes("redirect-cancelled")) return "The redirect sign-in was cancelled. Try again.";
  return msg;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<BoardUser | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    // loading starts as firebaseEnabled, so with Firebase off we're never
    // loading; when it's on, auth is already initialised — just subscribe.
    if (!firebaseEnabled || !auth) return;
    const unsub = onAuthStateChanged(auth, (u: FbUser | null) => {
      if (u) {
        setUser({
          uid: u.uid,
          name: u.displayName || u.email?.split("@")[0] || "Anonymous",
          email: u.email,
          photoURL: u.photoURL,
        });
        setRedirectError(null);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    // Resolve any redirect sign-in that just returned to this page.
    getRedirectResult(auth).catch((e) => {
      setRedirectError(getFriendlyAuthError(e));
    });
    // Keep the ID token fresh (it expires ~1h); this fires on refresh too.
    const unsubToken = onIdTokenChanged(auth, async (u: FbUser | null) => {
      setIdToken(u ? await u.getIdToken() : null);
    });
    return () => {
      unsub();
      unsubToken();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) return;
    await signInWithPopup(auth, googleProvider);
  };

  const signInWithGoogleRedirect = async () => {
    if (!auth || !googleProvider) return;
    await signInWithRedirect(auth, googleProvider);
  };

  const signOut = async () => {
    if (!auth) return;
    await fbSignOut(auth);
  };

  const getIdToken = async () => {
    if (!auth) return null;
    const u = auth.currentUser;
    if (!u) return null;
    // If we haven't captured a token yet (or it changed), fetch fresh.
    return (await u.getIdToken()) || null;
  };

  return (
    <AuthContext.Provider
      value={{
        enabled: firebaseEnabled,
        loading,
        user,
        idToken,
        redirectError,
        getIdToken,
        signInWithGoogle,
        signInWithGoogleRedirect,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
