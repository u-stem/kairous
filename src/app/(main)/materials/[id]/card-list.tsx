"use client";

import { useState, useCallback } from "react";

import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { CardListItem } from "./card-list-item";
import type { Card } from "@/lib/types/materials";

type CardListProps = {
  cards: Card[];
  materialId: string;
};

export function CardList({ cards, materialId }: CardListProps) {
  const [query, setQuery] = useState("");

  // useCallback でメモ化し、SearchBar の useEffect が不要に再実行されないようにする
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const filtered =
    query.trim() === ""
      ? cards
      : cards.filter(
          (card) =>
            card.front.toLowerCase().includes(query.toLowerCase()) ||
            card.back.toLowerCase().includes(query.toLowerCase()),
        );

  if (cards.length === 0) {
    return (
      <EmptyState
        title="カードがありません"
        description="最初のカードを追加しましょう"
        action={{ label: "カードを追加", href: `/materials/${materialId}/cards/new` }}
      />
    );
  }

  return (
    <div>
      <SearchBar onSearch={handleSearch} placeholder="表面・裏面で検索" />

      {filtered.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {filtered.map((card) => (
            <CardListItem key={card.id} card={card} materialId={materialId} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          「{query}」に一致するカードがありません
        </p>
      )}
    </div>
  );
}
