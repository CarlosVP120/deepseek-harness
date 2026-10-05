---
kind: upgrade-guide
description: "Installed EQIDIS Desktop uses an independent data directory and no longer imports DeepSeek Harness accounts, settings, or sessions."
---
# Independent EQIDIS Desktop data

English | [中文](guide.zh.md)

## Change

Installed EQIDIS Desktop uses `~/.eqidis-ai` instead of the shared Harness home. An inherited `DSH_HOME` no longer selects packaged application data; `EQIDIS_AI_HOME` is the explicit override. Development keeps its disposable `DSH_HOME`. Previous accounts, model catalogs, and sessions are not imported, and the EQIDIS bundle disables DeepSeek account UI.

## Migration

1. Install the updated EQIDIS package. Existing DeepSeek Harness data stays unchanged.
2. Enter each team's OpenRouter key in Settings → Models. Keys are not included in the installer.
3. Confirm that a new session displays Flash, offers Flash and Pro, and shows no reasoning-effort selector or DeepSeek account menu. Reasoning remains fixed at high and the preset remains standard.
4. To relocate packaged EQIDIS data, set `EQIDIS_AI_HOME` to a dedicated directory before launching the application. Do not select another product's home.
