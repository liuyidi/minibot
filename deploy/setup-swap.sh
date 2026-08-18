#!/usr/bin/env bash
# Add 2G swap on small ECS (safe to re-run). Requires root.
set -euo pipefail

SWAPFILE="${SWAPFILE:-/swapfile}"
SIZE="${SWAP_SIZE:-2G}"

if swapon --show | grep -q "$SWAPFILE"; then
  echo "swap already on: $SWAPFILE"
  free -h
  exit 0
fi

if [[ ! -f "$SWAPFILE" ]]; then
  sudo fallocate -l "$SIZE" "$SWAPFILE" || sudo dd if=/dev/zero of="$SWAPFILE" bs=1M count=2048
  sudo chmod 600 "$SWAPFILE"
  sudo mkswap "$SWAPFILE"
fi

sudo swapon "$SWAPFILE"
grep -q "$SWAPFILE" /etc/fstab || echo "$SWAPFILE none swap sw 0 0" | sudo tee -a /etc/fstab

echo "swap enabled ($SIZE)"
free -h
