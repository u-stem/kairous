import { notFound } from "next/navigation";
import { getSessionInfo, getSessionCards } from "@/lib/actions/sessions";
import { SessionPlayer } from "./session-player";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const info = await getSessionInfo(id);

  if (!info) {
    notFound();
  }

  switch (info.methodSlug) {
    case "pomodoro":
      // PBI 3 で PomodoroPlayer を実装後に動的 import に置換する
      return <p>Pomodoro session (coming soon)</p>;

    case "elaboration": {
      // PBI 2 で ElaborationPlayer を実装後に動的 import に置換する
      const cards = await getSessionCards(id);
      if (cards.length === 0) notFound();
      return <p>Elaboration session (coming soon)</p>;
    }

    default: {
      // SRS (default) — 既存の CardSessionPlayer
      const cards = await getSessionCards(id);
      if (cards.length === 0) notFound();
      return <SessionPlayer sessionId={id} cards={cards} />;
    }
  }
}
