# AGENTS.md

This file defines the working rules for AI coding agents in the entire repository.

## Project

- Product name: **MDTS - Malta Driving Test Simulator**.
- Repository name: `way-catholic-mt`.
- Stack: Vite, JavaScript, HTML, CSS, Google Maps JavaScript API, and Google Street View.
- Keep changes small, reversible, and consistent with the existing architecture.

## Authorization Gate

- Analysis, explanation, design, review, and read-only inspection do not authorize code changes.
- An explicit request to implement, update, fix, add, or remove repository content authorizes scoped file edits.
- Do not commit unless the current request contains `commit to preview` or `push to preview` as an operative instruction.
- Do not push unless the current request contains `push to preview` as an operative instruction.
- Commit and push phrases are case-sensitive and must be spelled exactly. Similar wording, translations, partial phrases, or quoted examples do not grant that action.
- Commit and push authorization applies only to the current request.
- When the user does not clearly request a repository change, keep the task read-only.

## Git and Push Rules

- Never push directly to `main`.
- The only branch an agent may push to is `preview`.
- Do not create or push another branch unless the user explicitly changes these rules.
- Never force-push.
- Before a local commit, confirm that the current branch is `preview`. A network fetch is not required unless remote synchronization is needed.
- Before pushing, fetch `origin/preview` and preserve all newer remote changes.
- If `origin/preview` moves during a push workflow, inspect the new commits and safely rebase or rebuild the change on the latest head. Do not overwrite concurrent work.
- Preserve unrelated user changes in a dirty worktree. Never reset, discard, or rewrite them.
- Keep each commit focused on the requested task.
- Commit messages must be entirely in English, including the subject and body.
- Prefix AI-authored commit subjects with `ChatGPT: `.
- Example: `ChatGPT: Add observation checkpoint feedback`.

## Scope Discipline

- Change only the files required for the requested behavior.
- Do not rename the repository, Cloudflare Worker, package, URLs, storage keys, or data IDs as a side effect of a branding or UI change.
- Do not make unrelated cleanup, formatting, dependency, or architecture changes.
- Do not delete files or data unless deletion is explicitly required.
- Use `apply_patch` for manual file edits.
- Use `rg` or `rg --files` for repository searches.

## Language and Style

- Write all comments in source code and code snippets in English.
- Keep identifiers, validation messages, UI strings, and documentation consistent with the existing language of the surrounding file.
- Prefer readable modules with explicit state and centralized defaults over duplicated inline logic.
- Avoid adding a dependency when the existing platform APIs and project utilities are sufficient.

## Architecture Boundaries

- Keep Route Editor UI and editor-specific logic in `editor.html` and `src/editor/`. Shared data contracts, indexes, and build tooling may live in shared modules, `public/data/`, or `scripts/` when both the editor and driving runtime use them.
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

Before a commit or push, run only the checks relevant to the changed files:

- Always run `git diff --check` and review the final file list.
- Run `node --check` for changed JavaScript files.
- Parse changed JSON files and run the applicable route/editor validation.
- Run `npm run build` when JavaScript, HTML, CSS, dependencies, or build/deployment configuration changed. Skip it for documentation-only and data-only changes unless they affect generated or bundled output.
- Run targeted behavior tests when state-machine or event logic changed.
- After pushing, verify the remote `preview` SHA and commit title.

If a relevant check cannot run, report that clearly instead of claiming full verification.

## Completion Report

- For implementation tasks, state what changed, which files were affected, and which relevant checks passed or could not run.
- If a push was authorized, confirm that only `preview` changed and provide the commit link.
- If `commit to preview` was authorized, provide the local commit SHA and title and explicitly state that it was not pushed.
- If the user requested an implementation but it was not performed, state that no repository files were changed and explain why. Ordinary read-only answers do not need this boilerplate.
