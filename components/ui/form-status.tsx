import type { ActionResult } from "@/lib/forms";

export function FormStatus({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="form-success" role="status">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return (
    <p className="text-sm text-destructive" data-testid="form-error" role="alert">
      {state.error}
    </p>
  );
}
