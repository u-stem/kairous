# User-Defined Methods Design

## Why

Kairous supports only system-defined learning methods (SRS, Elaboration, Pomodoro, Interleaving, Wakeful Rest). Learners who practice techniques like Feynman, Cornell Notes, or oral reading cannot track those sessions. User-defined methods let learners create custom methods, attach them to materials, and record sessions with a timer and self-rating.

## Scope

- CRUD for user-defined methods (create, read, update, delete)
- Attach custom methods to materials
- Run sessions with a generic timer + self-rating (1-4)
- Stats integration via existing `daily_logs.method_id`

### Out of Scope

- Card-based custom methods (FSRS)
- Custom method templates / preset library
- Dedicated management page (`/profile/methods`)
- Sharing methods between users

## Data Model

### `learning_methods` table changes

Add three columns:

```sql
ALTER TABLE learning_methods
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN description TEXT,
  ADD COLUMN default_duration_sec INTEGER;

ALTER TABLE learning_methods
  ADD CONSTRAINT chk_user_method
  CHECK (is_system = true OR user_id IS NOT NULL);
```

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | UUID, nullable | Owner. NULL for system methods |
| `description` | TEXT, nullable | User's note about the method |
| `default_duration_sec` | INTEGER, nullable | Timer target. NULL = stopwatch mode |

- `slug`: generated from `user_id` + sanitized name (e.g., `custom_{userId_prefix}_{snake_name}`). UNIQUE constraint preserved.
- `category`: uses existing CHECK constraint (`memory`, `comprehension`, `focus`, `consolidation`, `general`).
- `is_system`: `false` for user-defined methods.

### RLS policies

```sql
-- Anyone can read system methods; users can read their own custom methods
CREATE POLICY select_methods ON learning_methods FOR SELECT
  USING (is_system = true OR user_id = auth.uid());

-- Users can insert/update/delete only their own custom methods
CREATE POLICY insert_methods ON learning_methods FOR INSERT
  WITH CHECK (is_system = false AND user_id = auth.uid());

CREATE POLICY update_methods ON learning_methods FOR UPDATE
  USING (is_system = false AND user_id = auth.uid());

CREATE POLICY delete_methods ON learning_methods FOR DELETE
  USING (is_system = false AND user_id = auth.uid());
```

### No changes to existing tables

- `material_methods`: works as-is. Custom methods link through `method_id` FK.
- `sessions`: `method_id` FK + `self_rating` + `meta` JSONB cover custom method sessions.
- `daily_logs`: `method_id` aggregation includes custom methods automatically.

## Deletion Strategy

Hard delete with referential protection:

- If sessions exist for the method, deletion fails with error: "This method has recorded sessions and cannot be deleted."
- `material_methods` rows cascade on delete. The existing `remove_material_method` RPC enforces a minimum of 1 method per material, so if the custom method is the material's only method, the server action rejects deletion with: "This method is the only method on a material. Remove the material-method link first."
- Server action checks `sessions` count before attempting delete.

## UI Design

### Method Selection (extended MethodSelector)

The existing `MethodSelector` component groups methods by category. Custom methods appear in their assigned category alongside system methods.

- Custom methods display a small edit icon (pencil). System methods have no icon.
- A "+ Create method" button appears below the method list.
- Clicking the edit icon opens the edit bottom sheet.

### Create / Edit Bottom Sheet

Fields:

| Field | Required | Validation | Placeholder |
|-------|----------|------------|-------------|
| Name | Yes | 1-50 chars, unique per user | "e.g., Feynman Technique" |
| Category | Yes | One of 5 categories | -- |
| Description | No | Max 500 chars | "e.g., Explain learned content in your own words" |
| Target duration | No | 1-180 minutes | "25" |

- Edit mode shows a delete button at the bottom.
- Delete button triggers a confirmation dialog. If sessions exist, shows an error instead.

### Dark Mode

All new components follow existing Tailwind `dark:` class patterns. No custom color values.

## Session Execution

### Routing

```typescript
// session/[id]/page.tsx
switch (info.methodSlug) {
  case "pomodoro":      return <PomodoroPlayer />;
  case "elaboration":   return <ElaborationPlayer />;
  case "srs":           return <SessionPlayer />;
  case "interleaving":  return <SessionPlayer />;
  default:              return <CustomMethodPlayer />;
}
```

The `default` case handles all custom methods. Free Study can also migrate to this player in the future.

### CustomMethodPlayer

Two-step flow:

1. **Timer screen**
   - If `default_duration_sec` is set: countdown timer. Notification on completion. User can extend or finish early.
   - If `default_duration_sec` is NULL: stopwatch. User presses "Complete" manually.
   - Pause / resume support.
   - Displays method name and material title.

2. **Self-rating screen**
   - 4-button rating (1: Hard, 2: Somewhat hard, 3: Normal, 4: Easy).
   - Shows elapsed time.
   - Submit records the session.

### Completion

`completeCustomSession` server action:

- Validates session ownership and status.
- Saves `self_rating` and `duration_sec` to the session.
- Stores `{ actual_duration_sec, target_duration_sec }` in `sessions.meta`.
- Upserts `daily_logs` via existing RPC (same as Pomodoro path).
- Redirects to session summary.

### Session Summary

Reuses existing summary page. Displays:

- Method name, material title
- Duration (actual vs. target if applicable)
- Self-rating
- Option to start Wakeful Rest

## Method Allowlist Changes

Currently `MATERIAL_METHOD_SLUGS` restricts which methods can attach to materials. This changes to a dynamic check:

```typescript
// Before: static allowlist
if (!MATERIAL_METHOD_SLUGS.includes(method.slug)) { ... }

// After: allow system wizard methods + user's own custom methods
if (!MATERIAL_METHOD_SLUGS.includes(method.slug) && method.user_id !== user.id) { ... }
```

`getMethods()` query also changes to return system methods + current user's custom methods.

## Validation

Zod schemas:

```typescript
const createMethodSchema = z.object({
  name: z.string().min(1).max(50),
  category: z.enum(["memory", "comprehension", "focus", "consolidation", "general"]),
  description: z.string().max(500).optional(),
  default_duration_sec: z.number().int().min(60).max(10800).nullable(),
});
```

Server-side uniqueness check: `(user_id, name)` must be unique (enforced at DB level via partial unique index).

## Testing Strategy

| Layer | What to test |
|-------|-------------|
| Small | Slug generation, validation schemas, timer logic |
| Medium | CRUD server actions, RLS policies, deletion protection, allowlist logic |
| Large | Create method -> attach to material -> run session -> verify stats |
