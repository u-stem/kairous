import { notFound } from "next/navigation";
import { getSessionCards } from "@/lib/actions/sessions";
import { SessionPlayer } from "./session-player";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const cards = await getSessionCards(id);

  if (cards.length === 0) {
    notFound();
  }

  return <SessionPlayer sessionId={id} cards={cards} />;
}
