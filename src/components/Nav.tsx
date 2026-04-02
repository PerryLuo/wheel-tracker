"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { createBrowserClient } from "@supabase/ssr";
import ImportModal from "./ImportModal";

const links = [
  { href: "/",        label: "P&L"    },
  { href: "/chains",  label: "Chains" },
  { href: "/tickers", label: "Tickers" },
];

const BROKERS = [
  { value: "",           label: "All" },
  { value: "schwab",     label: "Schwab" },
  { value: "robinhood",  label: "Robinhood" },
];

const YEAR_OPTIONS = [
  { value: "", label: "All" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
];

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLabel = options.find((o) => o.value === value)?.label ?? "All";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors"
        style={{
          backgroundColor: value ? "#00d4aa22" : "transparent",
          border: "1px solid #1e2d3d",
          color: "#e2e8f0",
        }}
      >
        <span style={{ color: "#4b6080" }}>{label}:</span>
        <span style={{ color: value ? "#00d4aa" : "#94a3b8" }}>{activeLabel}</span>
        <span style={{ color: "#4b6080", fontSize: 8 }}>▼</span>
      </button>
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            backgroundColor: "#1a2234",
            border: "1px solid #1e2d3d",
            borderRadius: 6,
            zIndex: 50,
            minWidth: 120,
            overflow: "hidden",
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setIsOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[#00d4aa11]"
              style={{
                color: o.value === value ? "#00d4aa" : "#94a3b8",
                backgroundColor: o.value === value ? "#00d4aa11" : "transparent",
                display: "block",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
            <FilterDropdown
              label="Brokerage"
              options={BROKERS}
              value={activeBroker}
              onChange={setBroker}
            />
            <FilterDropdown
              label="Year"
              options={YEAR_OPTIONS}
              value={activeYear}
              onChange={setYear}
            />
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
