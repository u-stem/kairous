import { notFound } from "next/navigation";
import { getCards } from "@/lib/actions/cards";
import { CardEditForm } from "./card-edit-form";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>;
}) {
  const { id, cardId } = await params;
  const cards = await getCards(id);
  const card = cards.find((c) => c.id === cardId);

  if (!card) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">カードを編集</h1>
      <CardEditForm card={card} materialId={id} />
    </div>
  );
}
