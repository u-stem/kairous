import type { createClient } from "@/lib/supabase/server";
import { ACTION_ERRORS } from "@/lib/constants";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CompensationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const DEFAULT_COMPENSATION_FIELDS = {
  status: "in_progress" as const,
  ended_at: null,
  self_rating: null,
  duration_sec: 0,
};

export async function invokeCompleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  body: Record<string, unknown>,
  extraCompensationFields?: Record<string, unknown>,
): Promise<CompensationResult> {
  const fnResult = await supabase.functions.invoke("complete-session", { body });

  if (fnResult.error) {
    const compensationFields = {
      ...DEFAULT_COMPENSATION_FIELDS,
      ...extraCompensationFields,
    };

    const { error: compensationError } = await supabase
      .from("sessions")
      .update(compensationFields)
      .eq("id", sessionId);

    if (compensationError) {
      console.error(
        `invokeCompleteSession compensation failed for session ${sessionId}:`,
        compensationError,
      );
    }

    return { ok: false, error: ACTION_ERRORS.EDGE_FUNCTION_FAILED };
  }

  return { ok: true, data: fnResult.data };
}
