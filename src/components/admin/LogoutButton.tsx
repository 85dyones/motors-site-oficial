"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-border/60 hover:border-red-500/30 text-brand-text/60 hover:text-red-500 hover:bg-red-500/5 text-xs font-semibold tracking-wider uppercase transition-all duration-200 cursor-pointer disabled:opacity-50 select-none"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v-2.001c0 .415-.336.75-.75.75h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M19 10a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1 0-1.5h8.5A.75.75 0 0 1 19 10Z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M16.28 7.22a.75.75 0 0 1 0 1.06L14.56 10l1.72 1.72a.75.75 0 1 1-1.06 1.06l-2.25-2.25a.75.75 0 0 1 0-1.06l2.25-2.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
      </svg>
      {isLoggingOut ? "Saindo..." : "Sair"}
    </button>
  );
}
