#!/usr/bin/env bash
# EQIDIS AI internal release without paying for the Mac builds on GitHub Actions.
#
# The Mac (Apple Silicon) installers are built on this Mac; Windows (and, if wanted,
# Intel Mac) is the only part built by the "Instaladores internos" workflow, one job
# each. The release is then published by uploading the files to a GitHub Release of
# the public installers repository: uploading costs nothing, and the apps keep
# updating themselves from it (nightly channel).
#
# Steps, in order (each one only does what it says):
#   scripts/eqidis-release.sh check     <version>            # read-only preflight
#   scripts/eqidis-release.sh mac       <version>            # build Apple Silicon here
#   scripts/eqidis-release.sh windows   <version> [--intel]  # push commit to the fork, 1 job per target, download
#   scripts/eqidis-release.sh stage     <version>            # gather files, merge update metadata, checksums
#   scripts/eqidis-release.sh publish   <version> "<title>" [notes-file]   # create the GitHub Release
#
# <version> is the full build version, e.g. 0.2.1-alpha.1.20261022.1 (product version
# + .YYYYMMDD.N). It must be newer than the latest published one, or the apps will not
# offer it (and an older build installed locally would be replaced by the newer one).
set -euo pipefail

INSTALLERS_REPO=CarlosVP120/eqidis-ai-releases
SOURCE_REPO=CarlosVP120/deepseek-harness
WORKFLOW=build.yml
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
STAGE_ROOT="$DESKTOP/.desktop-build/eqidis-release"

die() { echo "eqidis-release: $*" >&2; exit 1; }

version_ok() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]+\.[0-9]{8}\.[0-9]+$ ]] || die "versión inválida «$1»; usa por ejemplo 0.2.1-alpha.1.20261022.1"
  local product
  product="$(node -p "require('$DESKTOP/package.json').version")"
  [[ "$1" == "$product".* ]] || die "la versión debe empezar con la del producto ($product)"
}

latest_published() {
  gh release view -R "$INSTALLERS_REPO" --json tagName -q .tagName 2>/dev/null | sed 's/^v//'
}

newer_than_published() {
  local latest
  latest="$(latest_published)"
  [ -z "$latest" ] && return 0
  node -e "
    const [a, b] = process.argv.slice(1).map(v => v.split(/[.-]/).map(p => isNaN(p) ? p : Number(p)))
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === b[i]) continue
      process.exit((a[i] ?? -1) > (b[i] ?? -1) ? 0 : 1)
    }
    process.exit(1)" "$1" "$latest" || die "la versión $1 no es mayor que la publicada ($latest)"
}

stage_dir() { echo "$STAGE_ROOT/$1"; }

cmd_check() {
  local version="$1"
  version_ok "$version"
  command -v gh >/dev/null || die "falta gh"
  gh auth status >/dev/null 2>&1 || die "gh no tiene sesión; corre: gh auth login"
  newer_than_published "$version"
  [ "$(git -C "$ROOT" branch --show-current)" = eqidis ] || die "no estás en la rama eqidis (nunca publiques EQIDIS desde master)"
  [ -z "$(git -C "$ROOT" status --porcelain)" ] || die "hay cambios sin commit"
  grep -q '^DSH_DESKTOP_INTERNAL_UPDATE_REPOSITORY=CarlosVP120/eqidis-ai-releases' "$DESKTOP/.env.macos" \
    || die ".env.macos no apunta al repositorio de instaladores; los Mac no se actualizarían"
  local keychain
  keychain="$(sed -n 's/^DSH_DESKTOP_MACOS_LOCAL_SIGNING_KEYCHAIN=//p' "$DESKTOP/.env.macos")"
  [ -f "$DESKTOP/$keychain" ] || die "no existe el llavero de firma $keychain"
  echo "OK: versión $version, publicada actual $(latest_published), commit $(git -C "$ROOT" rev-parse --short HEAD)"
}

cmd_mac() {
  local version="$1"
  cmd_check "$version"
  (cd "$DESKTOP" && pnpm run package:mac:arm64:unsigned -- --build-version "$version")
  local artifacts="$DESKTOP/.desktop-build/targets/mac-arm64/unsigned-artifacts"
  grep -q "^version: $version$" "$artifacts/nightly-mac.yml" || die "nightly-mac.yml no es de la versión $version"
  local dir; dir="$(stage_dir "$version")/mac-arm64"
  mkdir -p "$dir"
  cp "$artifacts/eqidis-ai-$version-mac-arm64-unsigned".{dmg,zip,zip.blockmap} "$artifacts/nightly-mac.yml" "$dir/"
  codesign --verify --deep "$artifacts/mac-arm64/EQIDIS AI.app"
  echo "Mac Apple Silicon listo en $dir"
}

run_workflow() {
  local version="$1" target="$2" commit="$3"
  local before
  before="$(gh run list -R "$INSTALLERS_REPO" -w "$WORKFLOW" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
  gh workflow run "$WORKFLOW" -R "$INSTALLERS_REPO" -f source_ref="$commit" -f target="$target" -f build_version="$version" -f enable_updates=true
  local run=""
  for _ in $(seq 1 30); do
    sleep 4
    run="$(gh run list -R "$INSTALLERS_REPO" -w "$WORKFLOW" -L 1 --json databaseId -q '.[0].databaseId')"
    [ -n "$run" ] && [ "$run" != "$before" ] && break
  done
  [ -n "$run" ] && [ "$run" != "$before" ] || die "no apareció la ejecución de $target"
  echo "Ejecución $target: https://github.com/$INSTALLERS_REPO/actions/runs/$run"
  gh run watch "$run" -R "$INSTALLERS_REPO" --exit-status --interval 60
  local dir; dir="$(stage_dir "$version")/$target"
  mkdir -p "$dir"
  local artifact
  artifact="$(gh api "repos/$INSTALLERS_REPO/actions/runs/$run/artifacts" -q '.artifacts[] | select(.name | startswith("eqidis-ai-'"$target"'")) | .name')"
  [ -n "$artifact" ] || die "la ejecución de $target no dejó instaladores"
  gh run download "$run" -R "$INSTALLERS_REPO" -n "$artifact" -D "$dir"
  echo "$target listo en $dir"
}

cmd_windows() {
  local version="$1"; shift
  local intel=false
  [ "${1:-}" = --intel ] && intel=true
  cmd_check "$version"
  local commit; commit="$(git -C "$ROOT" rev-parse HEAD)"
  # The workflow builds from the fork, so this exact commit has to be on GitHub.
  if ! git -C "$ROOT" ls-remote origin | grep -q "^$commit"; then
    echo "El commit $commit no está en $SOURCE_REPO; se sube la rama eqidis (git push origin eqidis)."
    read -r -p "¿Subir la rama eqidis al fork? [s/N] " answer
    [ "$answer" = s ] || [ "$answer" = S ] || die "cancelado: sin el commit en el fork no se puede compilar Windows"
    git -C "$ROOT" push origin eqidis
  fi
  run_workflow "$version" win-x64 "$commit"
  [ "$intel" = true ] && run_workflow "$version" mac-x64 "$commit"
  return 0
}

cmd_stage() {
  local version="$1"
  version_ok "$version"
  local dir; dir="$(stage_dir "$version")"
  local out="$dir/release"
  rm -rf "$out"; mkdir -p "$out"
  [ -f "$dir/mac-arm64/eqidis-ai-$version-mac-arm64-unsigned.zip" ] || die "falta Mac Apple Silicon; corre el paso mac"
  [ -f "$dir/win-x64/eqidis-ai-$version-win-x64-unsigned.exe" ] || die "falta Windows; corre el paso windows"
  cp "$dir"/mac-arm64/*.{dmg,zip,blockmap} "$out/"
  cp "$dir"/win-x64/*.exe "$dir"/win-x64/*.blockmap "$dir/win-x64/nightly.yml" "$out/"
  local intel=false
  if [ -d "$dir/mac-x64" ]; then cp "$dir"/mac-x64/*.{dmg,zip,blockmap} "$out/"; intel=true; fi
  grep -q "^version: $version$" "$out/nightly.yml" || die "nightly.yml no es de la versión $version"
  # One update file for both Macs: Apple Silicon first, the app picks its own architecture.
  python3 - "$version" "$out" "$intel" <<'PY'
import base64, hashlib, os, sys, datetime
version, out, intel = sys.argv[1], sys.argv[2], sys.argv[3] == 'true'
def entry(arch):
    name = f'eqidis-ai-{version}-mac-{arch}-unsigned.zip'
    data = open(os.path.join(out, name), 'rb').read()
    return name, base64.b64encode(hashlib.sha512(data).digest()).decode(), len(data)
files = [entry('arm64')] + ([entry('x64')] if intel else [])
lines = [f'version: {version}', 'files:']
for name, sha, size in files:
    lines += [f'  - url: {name}', '    sha512: >-', f'      {sha}', f'    size: {size}']
lines += [f'path: {files[0][0]}', 'sha512: >-', f'  {files[0][1]}',
          "releaseDate: '" + datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z') + "'"]
open(os.path.join(out, 'nightly-mac.yml'), 'w').write('\n'.join(lines) + '\n')
PY
  (cd "$out" && shasum -a 256 *.dmg *.zip *.blockmap *.exe nightly-mac.yml nightly.yml > SHA256SUMS.txt)
  echo "Archivos listos para publicar en $out:"; ls -la "$out"
}

cmd_publish() {
  local version="$1" title="${2:-}" notes="${3:-}"
  [ -n "$title" ] || die "falta el título del Release"
  cmd_check "$version"
  local out; out="$(stage_dir "$version")/release"
  [ -f "$out/SHA256SUMS.txt" ] || die "corre primero el paso stage"
  (cd "$out" && shasum -a 256 -c SHA256SUMS.txt >/dev/null) || die "los archivos cambiaron desde stage"
  local args=(release create "v$version" -R "$INSTALLERS_REPO" --title "$title" --latest)
  if [ -n "$notes" ]; then args+=(--notes-file "$notes"); else args+=(--notes ""); fi
  gh "${args[@]}" "$out"/*
  echo "Publicado: https://github.com/$INSTALLERS_REPO/releases/tag/v$version"
}

step="${1:-}"; shift || true
[ -n "${1:-}" ] || die "uso: $0 {check|mac|windows|stage|publish} <versión> …"
case "$step" in
  check) cmd_check "$@" ;;
  mac) cmd_mac "$@" ;;
  windows) cmd_windows "$@" ;;
  stage) cmd_stage "$@" ;;
  publish) cmd_publish "$@" ;;
  *) die "paso desconocido «$step»" ;;
esac
