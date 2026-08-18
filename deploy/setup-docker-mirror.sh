#!/usr/bin/env bash
# Configure Docker Hub mirrors for mainland China ECS. Safe to re-run.
set -euo pipefail

sudo mkdir -p /etc/docker
if [[ -f /etc/docker/daemon.json ]]; then
  sudo cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
fi

sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run"
  ]
}
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker

echo "Registry mirrors:"
docker info 2>/dev/null | grep -A5 "Registry Mirrors" || true
echo "Test pull:"
docker pull docker.m.daocloud.io/library/hello-world:latest
docker rmi docker.m.daocloud.io/library/hello-world:latest >/dev/null 2>&1 || true
echo "OK — re-run ./up.sh core"
