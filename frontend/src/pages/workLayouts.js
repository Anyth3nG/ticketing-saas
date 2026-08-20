import StandardWorkBoard from "./StandardWorkBoard";
import CustomWorkBoard from "./CustomWorkBoard";
import { usesCustomBoard } from "../utils/customBoard";

// The layouts /manager/work can render.
//
// TO ADD A LAYOUT: write the board as its own page component, then add one
// entry here. Nothing else needs touching -- ManagerWorkDashboard builds the
// switcher from this list, and the stored preference falls back to the default
// if it names a layout that no longer exists.
//
// `restricted` marks a layout that only works for accounts on the custom-board
// list: its columns map to statuses the backend only accepts from those
// accounts (see backend/custom_board.py), so offering it to anyone else would
// show an empty board they couldn't add to.
export const WORK_LAYOUTS = [
  {
    id: "standard",
    label: "Standard",
    description: "The shared board: To Do, Personal Work, Working On, Awaiting Approval.",
    Component: StandardWorkBoard,
    restricted: false,
  },
  {
    id: "day",
    label: "Day view",
    description:
      "One day at a time, with Priority, Meetings, Project-Work, Contact and Send.",
    Component: CustomWorkBoard,
    restricted: true,
  },
];

const DEFAULT_LAYOUT_ID = "standard";

// Which layouts this account may choose between. A single entry means there's
// nothing to switch, and the page hides the control entirely.
export function layoutsFor(user) {
  return WORK_LAYOUTS.filter((layout) => !layout.restricted || usesCustomBoard(user));
}

// What to show before any choice is made: the account's own board, so someone
// whose board is the day view lands on it rather than having to pick.
export function defaultLayoutId(user) {
  return usesCustomBoard(user) ? "day" : DEFAULT_LAYOUT_ID;
}

export function findLayout(user, id) {
  const available = layoutsFor(user);
  return (
    available.find((layout) => layout.id === id) ??
    available.find((layout) => layout.id === defaultLayoutId(user)) ??
    available[0]
  );
}
