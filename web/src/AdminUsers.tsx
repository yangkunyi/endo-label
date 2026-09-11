import { useState, type FormEvent } from "react";
import useSWR, { mutate } from "swr";
import {
  adminUserPath,
  adminUsersPath,
  getJson,
  sendJson,
  type AdminUser,
  type AdminUsersResponse,
  type CreateUserResponse,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

const ROLE_FIELDS = ["admin", "reviewer", "annotator"] as const;
type RoleField = (typeof ROLE_FIELDS)[number];
type Roles = Record<RoleField, boolean>;

function UserRow({ user, refresh }: { user: AdminUser; refresh: () => Promise<unknown> }) {
  const [error, setError] = useState<string | null>(null);

  async function patch(body: { roles?: Roles; disabled?: boolean }) {
    setError(null);
    try {
      await sendJson(adminUserPath(user.username), "PATCH", body);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Account");
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="flex items-center gap-3">
        <span className="font-medium">{user.username}</span>
        {user.disabled ? (
          <span className="text-xs font-semibold uppercase text-destructive">disabled</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {ROLE_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-1">
            <input
              type="checkbox"
              aria-label={`${field} role for ${user.username}`}
              checked={user.roles[field]}
              onChange={(event) =>
                patch({ roles: { ...user.roles, [field]: event.target.checked } })
              }
            />
            {field}
          </label>
        ))}
        <Button
          type="button"
          size="sm"
          variant={user.disabled ? "outline" : "destructive"}
          onClick={() => patch({ disabled: !user.disabled })}
        >
          {user.disabled ? "Enable" : "Disable"}
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}

export function AdminUsers() {
  const { data, error, isLoading } = useSWR(adminUsersPath(), getJson<AdminUsersResponse>);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<Roles>({
    admin: false,
    reviewer: false,
    annotator: true,
  });
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function refresh() {
    await mutate(adminUsersPath());
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);
    setTemporaryPassword(null);
    try {
      const body = await sendJson<CreateUserResponse>(adminUsersPath(), "POST", {
        username,
        roles,
        password: password ? password : undefined,
      });
      setTemporaryPassword(body.temporary_password);
      setUsername("");
      setPassword("");
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create Account");
    }
  }

  return (
    <main className="h-full overflow-auto p-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={create}>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Username
          <Input
            aria-label="New username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Temporary password (blank generates one)
          <Input
            aria-label="Temporary password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {ROLE_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              aria-label={`new ${field} role`}
              checked={roles[field]}
              onChange={(event) => setRoles({ ...roles, [field]: event.target.checked })}
            />
            {field}
          </label>
        ))}
        <Button type="submit">Create Account</Button>
      </form>
      {temporaryPassword ? (
        <p role="status" className="mt-2 text-sm">
          Temporary password: <code className="font-mono">{temporaryPassword}</code>
        </p>
      ) : null}
      {createError ? <p role="alert" className="mt-2 text-sm">{createError}</p> : null}

      <section className="mt-6">
        <h2 className="text-sm font-medium">
          Accounts {data ? <span className="text-muted-foreground">({data.users.length})</span> : null}
        </h2>
        {isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm">
            {error instanceof Error ? error.message : "Could not load Accounts"}
          </p>
        ) : null}
        <ul className="mt-2">
          {data?.users.map((user) => (
            <UserRow key={user.id} user={user} refresh={refresh} />
          ))}
        </ul>
      </section>
    </main>
  );
}
