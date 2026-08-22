# shellcheck shell=bash
# Shared helpers for .p12 password handling (source from signing scripts).

# Remove accidental CR/LF from multiline `export VAR='...'` copy-paste.
p12_sanitize_password() {
  printf '%s' "${1:-}" | tr -d '\r\n'
}

p12_write_pass_files() {
  local pass="$1"
  local passin="$2"
  local passout="$3"
  printf '%s' "$pass" >"$passin"
  printf '%s' "$pass" >"$passout"
  chmod 600 "$passin" "$passout"
}

p12_verify_password() {
  local p12="$1"
  local passin="$2"
  if openssl pkcs12 -in "$p12" -passin "file:$passin" -noout 2>/dev/null; then
    return 0
  fi
  openssl pkcs12 -in "$p12" -passin "file:$passin" -legacy -noout 2>/dev/null
}

p12_has_private_key() {
  local p12="$1"
  local passin="$2"
  local key_pem
  key_pem="$(mktemp)"
  if openssl pkcs12 -in "$p12" -passin "file:$passin" -legacy -nocerts -nodes -out "$key_pem" 2>/dev/null \
    && grep -q "PRIVATE KEY" "$key_pem"; then
    rm -f "$key_pem"
    return 0
  fi
  if openssl pkcs12 -in "$p12" -passin "file:$passin" -nocerts -nodes -out "$key_pem" 2>/dev/null \
    && grep -q "PRIVATE KEY" "$key_pem"; then
    rm -f "$key_pem"
    return 0
  fi
  rm -f "$key_pem"
  return 1
}

p12_extract_key_pem() {
  local src="$1"
  local passin="$2"
  local key_pem="$3"
  local err="$4"
  if openssl pkcs12 -in "$src" -passin "file:$passin" -legacy -nocerts -nodes -out "$key_pem" 2>"$err"; then
    return 0
  fi
  openssl pkcs12 -in "$src" -passin "file:$passin" -nocerts -nodes -out "$key_pem" 2>"$err"
}

p12_extract_cert_pem() {
  local src="$1"
  local passin="$2"
  local cert_pem="$3"
  local err="$4"
  if openssl pkcs12 -in "$src" -passin "file:$passin" -legacy -clcerts -nokeys -out "$cert_pem" 2>"$err"; then
    return 0
  fi
  openssl pkcs12 -in "$src" -passin "file:$passin" -clcerts -nokeys -out "$cert_pem" 2>"$err"
}

# Re-encrypt legacy Keychain PKCS#12 as AES-256 for `security import`.
normalize_p12_for_security_import() {
  local src="$1"
  local dst="$2"
  local passin="$3"
  local passout="$4"
  local err key_pem cert_pem

  err="$(mktemp)"
  key_pem="$(mktemp)"
  cert_pem="$(mktemp)"

  # Fast path: modern PKCS#12 can be re-exported in one step.
  if openssl pkcs12 -in "$src" -passin "file:$passin" \
    -export -out "$dst" -passout "file:$passout" \
    -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$err"; then
    rm -f "$err" "$key_pem" "$cert_pem"
    return 0
  fi
  if openssl pkcs12 -in "$src" -passin "file:$passin" -legacy \
    -export -out "$dst" -passout "file:$passout" \
    -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$err"; then
    rm -f "$err" "$key_pem" "$cert_pem"
    return 0
  fi

  # OpenSSL 3 often cannot re-export legacy Keychain PKCS#12 directly.
  if ! p12_extract_key_pem "$src" "$passin" "$key_pem" "$err"; then
    sed 's/^/  openssl: /' "$err" >&2
    rm -f "$err" "$key_pem" "$cert_pem"
    return 1
  fi
  if ! p12_extract_cert_pem "$src" "$passin" "$cert_pem" "$err"; then
    sed 's/^/  openssl: /' "$err" >&2
    rm -f "$err" "$key_pem" "$cert_pem"
    return 1
  fi
  if ! openssl pkcs12 -export -inkey "$key_pem" -in "$cert_pem" -passout "file:$passout" -out "$dst" \
    -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$err"; then
    sed 's/^/  openssl: /' "$err" >&2
    return 1
  fi

  rm -f "$err" "$key_pem" "$cert_pem"
  return 0
}
