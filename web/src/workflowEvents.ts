/** The workflow event channel: the server pushes assignment transitions here.

Every transition publishes `{action, clip_id, task_type, state, …}`. Lists and
boards never apply those payloads themselves — they refetch, which is the only
way a cached page can be sure it matches the server. A dropped connection is the
browser's job to reopen; when it does, the server greets the subscriber with a
`resync` frame and the client refetches everything it shows, so events missed
while it was away cannot leave a stale list on screen.
*/

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { itemsPath, mePath, myItemsPath } from "./api";

export const WORKFLOW_EVENTS_PATH = "/api/events";

/** The frames the server sends: `resync` on (re)connect, then one per transition. */
const RESYNC = "resync";
const TRANSITION = "transition";

/** The slice of EventSource the channel uses, so a test can stand in for it. */
export type WorkflowSource = {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
};

export type WorkflowKeyFilter = (key: unknown) => boolean;

/** Whether one cached key goes stale when an Assignment moves.

The lists, the board, and the desk's per-item capability view do; identity
(`/api/me`) does not — roles do not move with an Assignment.
*/
export function workflowKey(key: unknown): boolean {
  if (typeof key !== "string") {
    return false;
  }
  return (
    key === myItemsPath() ||
    key.startsWith(itemsPath()) ||
    key.startsWith(`${mePath()}?`)
  );
}

/** One subscription: refetch on every frame, and close the source on teardown. */
export function subscribeWorkflowEvents(
  source: WorkflowSource,
  revalidate: (filter: WorkflowKeyFilter) => unknown,
): () => void {
  const refetch = () => {
    revalidate(workflowKey);
  };
  source.addEventListener(RESYNC, refetch);
  source.addEventListener(TRANSITION, refetch);
  return () => {
    source.close();
  };
}

/** Subscribe the app shell to the workflow channel for as long as it is mounted. */
export function useWorkflowEvents(): void {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const source = new EventSource(WORKFLOW_EVENTS_PATH);
    return subscribeWorkflowEvents(source, (filter) => mutate((key) => filter(key)));
  }, [mutate]);
}
