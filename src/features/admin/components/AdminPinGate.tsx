/**
 * PIN entry gate rendered on /admin before an admin session is unlocked.
 *
 * Keeps /admin publicly reachable on any host without Supabase login while gating
 * dashboard UI and server functions behind server-side PIN verification.
 *
 * Exports: AdminPinGate
 * Depends on: react, @tanstack/react-router, lucide-react, pin.functions
 */

import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { unlockAdminWithPin } from "../api/pin.functions";

type AdminPinGateProps = {
  onUnlocked: () => Promise<void> | void;
};

/**
 * Full-screen PIN prompt for the /admin layout route.
 * @param props.onUnlocked - callback invoked after the server issues the PIN cookie
 * @returns PIN prompt UI
 */
export function AdminPinGate({ onUnlocked }: AdminPinGateProps): React.ReactElement {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = pin.trim();
    if (!trimmed) {
      setError("Enter the PIN.");
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await unlockAdminWithPin({ data: { pin: trimmed } });
      if (!result.ok) {
        setError(result.error);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      await onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify PIN.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <Lock className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin</p>
            <h1 className="text-lg font-semibold leading-tight">kinetic-canvas</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="admin-pin-input" className="text-sm font-medium">
              Admin PIN
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="admin-pin-input"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={12}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter PIN"
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 font-mono text-sm tracking-widest outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPin ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Unlocking…" : "Unlock"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link to="/feed" className="text-xs text-muted-foreground hover:underline">
            ← Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}
