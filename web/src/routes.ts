/** The paths the shell links to and the router serves. */
import type { MeCapabilities } from "./api";

/** The workbench: the Clip rail and the desk for the Clip in the URL. */
export const DESK_PATH = "/desk";

/** The signed-in Account's own items. */
export const MY_TASKS_PATH = "/tasks";

/**
 * Whether an Account opens on My Tasks rather than the desk.
 *
 * The desk is the shared reading surface, so only the Accounts whose work lives
 * in a queue — annotators and reviewers — are dropped into it.
 */
export function startsOnMyTasks(me: { capabilities?: MeCapabilities } | undefined): boolean {
  return Boolean(me?.capabilities?.annotate || me?.capabilities?.review);
}
