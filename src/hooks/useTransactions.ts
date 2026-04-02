"use client";

import { useState, useEffect, useCallback } from "react";
import type { Chain, Transaction, PeriodPnl } from "@/lib/types";

export interface AppData {
  transactions: Transaction[];
  chains: Chain[];
  weekly: PeriodPnl[];
  monthly: PeriodPnl[];
  totalPnl: number;
  ytd: number;
  ytdCommitted: number;
  avgDeployedCommitted: number;
}

export function useTransactions(broker?: string, year?: string) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (broker) params.set("broker", broker);
      if (year) params.set("year", year);
      const qs = params.toString();
      const url = qs ? `/api/transactions?${qs}` : "/api/transactions";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [broker, year]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when another component signals new data was imported
  useEffect(() => {
    window.addEventListener("transactions-updated", load);
    return () => window.removeEventListener("transactions-updated", load);
  }, [load]);

  return { data, loading, error, refresh: load };
}
