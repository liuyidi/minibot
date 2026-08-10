#!/usr/bin/env bash
# Prefer Cargo / Homebrew binaries when present (local macOS convenience).
export PATH="${HOME}/.cargo/bin:/opt/homebrew/bin:${PATH}"
exec tauri "$@"
