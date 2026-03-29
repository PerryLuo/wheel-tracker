"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import ImportModal from "./ImportModal";

const links = [
  { href: "/",       label: "P&L"    },
  { href: "/chains", label: "Chains" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [userName, setUserName] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserName(user.user_metadata?.full_name ?? user.email ?? "");
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = userName
    ? userName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <>
      <nav
        style={{
          backgroundColor: "#111827",
          borderBottom: "1px solid #1e2d3d",
        }}
      >
        <div className="container mx-auto px-4 max-w-7xl flex items-center gap-8 h-14">
          <span
            className="font-mono font-medium text-base"
            style={{ color: "#00d4aa" }}
          >
            Wheel Tracker
          </span>
          <div className="flex gap-1 flex-1">
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
                  style={{
                    color: active ? "#00d4aa" : "#94a3b8",
                    backgroundColor: active ? "#00d4aa1a" : "transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-1.5 rounded text-sm font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#00d4aa", color: "#0a0e1a" }}
            >
              Import
            </button>
            {/* User avatar + sign out */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold font-mono"
                style={{ backgroundColor: "#00d4aa22", color: "#00d4aa", border: "1px solid #00d4aa44" }}
              >
                {initials}
              </div>
              <button
                onClick={signOut}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: "#4b6080" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  );
}
