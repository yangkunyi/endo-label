/**
 * Routing behaviour, rendered to static markup: this repo has no DOM test
 * environment, so the shell is rendered on the server with `/api/me` and the
 * task list already answered — enough to see which link the nav offers and
 * where following it lands.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { describe, expect, it } from "vitest";
import App from "./App";
import { mePath, myItemsPath, type Me, type MyItemsResponse } from "./api";
import { DESK_PATH, MY_TASKS_PATH, startsOnMyTasks } from "./routes";

const ANNOTATOR: Me = {
  username: "alice",
  roles: { admin: false, reviewer: false, annotator: true },
  capabilities: { admin: false, annotate: true, review: false },
};

const REVIEWER: Me = {
  username: "carol",
  roles: { admin: false, reviewer: true, annotator: false },
  capabilities: { admin: false, annotate: false, review: true },
};

const ADMIN: Me = {
  username: "admin",
  roles: { admin: true, reviewer: false, annotator: false },
  capabilities: { admin: true, annotate: false, review: false },
};

/** One Account holding both stacked queue roles. */
const ANNOTATOR_REVIEWER: Me = {
  username: "dana",
  roles: { admin: false, reviewer: true, annotator: true },
  capabilities: { admin: false, annotate: true, review: true },
};

const NO_ITEMS: MyItemsResponse = { items: [] };

/** The whole app at `path`, as the server would hand it an answered `/api/me` and task list. */
function renderAt(path: string, me: Me): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        SWRConfig,
        { value: { fallback: { [mePath()]: me, [myItemsPath()]: NO_ITEMS } } },
        createElement(App),
      ),
    ),
  );
}

/** Where the shell's nav link carrying this label points. */
function navTarget(html: string, label: string): string {
  const match = html.match(new RegExp(`href="([^"]+)"[^>]*>${label}<`));
  if (match === null) {
    throw new Error(`no nav link labelled ${label}`);
  }
  return match[1];
}

/** The desk renders its own chrome; My Tasks renders its heading. */
function showsDesk(html: string): boolean {
  return html.includes(">Workbench</h1>");
}

function showsMyTasks(html: string): boolean {
  return html.includes(">My Tasks</h1>");
}

describe("startsOnMyTasks", () => {
  it("sends the queue-driven Accounts to My Tasks", () => {
    expect(startsOnMyTasks(ANNOTATOR)).toBe(true);
    expect(startsOnMyTasks(REVIEWER)).toBe(true);
    expect(startsOnMyTasks(ANNOTATOR_REVIEWER)).toBe(true);
  });

  it("leaves everyone else on the desk", () => {
    expect(startsOnMyTasks(ADMIN)).toBe(false);
    expect(startsOnMyTasks(undefined)).toBe(false);
    // A payload answered without capabilities is not a queue account either.
    expect(startsOnMyTasks({})).toBe(false);
  });
});

describe("the shell's landing routes", () => {
  it("opens an annotator on My Tasks and an admin on the desk", () => {
    expect(showsMyTasks(renderAt("/", ANNOTATOR))).toBe(true);
    expect(showsDesk(renderAt("/", ADMIN))).toBe(true);
  });

  it("points the Desk nav link at the desk for every Account that sees it", () => {
    for (const me of [ANNOTATOR, REVIEWER, ADMIN]) {
      expect(navTarget(renderAt("/", me), "Desk")).toBe(DESK_PATH);
    }
  });

  it("keeps My Tasks as its own nav link", () => {
    expect(navTarget(renderAt("/", ANNOTATOR), "My Tasks")).toBe(MY_TASKS_PATH);
  });

  it("lands an annotator's Desk link on the desk, not on My Tasks", () => {
    const deskLink = navTarget(renderAt("/", ANNOTATOR), "Desk");
    const landed = renderAt(deskLink, ANNOTATOR);
    expect(showsDesk(landed)).toBe(true);
    expect(showsMyTasks(landed)).toBe(false);
  });
});
