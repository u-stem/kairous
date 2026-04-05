"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SearchBar } from "@/components/search-bar";

export function MaterialsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URLクエリパラメータを更新することで、Server Componentが再フェッチされる
  const handleSearch = useCallback(
    (query: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("q", query);
      } else {
        params.delete("q");
      }
      router.replace(`/materials?${params.toString()}`);
    },
    [router, searchParams],
  );

  return <SearchBar onSearch={handleSearch} placeholder="教材を検索..." />;
}
