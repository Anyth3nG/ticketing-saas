// The API base URL, trimmed.
//
// Vite inlines import.meta.env.VITE_API_URL at BUILD time -- it's a literal
// string substitution, not a runtime lookup -- so any stray whitespace in the
// deploy variable is compiled straight into every request URL. A trailing
// newline in the test environment's variable once turned every call into
// /api%0D%0A/... (fetch percent-encodes it), which 404'd the entire app while
// the backend was perfectly healthy and the URL looked correct everywhere a
// human could read it.
//
// Trimmed once, here, rather than in each api/*.js file: a new one added later
// picks this up by importing it, instead of having to remember the guard.
export const API_URL = import.meta.env.VITE_API_URL?.trim();
