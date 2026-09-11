import { useState, type FormEvent } from "react";
import useSWR, { mutate } from "swr";
import {
  getJson,
  projectPath,
  projectsPath,
  sendJson,
  type ProjectResponse,
  type ProjectRow,
  type ProjectsResponse,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

function ProjectRow({
  project,
  refresh,
}: {
  project: ProjectRow;
  refresh: () => Promise<unknown>;
}) {
  const [hospital, setHospital] = useState(project.hospital);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await sendJson<ProjectResponse>(projectPath(project.id), "PATCH", { hospital });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update Project");
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{project.name}</span>
        <span className="text-xs text-muted-foreground">
          {project.clips.length} Clip{project.clips.length === 1 ? "" : "s"}
        </span>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={save}>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hospital
          <Input
            aria-label={`Hospital for ${project.name}`}
            value={hospital}
            onChange={(event) => setHospital(event.target.value)}
          />
        </label>
        <Button type="submit" size="sm">
          Save
        </Button>
      </form>
      {project.clips.length ? (
        <p className="text-xs text-muted-foreground">
          {project.clips.map((clip) => `${clip.id} (${clip.kind})`).join(", ")}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}

export function AdminProjects() {
  const { data, error, isLoading } = useSWR(projectsPath(), getJson<ProjectsResponse>);
  const [name, setName] = useState("");
  const [hospital, setHospital] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function refresh() {
    await mutate(projectsPath());
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);
    try {
      await sendJson<ProjectResponse>(projectsPath(), "POST", { name, hospital });
      setName("");
      setHospital("");
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create Project");
    }
  }

  return (
    <main className="h-full overflow-auto p-6">
      <h1 className="text-xl font-semibold">Projects</h1>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={create}>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <Input
            aria-label="New project name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Hospital
          <Input
            aria-label="New project hospital"
            value={hospital}
            onChange={(event) => setHospital(event.target.value)}
          />
        </label>
        <Button type="submit">Create Project</Button>
      </form>
      {createError ? <p role="alert" className="mt-2 text-sm">{createError}</p> : null}

      <section className="mt-6">
        <h2 className="text-sm font-medium">
          Projects {data ? <span className="text-muted-foreground">({data.projects.length})</span> : null}
        </h2>
        {isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm">
            {error instanceof Error ? error.message : "Could not load Projects"}
          </p>
        ) : null}
        <ul className="mt-2">
          {data?.projects.map((project) => (
            <ProjectRow key={project.id} project={project} refresh={refresh} />
          ))}
        </ul>
      </section>
    </main>
  );
}
