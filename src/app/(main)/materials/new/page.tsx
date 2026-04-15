import { getSubjects } from "@/lib/actions/categories";
import { getMethods } from "@/lib/actions/material-methods";
import { MaterialWizard } from "./material-wizard";

export default async function NewMaterialPage() {
  const [subjects, methods] = await Promise.all([getSubjects(), getMethods()]);
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">教材を作成</h1>
      <MaterialWizard subjects={subjects} methods={methods} />
    </div>
  );
}
