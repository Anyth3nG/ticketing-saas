# React Conventions

## Project Structure

```
frontend/src/
├── api/             ← all API call functions
│   ├── tickets.js
│   └── users.js
├── components/      ← reusable UI components
│   ├── TicketCard.jsx
│   └── Navbar.jsx
├── pages/           ← one file per route/screen
│   ├── Dashboard.jsx
│   ├── TicketList.jsx
│   └── TicketDetail.jsx
├── main.jsx         ← app entry point
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

User role comes from Clerk's session claims. Use it to conditionally render manager vs worker views:

```javascript
import { useUser } from "@clerk/react";

const { user } = useUser();
const isManager = user?.publicMetadata?.role === "manager";
```

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
