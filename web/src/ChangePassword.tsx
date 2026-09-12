import { useState, type FormEvent } from "react";
import { sendJson } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

/**
 * The owner's own password change: the admin hands out a temporary password and
 * the Account replaces it here. The current password has to be proven first.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await sendJson("/api/auth/password", "POST", {
        current_password: current,
        new_password: next,
      });
      setMessage("Password changed.");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Change password
      </Button>
      {open ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
          <Input
            aria-label="Current password"
            type="password"
            className="h-7 max-w-40 text-xs"
            autoFocus
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
          <Input
            aria-label="New password"
            type="password"
            className="h-7 max-w-40 text-xs"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || !current.trim() || !next.trim()}>
            Save password
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>
            Cancel
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
