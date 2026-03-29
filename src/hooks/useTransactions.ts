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
}

export function useTransactions() {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refresh: load };
}
