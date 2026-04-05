"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { SearchBar } from "@/components/search-bar";

export function MaterialsSearch() {
  const router = useRouter();

  // searchParams を deps に含めると変更のたびに SearchBar が再レンダーされデバウンスがリセットされる
  const handleSearch = useCallback(
    (query: string) => {
      const params = new URLSearchParams(window.location.search);
      if (query) {
        params.set("q", query);
      } else {
        params.delete("q");
      }
      router.replace(`/materials?${params.toString()}`);
    },
    [router],
  );

  return <SearchBar onSearch={handleSearch} placeholder="教材を検索..." />;
}
