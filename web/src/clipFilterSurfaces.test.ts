/**
 * The two surfaces of one stored selection, rendered to static markup.
 *
 * This repo has no DOM test environment, so the browser's entry stands in as a
 * `window` for the one render and the requests are answered from the SWR
 * fallback: a Clips fallback is keyed by the selection the surface asks with,
 * and a surface that asked with an uncorrected one simply misses it and draws
 * no Clips. That is what makes these renderings worth asserting on — the page
 * and the desk rail are pinned to the *corrected* request, not only to a
 * correct pure function.
 *
 * What a browser does with the corrected entry (writing it back) is an effect,
 * which a server render does not run; `clipFilters.test.ts` pins the pure
 * instruction and the end-to-end spec pins the write.
 *
 * One render stands in for the server *refusing* the request instead: a refusal
 * is a request's error, and SWR keeps an error in a cache entry rather than in a
 * fallback, so `refused()` seeds the entry the surface then reads.
 */

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { expect, test } from "vitest";
import { ClipList } from "./ClipList";
import { ClipRail } from "./desk/ClipRail";
import {
  clipsPath,
  mePath,
  projectsPath,
  tagsPath,
  type ClipListResponse,
  type Me,
  type ProjectsResponse,
  type TagsResponse,
} from "./api";
import {
  CLIP_FILTERS_STORAGE_KEY,
  DEFAULT_CLIP_FILTERS,
  type ClipFilterSelection,
} from "./clipFilters";

const REFUSAL = "Only an admin can see every Clip.";

const ANNOTATOR: Me = {
  username: "alice",
  roles: { admin: false, reviewer: false, annotator: true },
  capabilities: { admin: false, annotate: true, review: false },
};

const ADMIN: Me = {
  username: "boss",
  roles: { admin: true, reviewer: false, annotator: false },
  capabilities: { admin: true, annotate: false, review: false },
};

const MINE: ClipListResponse = {
  clips: [{ id: "CLIP_A", kind: "jpeg", frame_count: 2, fps: 25 }],
};

const EVERY_CLIP: ClipListResponse = {
  clips: [
    { id: "CLIP_A", kind: "jpeg", frame_count: 2, fps: 25 },
    { id: "CLIP_B", kind: "jpeg", frame_count: 4, fps: 25 },
  ],
};

const PROJECTS: ProjectsResponse = {
  projects: [{ id: 1, name: "East Study", hospital: "Huashan", clips: [] }],
};

const TAGS: TagsResponse = { tags: ["east"] };

/**
 * A refusal as SWR holds it: the answered request's error, not its data.
 *
 * A fallback entry is data; only a cache entry carries an error, so this is what
 * a 403 leaves behind and what the surfaces' own error branch reads.
 */
function refused(message: string) {
  return {
    data: undefined,
    error: new Error(message),
    isLoading: false,
    isValidating: false,
  };
}

/**
 * One render with a stored entry standing in for this browser's localStorage.
 *
 * `refusal` stands in for the server refusing the request this render asks with:
 * no Clips are answered and the sentence is, which is what a browser that still
 * believes it is an admin sees once the server stops agreeing.
 */
function renderWithStored(
  component: ReactElement,
  stored: ClipFilterSelection | null,
  me: Me,
  refusal: string | null = null,
): string {
  const entries = new Map<string, string>();
  if (stored) {
    entries.set(CLIP_FILTERS_STORAGE_KEY, JSON.stringify(stored));
  }
  const previous = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    },
  };
  try {
    // Keyed by the selection a surface may ask with: `mine` is the corrected
    // scope, `all` the stored one only an admin may use. A refused request is
    // answered with an error instead of Clips, so it takes no fallback entry.
    const allClips = clipsPath({ ...DEFAULT_CLIP_FILTERS, scope: "all" });
    const fallback: Record<string, unknown> = {
      [mePath()]: me,
      [projectsPath()]: PROJECTS,
      [tagsPath()]: TAGS,
      [clipsPath({ ...DEFAULT_CLIP_FILTERS, scope: "mine" })]: MINE,
    };
    if (refusal === null) {
      fallback[allClips] = EVERY_CLIP;
    }
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {},
        createElement(
          SWRConfig,
          {
            value: {
              fallback,
              ...(refusal === null
                ? {}
                : { provider: () => new Map([[allClips, refused(refusal)]]) }),
            },
          },
          component,
        ),
      ),
    );
  } finally {
    (globalThis as unknown as { window?: unknown }).window = previous;
  }
}

const STORED_ALL: ClipFilterSelection = { project: "", tag: "", scope: "all" };

test("the Clips page asks with the scope the server would answer, not the stored one", () => {
  const html = renderWithStored(createElement(ClipList), STORED_ALL, ANNOTATOR);

  expect(html).toContain("CLIP_A");
  expect(html).not.toContain("CLIP_B");
  expect(html).not.toContain(REFUSAL);
  expect(html).toContain("showing your own Clips");
  // The scope is not a switch this Account is offered.
  expect(html).not.toContain("Show every Clip");
});

test("the desk rail clears the same stored scope, on the desk", () => {
  const html = renderWithStored(
    createElement(ClipRail, { activeClipId: "CLIP_A", width: 280 }),
    STORED_ALL,
    ANNOTATOR,
  );

  expect(html).toContain("CLIP_A");
  expect(html).not.toContain("CLIP_B");
  expect(html).not.toContain(REFUSAL);
  expect(html).toContain("showing your own Clips");
  expect(html).not.toContain("Show every Clip");
});

test("the admin keeps every Clip, and the rail carries the control to change it", () => {
  const page = renderWithStored(createElement(ClipList), STORED_ALL, ADMIN);
  expect(page).toContain("CLIP_B");
  expect(page).not.toContain("showing your own Clips");
  expect(page).toContain("Show every Clip");

  const rail = renderWithStored(
    createElement(ClipRail, { activeClipId: "CLIP_A", width: 280 }),
    STORED_ALL,
    ADMIN,
  );
  expect(rail).toContain("CLIP_B");
  expect(rail).not.toContain("showing your own Clips");
  expect(rail).toContain("Show every Clip");
});

test("a Project no option list carries cannot empty the page silently", () => {
  // Stored from a browser that last saw a Project this server no longer has:
  // nothing is asked with the dead name, and the page says which one went.
  const html = renderWithStored(
    createElement(ClipList),
    { project: "West Study", tag: "", scope: "mine" },
    ANNOTATOR,
  );

  expect(html).toContain("CLIP_A");
  // The sentence is in the markup with its quotes escaped, so its words are
  // what is pinned: the dead Project is named, not silently filtered away.
  expect(html).toContain("The stored Project &quot;West Study&quot; is not registered");
  expect(html).not.toContain("No Clips assigned to you.");
});

test("a refusal the server does send is still its own sentence, on both surfaces", () => {
  // The browser outlives the flag: `/api/me` still answers admin in this tab, so
  // both surfaces ask for `all` — which is the selection a correction cannot
  // reach — and the server answers with its sentence. Correcting a stale stored
  // scope must not quiet a refusal the server really does send.
  const page = renderWithStored(createElement(ClipList), STORED_ALL, ADMIN, REFUSAL);
  expect(page).toContain('role="alert"');
  expect(page).toContain(REFUSAL);
  expect(page).not.toContain("CLIP_A");
  expect(page).not.toContain("CLIP_B");
  expect(page).not.toContain("Loading Clips");

  const rail = renderWithStored(
    createElement(ClipRail, { activeClipId: "CLIP_A", width: 280 }),
    STORED_ALL,
    ADMIN,
    REFUSAL,
  );
  expect(rail).toContain(REFUSAL);
  expect(rail).not.toContain("CLIP_A");
  expect(rail).not.toContain("Loading Clips");
});
