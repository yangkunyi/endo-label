import { useState, type FormEvent } from "react";
import useSWR, { mutate } from "swr";
import {
  getJson,
  registryArchivePath,
  registryCandidatePath,
  registryCandidatesPath,
  registryDisablePath,
  registryEnablePath,
  registryLabel,
  registryPath,
  registryPromotePath,
  registryRenamePath,
  registryRestorePath,
  sendJson,
  type RegistryBrowse,
  type RegistryCandidate,
  type RegistryItem,
  type RegistryKind,
} from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

const KINDS: RegistryKind[] = ["phase", "class", "triplet"];

type IdentityFields = {
  kind: RegistryKind;
  name: string;
  instrument: string;
  verb: string;
  target: string;
};

const EMPTY_IDENTITY: IdentityFields = {
  kind: "phase",
  name: "",
  instrument: "",
  verb: "",
  target: "",
};

function identityBody(fields: IdentityFields) {
  return {
    kind: fields.kind,
    name: fields.name,
    instrument: fields.instrument,
    verb: fields.verb,
    target: fields.target,
  };
}

function IdentityInputs({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: IdentityFields;
  onChange: (next: IdentityFields) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        Kind
        <select
          aria-label={`${idPrefix} kind`}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={value.kind}
          onChange={(event) =>
            onChange({ ...value, kind: event.target.value as RegistryKind })
          }
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      {value.kind === "triplet" ? (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Instrument
            <Input
              aria-label={`${idPrefix} instrument`}
              value={value.instrument}
              onChange={(event) => onChange({ ...value, instrument: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Verb
            <Input
              aria-label={`${idPrefix} verb`}
              value={value.verb}
              onChange={(event) => onChange({ ...value, verb: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Target
            <Input
              aria-label={`${idPrefix} target`}
              value={value.target}
              onChange={(event) => onChange({ ...value, target: event.target.value })}
            />
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-xs">
          Name
          <Input
            aria-label={`${idPrefix} name`}
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </label>
      )}
    </div>
  );
}

export function AdminVocab() {
  const { data, error, isLoading } = useSWR(registryPath(), getJson<RegistryBrowse>);
  const [createFields, setCreateFields] = useState<IdentityFields>(EMPTY_IDENTITY);
  const [candidateFields, setCandidateFields] = useState<IdentityFields>(EMPTY_IDENTITY);
  const [candidateProjectId, setCandidateProjectId] = useState<number | "">("");
  const [renameDrafts, setRenameDrafts] = useState<Record<number, string>>({});
  const [candidateDrafts, setCandidateDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    await mutate(registryPath());
  }

  async function run(action: () => Promise<unknown>) {
    setMessage(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await sendJson(registryPath(), "POST", identityBody(createFields));
      setCreateFields(EMPTY_IDENTITY);
    });
  }

  async function onCreateCandidate(event: FormEvent) {
    event.preventDefault();
    if (candidateProjectId === "") {
      setMessage("Choose a Project for the candidate");
      return;
    }
    await run(async () => {
      await sendJson(registryCandidatesPath(), "POST", {
        ...identityBody(candidateFields),
        project_id: candidateProjectId,
      });
      setCandidateFields(EMPTY_IDENTITY);
    });
  }

  if (error) {
    return (
      <main className="h-full overflow-auto p-6">
        <h1 className="mb-3 text-xl font-semibold">Vocab</h1>
        <p>{error instanceof Error ? error.message : "Could not load registry"}</p>
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="h-full overflow-auto p-6">
        <h1 className="mb-3 text-xl font-semibold">Vocab</h1>
        <p>Loading registry…</p>
      </main>
    );
  }

  const enabled = new Map(data.projects.map((project) => [project.id, new Set(project.enabled_ids)]));

  return (
    <main className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Vocab</h1>
      {message ? <p role="alert">{message}</p> : null}

      <section className="mb-8" aria-labelledby="registry-browse">
        <h2 id="registry-browse" className="mb-3 text-lg font-medium">
          Registry
        </h2>
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={onCreate}>
          <IdentityInputs idPrefix="create" value={createFields} onChange={setCreateFields} />
          <Button type="submit">Create</Button>
        </form>
        {data.items.length === 0 ? (
          <p>No registry names yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1 pr-3">Kind</th>
                <th className="py-1 pr-3">Name</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <RegistryRow
                  key={item.id}
                  item={item}
                  draft={renameDrafts[item.id] ?? registryLabel(item)}
                  onDraft={(value) => setRenameDrafts((prev) => ({ ...prev, [item.id]: value }))}
                  onRename={() =>
                    run(async () => {
                      const draft = renameDrafts[item.id] ?? registryLabel(item);
                      const body =
                        item.kind === "triplet"
                          ? tripleDraft(item, draft)
                          : { name: draft };
                      await sendJson(registryRenamePath(item.id), "POST", body);
                    })
                  }
                  onArchive={() =>
                    run(() => sendJson(registryArchivePath(item.id), "POST"))
                  }
                  onRestore={() =>
                    run(() => sendJson(registryRestorePath(item.id), "POST"))
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-8" aria-labelledby="enable-matrix">
        <h2 id="enable-matrix" className="mb-3 text-lg font-medium">
          Project enablement
        </h2>
        {data.projects.length === 0 || data.items.length === 0 ? (
          <p>Enable names after a Project and a registry entry exist.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-1 pr-3">Name</th>
                  {data.projects.map((project) => (
                    <th key={project.id} className="py-1 px-3">
                      {project.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-1 pr-3">
                      {registryLabel(item)}
                      {item.archived ? " (archived)" : ""}
                    </td>
                    {data.projects.map((project) => {
                      const isOn = enabled.get(project.id)?.has(item.id) ?? false;
                      return (
                        <td key={project.id} className="py-1 px-3">
                          <input
                            type="checkbox"
                            aria-label={`Enable ${registryLabel(item)} on ${project.name}`}
                            checked={isOn}
                            onChange={() =>
                              run(() =>
                                sendJson(
                                  isOn
                                    ? registryDisablePath(item.id)
                                    : registryEnablePath(item.id),
                                  "POST",
                                  { project_id: project.id },
                                ),
                              )
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="candidate-queue">
        <h2 id="candidate-queue" className="mb-3 text-lg font-medium">
          Candidate promotion
        </h2>
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={onCreateCandidate}>
          <label className="flex flex-col gap-1 text-xs">
            Project
            <select
              aria-label="candidate project"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={candidateProjectId}
              onChange={(event) =>
                setCandidateProjectId(event.target.value === "" ? "" : Number(event.target.value))
              }
            >
              <option value="">Select…</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <IdentityInputs
            idPrefix="candidate"
            value={candidateFields}
            onChange={setCandidateFields}
          />
          <Button type="submit">Add candidate</Button>
        </form>
        {data.projects.every((project) => project.candidates.length === 0) ? (
          <p>No candidates waiting.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.projects.flatMap((project) =>
              project.candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex flex-wrap items-center gap-2 border-b border-border py-2"
                >
                  <span className="text-sm">
                    {project.name}: {registryLabel(candidate)}
                  </span>
                  <Input
                    aria-label={`Edit candidate ${candidate.id}`}
                    className="max-w-xs"
                    value={candidateDrafts[candidate.id] ?? registryLabel(candidate)}
                    onChange={(event) =>
                      setCandidateDrafts((prev) => ({
                        ...prev,
                        [candidate.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      run(async () => {
                        const draft =
                          candidateDrafts[candidate.id] ?? registryLabel(candidate);
                        const body =
                          candidate.kind === "triplet"
                            ? tripleDraft(candidate, draft)
                            : { name: draft };
                        await sendJson(registryCandidatePath(candidate.id), "POST", body);
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      run(() => sendJson(registryPromotePath(candidate.id), "POST"))
                    }
                  >
                    Promote
                  </Button>
                </li>
              )),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}

function tripleDraft(
  item: Pick<RegistryItem | RegistryCandidate, "instrument" | "verb" | "target">,
  draft: string,
) {
  const parts = draft.split("/").map((part) => part.trim());
  return {
    instrument: parts[0] ?? item.instrument,
    verb: parts[1] ?? item.verb,
    target: parts[2] ?? item.target,
  };
}

function RegistryRow({
  item,
  draft,
  onDraft,
  onRename,
  onArchive,
  onRestore,
}: {
  item: RegistryItem;
  draft: string;
  onDraft: (value: string) => void;
  onRename: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <tr className="border-b border-border">
      <td className="py-1 pr-3">{item.kind}</td>
      <td className="py-1 pr-3">
        <Input
          aria-label={`Rename ${registryLabel(item)}`}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
        />
      </td>
      <td className="py-1 pr-3">{item.archived ? "archived" : "active"}</td>
      <td className="py-1">
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="secondary" size="sm" onClick={onRename}>
            Rename
          </Button>
          {item.archived ? (
            <Button type="button" size="sm" onClick={onRestore}>
              Restore
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onArchive}>
              Archive
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
