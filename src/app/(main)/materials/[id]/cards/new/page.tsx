import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/actions/materials";
import { CardAddForm } from "./card-add-form";

export default async function NewCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const material = await getMaterial(id);

  if (!material) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-1 text-lg font-bold">カードを追加</h1>
      <p className="mb-6 text-sm text-muted-foreground">{material.title}</p>
      <CardAddForm materialId={id} />
    </div>
  );
}
