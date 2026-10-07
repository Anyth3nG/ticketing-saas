#!/usr/bin/env bash
# Render a .env file from a .env.example template, taking every value from the
# environment. Prints the result on stdout; writes nothing on failure.
#
# WHY THIS EXISTS
#
# The deploy workflows used to write backend/.env from a fixed heredoc and scp
# it over on every run. A variable added in GitHub Actions did nothing until
# someone remembered to edit that heredoc too -- and the app then read an empty
# string and behaved as though the feature had never been configured. No error,
# no log line, just quietly wrong behaviour. It cost a day on staging once.
#
# Here .env.example is the ONLY list. Every key in it must have a non-empty
# value in the environment or this exits non-zero and names the keys that are
# missing, so the failure is a red build instead of a subtly broken app.
#
# A key may be legitimately empty -- ADMIN_EMAIL meaning "nobody" -- and those
# lines are marked with a trailing "# optional" in the template.
set -euo pipefail

TEMPLATE="${1:?usage: render-env.sh <path/to/.env.example>}"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: no such template: $TEMPLATE" >&2
  exit 1
fi

rendered=""
missing=()

while IFS= read -r line || [ -n "$line" ]; do
  # Blank lines and whole-line comments carry no key.
  [[ "$line" =~ ^[[:space:]]*(#.*)?$ ]] && continue
  [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]] || continue
  key="${BASH_REMATCH[1]}"

  optional=false
  [[ "$line" == *"# optional"* ]] && optional=true

  # Indirect expansion: the value comes from the environment, never from the
  # template. The template's own values are placeholders for humans.
  value="${!key-}"

  if [ -z "$value" ] && [ "$optional" = false ]; then
    missing+=("$key")
    continue
  fi

  rendered+="${key}=${value}"$'\n'
done < "$TEMPLATE"

# Reported together, not one at a time: three missing variables should take one
# build to find, not three.
if [ ${#missing[@]} -gt 0 ]; then
  {
    echo "ERROR: no value supplied for: ${missing[*]}"
    echo
    echo "Every key in $TEMPLATE must be set in the workflow's env: block,"
    echo "resolved from GitHub Variables (non-sensitive) or Secrets."
    echo "Add it there -- or, if empty is a valid configuration for that key,"
    echo "mark its line in the template with a trailing '# optional'."
  } >&2
  exit 1
fi

printf '%s' "$rendered"
