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
      return <p>Pomodoro session (coming soon)</p>;

    case "elaboration":
      return <p>Elaboration session (coming soon)</p>;

    case "srs": {
      const cards = await getSessionCards(id);
      if (cards.length === 0) notFound();
      return <SessionPlayer sessionId={id} cards={cards} />;
    }

    default:
      notFound();
  }
}
