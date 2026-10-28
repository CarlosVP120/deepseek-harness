---
description: "EQIDIS AI accounts for a Web Host shared by several people: password sign-in, one folder per person, and per-person visibility of projects and conversations."
kind: "package-reference"
---

# @deepseek-ai/dsh-eqidis-accounts

## Summary

Turns one EQIDIS AI Web Host into a shared service. Each person signs in with a username and password, works in their own folder under `homesRoot`, and sees only the projects and conversations inside it. Administrators see everything, manage accounts, and keep Host-wide administration (settings changes, credentials, plugins, terminals). Without this plugin the Web Host keeps its launch-token sign-in for a single operator.

## Use this package

The Web bundle mounts the row only when `EQIDIS_CUENTAS=1`; [deploy/eqidis-vps](../../../deploy/eqidis-vps/README.md) is the server guide.

| Field | Default | Meaning |
|---|---|---|
| `accountsFile` | required | Accounts JSON (`0600`); the cookie signing key `sign-in.key` lives beside it |
| `homesRoot` | required | Parent of one folder per person, named by username |
| `signInDays` | `7` | Days a sign-in lasts |
| `secureCookies` | `false` | Send the sign-in cookie only over HTTPS |

The plugin contributes:

- **Sign-in.** A `ConnectionAuthenticator` replaces Connection's launch-token cookie: an unauthenticated index request redirects to `login`, `/api` requests and WebSocket upgrades without a valid sign-in get 401, and each signed-in account speaks for its own `AccountPeer`. A password change or disabling bumps the account's session version and disposes its Peer, closing its open streams. While no account exists, the printed launch URL is a one-time `login?setup=` link that creates the first administrator.
- **Pages.** `/login`, `/logout`, `/cuentas` (administrators), and `/cuenta` are server-rendered forms. Posts must be same-origin; five failed sign-ins for a username and address lock it for five minutes.
- **Access policy.** The `peerAccess` service decides, per Peer, which Remote calls and Fetch routes proceed and which Sessions and Workspaces lists, streams, and forwarded events show. A Session's folder is its `cwd`, a child Session's folder its parent's.
- **Who-am-I.** `GET /api/accounts/me` answers the signed-in account and folder; the Web client's account menu reads it.

## Model Experience

This package adds nothing to model requests. The agent of a signed-in person runs in that person's project folder, as it does on a single-operator Host.

## Known Limitations and Deferred Work

- Agent tools still run as the Host's operating-system user. Writes stay in the project under the `proyecto` permission preset, but reading another person's folder through a shell command depends on operating-system permissions; full isolation needs one Host or container per person.
- Model settings and API keys are Host-wide and administrator-owned.
- Sessions created before accounts were enabled, outside every person's folder, are visible only to administrators.
