import { Navigate, Outlet, useNavigate } from "react-router-dom";
import useSWR, { mutate } from "swr";
import { getJson, sendJson, type Me } from "./api";
import { Button } from "./components/ui/button";

export function AppShell() {
  const navigate = useNavigate();
  const { data, error } = useSWR("/api/me", getJson<Me>);
  if (!data && !error) {
    return <p className="p-6">Loading…</p>;
  }
  if (error || !data) {
    return <Navigate to="/login" replace />;
  }

  async function logout() {
    await sendJson("/api/auth/logout", "POST");
    await mutate("/api/me", undefined, { revalidate: false });
    navigate("/login");
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-end gap-3 border-b border-border px-3 py-2">
        <span className="text-sm">{data.username}</span>
        <Button type="button" variant="ghost" size="sm" onClick={logout}>
          Log out
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
