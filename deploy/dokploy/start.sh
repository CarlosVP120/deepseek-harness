#!/bin/sh
# Start EQIDIS AI web inside the container. EQIDIS_DOMINIO is the public host name
# people open (for example eqidis.tuempresa.com); the sign-in fence admits only it.
set -eu
if [ -z "${EQIDIS_DOMINIO:-}" ]; then
  echo "EQIDIS_DOMINIO no está definido: indica el dominio público, por ejemplo eqidis.tuempresa.com" >&2
  exit 1
fi
scheme="${EQIDIS_ESQUEMA:-https}"
exec node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 3080 \
  --public-url "${scheme}://${EQIDIS_DOMINIO}/" --trusted-host "${EQIDIS_DOMINIO}"
