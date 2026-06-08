"use client";

import { useEffect } from "react";

// Safe UUID v4 generator for client browser
function generateUUID(): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback RFC4122 version 4 compliant generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function AntigravityTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // 1. Check if ag_uid already exists in LocalStorage
      let uid = localStorage.getItem("ag_uid");

      // 2. If not, generate a new one silently
      if (!uid) {
        uid = generateUUID();
        localStorage.setItem("ag_uid", uid);
      }

      // 3. Save to cookies with 1 year expiration and Lax SameSite
      const oneYearInSeconds = 365 * 24 * 60 * 60;
      document.cookie = `ag_uid=${uid}; path=/; max-age=${oneYearInSeconds}; SameSite=Lax; Secure`;

      // 4. Inject globally into the window object for easy lead tracking reference
      (window as any).ag_uid = uid;

      console.log(`[Antigravity Tracker] Active tracking initialized with ID: ${uid}`);
    } catch (error) {
      console.error("[Antigravity Tracker] Failed to initialize tracking ID:", error);
    }
  }, []);

  return null; // Silent global component
}
