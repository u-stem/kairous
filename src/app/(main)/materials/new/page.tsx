import { getCategories } from "@/lib/actions/categories";
import { getMethods } from "@/lib/actions/material-methods";
import { getTags } from "@/lib/actions/tags";
import { MaterialWizard } from "./material-wizard";

export default async function NewMaterialPage() {
  const [categories, methods, allTags] = await Promise.all([
    getCategories(),
    getMethods(),
    getTags(),
  ]);
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">教材を作成</h1>
      <MaterialWizard categories={categories} methods={methods} allTags={allTags} />
    </div>
  );
}
