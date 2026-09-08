import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { mutate } from "swr";
import { sendJson, type Me } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const me = await sendJson<Me>("/api/auth/login", "POST", { username, password });
      await mutate("/api/me", me, { revalidate: false });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Log in</h1>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <Input
          aria-label="Username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Input
          aria-label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <p role="alert">{error}</p> : null}
        <Button type="submit">Log in</Button>
      </form>
    </main>
  );
}
