# React Conventions

## Project Structure

```
frontend/src/
├── api/             ← all API call functions
│   ├── tickets.js
│   └── users.js
├── components/      ← reusable UI components
│   ├── TicketCard.jsx         ← used in both kanban columns and manager boxes
│   ├── TicketDetailModal.jsx  ← comments + edit, shared by both dashboards
│   ├── StatusDot.jsx          ← colored status circle, status -> color map
│   └── Navbar.jsx
├── pages/           ← one file per route/screen
│   ├── WorkerDashboard.jsx    ← kanban board, drag-and-drop, personal tickets
│   ├── ManagerDashboard.jsx   ← per-worker ticket grid, reassignment
│   ├── Archive.jsx            ← read-only list of done tickets
│   └── CreateTicketPage.jsx   ← manager creates + assigns a new ticket
├── utils/           ← small pure helpers shared across components/pages
│   └── date.js                ← dd-mm-yyyy display formatting, todayISO()
├── main.jsx         ← app entry point, role-based redirect at "/"
└── index.css        ← global styles
```

## Naming Conventions

- Component files: `PascalCase.jsx` (e.g. `TicketCard.jsx`)
- Non-component files: `camelCase.js` (e.g. `tickets.js`)
- CSS classes: `kebab-case`

## API Calls

All API calls are defined in `src/api/` — never write fetch calls directly inside components.

```javascript
// src/api/tickets.js
const API_URL = import.meta.env.VITE_API_URL;

export async function getTickets(token) {
  const res = await fetch(`${API_URL}/tickets`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

## Auth Token

Clerk provides the JWT token. Attach it to every API request:

```javascript
import { useAuth } from "@clerk/react";

const { getToken } = useAuth();
const token = await getToken();
```

## Role-Based UI

Role is **not** read from Clerk session claims — Clerk only handles auth, not app roles. Every
page fetches the current app user from the backend (which owns the `role` column) and branches
on that:

```javascript
import { useAuth } from "@clerk/react";
import { getCurrentUser } from "../api/users";

const { getToken } = useAuth();
const token = await getToken();
const currentUser = await getCurrentUser(token); // GET /api/users/me
const isManager = currentUser.role === "manager";
```

This is also how route guards work: `WorkerDashboard`/`ManagerDashboard` each fetch the current
user on mount and redirect away (`navigate("/manager")` / `navigate("/worker")`) if the role
doesn't match the page.

## Conditional Auth Rendering

`@clerk/react` does not export `SignedIn` / `SignedOut` components. Use `useAuth()` instead:

```javascript
import { useAuth, SignInButton, UserButton } from "@clerk/react";

const { isSignedIn, isLoaded } = useAuth();
if (!isLoaded) return null;
```

## Component Structure

Keep components small and focused. A component should do one thing:

```jsx
// Good — focused
export default function TicketCard({ ticket }) {
  return (
    <div className="ticket-card">
      <h3>{ticket.title}</h3>
      <span>{ticket.status}</span>
    </div>
  );
}
```

## Environment Variables

All env variables must be prefixed with `VITE_` to be accessible in the frontend:

```javascript
const API_URL = import.meta.env.VITE_API_URL;
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
```

Defined in `frontend/.env.local` (dev) — never committed to Git.

## Linting

This project uses **oxlint** (not ESLint):

```bash
npm run lint
```
