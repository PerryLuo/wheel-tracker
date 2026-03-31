"use client";

import { useSearchParams } from "next/navigation";

export function useYearFilter(): string | undefined {
  const searchParams = useSearchParams();
  const year = searchParams.get("year");
  return year || undefined;
}
