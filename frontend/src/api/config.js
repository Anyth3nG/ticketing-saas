// The API base URL.
//
// SAME ORIGIN. One hostname serves both the SPA and the API -- the shared
// proxy sends /api to the backend and everything else to this app's static
// files -- so this is a fixed relative path, identical in every environment.
//
// It used to be import.meta.env.VITE_API_URL?.trim(), and that variable is why
// this file has a comment at all. Vite inlines import.meta.env at BUILD time
// as a literal string substitution, so whitespace in the deploy variable was
// compiled straight into every request URL: a trailing newline in the test
// environment once turned every call into /api%0D%0A/... (fetch
// percent-encodes it), which 404'd the entire app while the backend was
// perfectly healthy and the URL looked correct everywhere a human could read
// it. A constant cannot arrive malformed, cannot arrive empty, and cannot
// differ between the two deploy environments -- so the trim is gone with it.
//
// The dev server still works because vite.config.js proxies /api to the local
// backend on :8000, which is the same shape as the container proxy.
export const API_URL = "/api";
