"use client";

import { useSearchParams } from "next/navigation";

export function useBrokerFilter(): string | undefined {
  const searchParams = useSearchParams();
  const broker = searchParams.get("broker");
  return broker || undefined;
}
