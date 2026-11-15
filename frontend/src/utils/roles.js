// Where each role lands after sign-in, and where a page sends someone who
// opened it with the wrong role. One table, so the three places that used to
// each hardcode "manager or worker" can't disagree about a third role.
//
// The backend is what actually enforces roles (see backend/roles.py); this only
// decides which page to show.
export function homePathFor(role) {
  if (role === "manager") return "/manager";
  if (role === "bot") return "/bot";
  return "/worker";
}
