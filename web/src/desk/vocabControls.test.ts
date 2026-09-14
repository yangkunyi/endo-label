import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyedMutator } from "swr";
import {
  vocabListPath,
  type ScopedVocab,
  type Vocab,
  type VocabPickerItem,
} from "../api";
import { ensureVocabName, pickerItemFor, vocabControlsOf } from "./vocabControls";

/** The three list shapes a vocab payload always carries; only `items` is scoped. */
const LISTS: Vocab = { phases: [], class_tags: [], triples: [] };

function item(over: Partial<VocabPickerItem> & { id: number; kind: VocabPickerItem["kind"] }): VocabPickerItem {
  return {
    name: "",
    instrument: "",
    verb: "",
    target: "",
    candidate: false,
    ...over,
  };
}

const PHASE = item({ id: 1, kind: "phase", name: "Preparation" });
const CLASS_TAG = item({ id: 2, kind: "class", name: "grasper" });
const TRIPLE = item({
  id: 3,
  kind: "triplet",
  name: "Hook / Pull / Tissue",
  instrument: "Hook",
  verb: "Pull",
  target: "Tissue",
});
const CANDIDATE = item({ id: 4, kind: "phase", name: "Calot", candidate: true });
const ITEMS = [PHASE, CLASS_TAG, TRIPLE, CANDIDATE];

describe("vocabControlsOf", () => {
  it("grants nothing and scopes nowhere while the Clip's word list is not loaded", () => {
    expect(vocabControlsOf(undefined)).toEqual({
      canRegistryWrite: false,
      canEditVocab: false,
      canCreateCandidate: false,
      projectId: null,
      items: [],
    });
  });

  it("carries the Project's permissions, its id, and the picker it answered with", () => {
    const vocab: ScopedVocab = {
      ...LISTS,
      clip_id: "CLIPA",
      project_id: 7,
      permissions: { registry_write: true, vocab_edit: false, candidate_create: true },
      items: ITEMS,
    };
    expect(vocabControlsOf(vocab)).toEqual({
      canRegistryWrite: true,
      canEditVocab: false,
      canCreateCandidate: true,
      projectId: 7,
      items: ITEMS,
    });
  });

  it("reads a payload without permissions or picker as a locked, empty Project", () => {
    expect(vocabControlsOf({ ...LISTS, project_id: 7 })).toEqual({
      canRegistryWrite: false,
      canEditVocab: false,
      canCreateCandidate: false,
      projectId: 7,
      items: [],
    });
  });
});

describe("pickerItemFor", () => {
  it("finds the enabled word a phase or class label already carries", () => {
    expect(pickerItemFor(ITEMS, "phase", { name: "Preparation" })).toBe(PHASE);
    expect(pickerItemFor(ITEMS, "class", { name: "grasper" })).toBe(CLASS_TAG);
  });

  it("matches a triplet row by all three cells, not by any one of them", () => {
    expect(
      pickerItemFor(ITEMS, "triplet", {
        instrument: "Hook",
        verb: "Pull",
        target: "Tissue",
      }),
    ).toBe(TRIPLE);
    expect(
      pickerItemFor(ITEMS, "triplet", {
        instrument: "Hook",
        verb: "Pull",
        target: "Other",
      }),
    ).toBeUndefined();
  });

  it("never matches a word of another kind, a candidate, or nothing at all", () => {
    // The phase named Preparation is not the class named Preparation.
    expect(pickerItemFor(ITEMS, "class", { name: "Preparation" })).toBeUndefined();
    expect(pickerItemFor(ITEMS, "phase", { name: "Calot" })).toBeUndefined();
    expect(pickerItemFor(ITEMS, "phase", { name: "Closure" })).toBeUndefined();
  });
});

/** The desk's scoped picker mutator, recording how the revalidate contract is called. */
function recordingMutate(log: string[] = []) {
  const calls: unknown[][] = [];
  const mutate = (async (...args: unknown[]) => {
    calls.push(args);
    log.push("revalidate");
    return undefined;
  }) as unknown as KeyedMutator<ScopedVocab>;
  return { mutate, calls };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("ensureVocabName", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves a word the Clip already offers alone — no write, no refetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { mutate, calls } = recordingMutate();

    await expect(
      ensureVocabName("phases", "Preparation", ["Preparation"], "CLIPA", mutate),
    ).resolves.toBe("Preparation");
    // Surrounding whitespace is the labeler's, not a second name.
    await expect(
      ensureVocabName("phases", " Preparation ", ["Preparation"], "CLIPA", mutate),
    ).resolves.toBe("Preparation");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("treats an empty name as no name", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { mutate, calls } = recordingMutate();

    await expect(ensureVocabName("phases", "   ", [], "CLIPA", mutate)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("asks the Clip to enable the trimmed word, then revalidates instead of injecting it", async () => {
    const log: string[] = [];
    const fetched: unknown[][] = [];
    const fetchMock = vi.fn(async (...args: unknown[]) => {
      fetched.push(args);
      log.push("post");
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { mutate, calls } = recordingMutate(log);

    await expect(
      ensureVocabName("phases", "  Calot  ", ["Preparation"], "CLIPA", mutate),
    ).resolves.toBe("Calot");

    expect(fetched).toEqual([
      [
        vocabListPath("phases"),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Calot", clip_id: "CLIPA" }),
        },
      ],
    ]);
    // The registry write answers the desk-wide set; the desk reads the Clip's
    // Project set, so the scoped key is refetched — never handed a payload the
    // server never answered for this Project.
    expect(calls).toEqual([[]]);
    expect(log).toEqual(["post", "revalidate"]);
  });
});
