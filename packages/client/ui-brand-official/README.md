---
description: "EQIDIS AI brand occupants for sidebar and conversation surfaces; for maintainers replacing company artwork."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

This EQIDIS AI fork registers the company’s existing coral/purple symbol and theme-colored vector wordmark in the sidebar and conversation hero for every build profile. Desktop application icons and browser favicons use the same symbol. The upstream package name remains unchanged for composition compatibility.

## Summary

This package renders the EQIDIS symbol and wordmark in the sidebar and the symbol in the conversation hero. It registers in every build profile, has no runtime state and does not affect model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the browser roster of the EQIDIS deployment.

### Choosing the profile

Brand registration is independent of `DSH_CLIENT_BUILD_PROFILE`; both local and official builds show EQIDIS artwork.

### Replacing the brand

Replacing the brand requires replacing the occupants of the sidebar and conversation hero slots. This package has no runtime brand configuration.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The three occupants register together after the sidebar and conversation hero slots are declared. Nested `ctx.slots.inject()` calls dispose the registrations when declarations disappear. The browser entry is [`src/client/index.ts`](src/client/index.ts); the Node entry is inert. Browser titles are selected by `DSH_CLIENT_TITLE` outside the slot system.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
