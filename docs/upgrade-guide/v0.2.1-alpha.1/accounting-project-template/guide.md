---
kind: upgrade-guide
description: "New project adoption creates editable accounting instructions when the project has no AGENTS.md."
---
# New projects start with accounting instructions

English | [中文](guide.zh.md)

## Change

Creating a new project registration through the workspace controller writes a generic Spanish accounting template to the selected folder's `AGENTS.md` before registering it, when that file is absent. Native agent execution continues to load this file as project instructions. Existing instruction files, including empty files, remain untouched. Existing registrations and first-use default-workspace initialization remain unchanged.

## Migration

1. Create or associate a new project folder and open its project settings to review the initial instructions.
2. Edit or clear the instructions in project settings when the template does not match the project. Saving persists the complete replacement.
3. To retain instructions when adopting a folder, keep its existing `AGENTS.md`. Re-adopting an already registered project does not reset its instructions.
