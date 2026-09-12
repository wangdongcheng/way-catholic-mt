# AGENTS.md

This file defines the working rules for AI coding agents in the entire repository.

## Project

- Product name: **MDTS - Malta Driving Test Simulator**.
- Repository name: `way-catholic-mt`.
- Stack: Vite, JavaScript, HTML, CSS, Google Maps JavaScript API, and Google Street View.
- Keep changes small, reversible, and consistent with the existing architecture.

## Authorization Gate

- Analysis, explanation, design, review, and read-only inspection do not authorize code changes.
- Modify repository files only when the user's current request contains either `push to preview` or `commit to preview` as an operative instruction.
- `push to preview` authorizes the requested changes, a local commit on `preview`, and a push to the remote `preview` branch.
- `commit to preview` authorizes the requested changes and a local commit on `preview`, but it does not authorize a push.
- Both phrases are case-sensitive and must be spelled exactly. Similar wording, translations, partial phrases, or quoted examples do not grant authorization.
- Do not reuse authorization from an earlier request for a later task.
- When authorization is absent, provide a design or diagnosis without changing repository files.

## Git and Push Rules

- Never push directly to `main`.
- The only branch an agent may push to is `preview`.
- Push only when the current user request contains the exact operative phrase `push to preview`.
- When the current request contains the exact operative phrase `commit to preview`, commit the requested changes locally on `preview` and do not push them.
- Do not create or push another branch unless the user explicitly changes these rules.
- Never force-push.
- Before writing to `preview`, fetch or verify its current remote head and preserve all newer remote changes.
- If `preview` moves during the task, inspect the new commits and safely rebase or rebuild the change on the latest head. Do not overwrite concurrent work.
- Preserve unrelated user changes in a dirty worktree. Never reset, discard, or rewrite them.
- Keep each commit focused on the requested task.
- Commit messages must be entirely in English, including the subject and body.
- Prefix AI-authored commit subjects with `ChatGPT: `.
- Example: `ChatGPT: Add observation checkpoint feedback`.
- Commit only when the current request contains one of the two authorized phrases. Push only when it contains `push to preview`.

## Scope Discipline

- Change only the files required for the requested behavior.
- Do not rename the repository, Cloudflare Worker, package, URLs, storage keys, or data IDs as a side effect of a branding or UI change.
- Do not make unrelated cleanup, formatting, dependency, or architecture changes.
- Do not delete files or data unless deletion is explicitly required.
- Use `apply_patch` for manual file edits.
- Use `rg` or `rg --files` for repository searches.

## Language and Style

- Write all commit messages in English.
- Write all comments in source code and code snippets in English.
- Keep identifiers, validation messages, UI strings, and documentation consistent with the existing language of the surrounding file.
- Prefer readable modules with explicit state and centralized defaults over duplicated inline logic.
- Avoid adding a dependency when the existing platform APIs and project utilities are sufficient.

## Architecture Boundaries

- Keep the Route Editor isolated in `editor.html` and `src/editor/` so it can be changed or rolled back independently from the driving runtime.
- Keep runtime orchestration in `src/main.js`; put reusable state and detection logic in dedicated modules.
- Continue using `src/spatial-index.js` for proximity candidate lookup. Do not replace it with full scans without a measured reason.
- Treat Street View `pano` values as optional unless a feature specifically requires an exact panorama match.
- Preserve the existing Practice/Exam separation and restart-to-mode-selection behavior.

## Data Model Conventions

- Route files live in `public/data/routes/`.
- Route events are ordered. Existing route events may act as checkpoints through `required`, `penaltyOnMiss`, and route-level navigation defaults.
- Examiner commands belong in route JSON files.
- Global observation checks belong in `public/data/observation-checks.json`, not in route JSON files.
- `public/data/route-messages.json` is obsolete. Do not recreate it.
- In Practice mode, enabled observation checks display their `practiceMessage` automatically.
- In Exam mode, only observations with `examEnabled !== false` require the matching observation button before the user leaves `answerRadius`.
- When any observation is awaiting confirmation, all observation buttons may be highlighted equally; never reveal the correct button.
- Global critical violations belong in `public/data/critical-violations.json`.
- A critical violation is armed at checkpoint A and triggered when forbidden destination B is reached within `windowMs`.
- In Practice mode, a critical violation displays a red warning. In Exam mode, it ends the exam immediately.
- Preserve stable IDs once data is in use unless an explicit migration is part of the task.

## URL Parameter Conventions

- `route` selects a route.
- `mode` selects Practice or Exam when valid.
- `currentinfo` is enabled only by the exact value `?currentinfo=1`.
- `exportcache` is enabled only by the exact value `?exportcache=1`.
- Do not broaden boolean URL parsing to accept values such as `true`, an empty value, or different capitalization unless explicitly requested.

## Cache and Secrets

- Keep `.env.local` out of Git.
- Never print, commit, or expose secret values.
- Do not rename the `way-location-cache-v1` local-storage key without an explicit backward-compatible migration.
- Geocoding cache exports must append and deduplicate data rather than silently overwrite existing cache entries.
- Do not change Cloudflare deployment settings, Worker names, project names, or custom-domain configuration unless explicitly requested.

## Verification

Run the checks relevant to the changed files before any authorized commit or push:

1. Run `git diff --check`.
2. Run `node --check` for changed JavaScript files.
3. Parse every changed JSON file and run the applicable route/editor validation.
4. Run `npm run build`; use the offline form when the environment attempts an unnecessary network request.
5. Run targeted behavior tests for changed state machines or event logic.
6. Review the final file list and confirm that only requested files are included in the commit.
7. Verify the remote `preview` SHA and commit title after pushing.

If a relevant check cannot run, report that clearly instead of claiming full verification.

## Completion Report

- State what changed and which files were affected.
- State which verification commands passed or could not run.
- If a push was authorized, confirm that only `preview` changed and provide the commit link.
- If `commit to preview` was authorized, provide the local commit SHA and title and explicitly state that it was not pushed.
- If neither phrase was authorized, explicitly state that no repository files were changed.
