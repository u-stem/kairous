import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/actions/materials";
import { getCategories } from "@/lib/actions/categories";
import { getTags, getTagsForMaterial } from "@/lib/actions/tags";
import { MaterialEditForm } from "./material-edit-form";

export default async function MaterialEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [material, categories, allTags] = await Promise.all([
    getMaterial(id),
    getCategories(),
    getTags(),
  ]);

  if (!material) {
    notFound();
  }

  const existingTags = await getTagsForMaterial(id);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">教材を編集</h1>
      <MaterialEditForm
        material={material}
        categories={categories}
        allTags={allTags}
        existingTags={existingTags}
      />
    </div>
  );
}
