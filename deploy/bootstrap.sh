#!/usr/bin/env bash
# Prepare a deploy box to run the containerized stack. Runs ON THE EC2 BOX,
# invoked over SSH by the GitHub Actions workflow, BEFORE `docker login` and
# before deploy.sh. Idempotent -- safe to run on every deploy, and a no-op once
# the box is already prepared.
#
# WHY THIS EXISTS
#
# deploy.sh opens with `docker compose pull`, and the workflow's deploy step
# opens with `docker login`. Both assume a Docker that nothing ever installed:
# the bare-metal boxes were built for a systemd + host-nginx + venv deployment
# and have no docker, no containerd, no compose plugin. The cutover runbook
# went straight from "start the instance" to "run the deploy workflow", so the
# first real deploy died on `docker: command not found` before reaching any of
# the logic that had been tested.
#
# THIS MUST RUN IN ITS OWN SSH SESSION, NOT CHAINED AHEAD OF docker login IN
# THE SAME ONE.
#
# The deploy user is added to the `docker` group here so that deploy.sh can
# talk to the daemon without sudo. Group membership is resolved at login, so a
# session that was already open when usermod ran does not have it -- chaining
# this into the same `ssh "bootstrap && docker login"` command would install
# Docker correctly and then fail on the very next line with a permission denied
# on the socket. The workflow therefore calls this as a separate step.
set -euo pipefail

DEPLOY_USER="${1:-$(id -un)}"

# --- 1. Docker Engine + compose plugin ------------------------------------
#
# From Docker's own apt repository rather than Ubuntu's docker.io package: the
# compose PLUGIN (`docker compose`, which is what docker-compose.prod.yml is
# driven with) ships only from here. Ubuntu's package would give a working
# daemon and no `docker compose` subcommand.
if ! command -v docker >/dev/null 2>&1; then
  echo "bootstrap: installing Docker Engine"

  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl

  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc

  # shellcheck disable=SC1091
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -y
  sudo apt-get install -y \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
else
  echo "bootstrap: docker already present ($(docker --version))"
fi

sudo systemctl enable --now docker

# --- 2. Let the deploy user reach the daemon ------------------------------
#
# Without this every docker command in the workflow needs sudo, including the
# `docker login` that stores the GHCR credential -- which would then land in
# root's config and not the deploy user's.
if ! id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
  echo "bootstrap: adding ${DEPLOY_USER} to the docker group"
  sudo usermod -aG docker "$DEPLOY_USER"
  echo "bootstrap: group takes effect on the NEXT login -- later steps get it"
fi

# --- 3. Log rotation ------------------------------------------------------
#
# These boxes have a ~7GB root disk. Docker's default json-file driver grows
# without limit, and an app that logs every request fills the disk in weeks --
# on a box whose nightly stop/start hides the symptom until Postgres cannot
# write. Capped here rather than per-service in the compose file so the CRM
# inherits it when it joins the stack.
if [ ! -f /etc/docker/daemon.json ]; then
  echo "bootstrap: capping container log size"
  sudo mkdir -p /etc/docker
  sudo tee /etc/docker/daemon.json > /dev/null <<'JSONEOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
JSONEOF
  sudo systemctl restart docker
fi

echo "bootstrap: ready -- $(docker --version), $(docker compose version)"
