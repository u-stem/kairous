import { notFound } from "next/navigation";
import { getSessionInfo, getSessionCards, getInterleavingCards } from "@/lib/actions/session-queries";
import { SessionPlayer } from "./session-player";
import { ElaborationPlayer } from "./elaboration-player";
import { PomodoroPlayer } from "./pomodoro-player";

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
      return <PomodoroPlayer sessionId={id} />;

    case "elaboration": {
      const cards = await getSessionCards(id, "elaboration");
      if (cards.length === 0) notFound();
      return <ElaborationPlayer sessionId={id} cards={cards} />;
    }

    case "srs": {
      const cards = await getSessionCards(id, "srs");
      if (cards.length === 0) notFound();
      return <SessionPlayer sessionId={id} cards={cards} />;
    }

    case "interleaving": {
      const cards = await getInterleavingCards(id);
      if (cards.length === 0) notFound();
      return <SessionPlayer sessionId={id} cards={cards} />;
    }

    default:
      notFound();
  }
}
