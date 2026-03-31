"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { createBrowserClient } from "@supabase/ssr";
import ImportModal from "./ImportModal";

const links = [
  { href: "/",       label: "P&L"    },
  { href: "/chains", label: "Chains" },
];

const BROKERS = [
  { value: "",           label: "All" },
  { value: "schwab",     label: "Schwab" },
  { value: "robinhood",  label: "Robinhood" },
];

const YEARS = ["2025", "2026"];

function NavInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showImport, setShowImport] = useState(false);
  const [userName, setUserName] = useState("");
  const activeBroker = searchParams.get("broker") ?? "";
  const activeYear = searchParams.get("year") ?? "";

  function setBroker(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("broker", value);
    } else {
      params.delete("broker");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setYear(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("year", value);
    } else {
      params.delete("year");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

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
            {/* Broker filter pills */}
            <div
              className="flex rounded overflow-hidden text-xs font-medium"
              style={{ border: "1px solid #1e2d3d" }}
            >
              {BROKERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setBroker(value)}
                  className="px-3 py-1 transition-colors"
                  style={{
                    backgroundColor: activeBroker === value ? "#00d4aa22" : "transparent",
                    color: activeBroker === value ? "#00d4aa" : "#4b6080",
                    borderRight: value !== "robinhood" ? "1px solid #1e2d3d" : undefined,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Year filter pills */}
            <div
              className="flex rounded overflow-hidden text-xs font-medium"
              style={{ border: "1px solid #1e2d3d" }}
            >
              <button
                onClick={() => setYear("")}
                className="px-3 py-1 transition-colors"
                style={{
                  backgroundColor: activeYear === "" ? "#00d4aa22" : "transparent",
                  color: activeYear === "" ? "#00d4aa" : "#4b6080",
                  borderRight: "1px solid #1e2d3d",
                }}
              >
                All
              </button>
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className="px-3 py-1 transition-colors"
                  style={{
                    backgroundColor: activeYear === y ? "#00d4aa22" : "transparent",
                    color: activeYear === y ? "#00d4aa" : "#4b6080",
                    borderRight: y !== YEARS[YEARS.length - 1] ? "1px solid #1e2d3d" : undefined,
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
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

export default function Nav() {
  return (
    <Suspense>
      <NavInner />
    </Suspense>
  );
}
