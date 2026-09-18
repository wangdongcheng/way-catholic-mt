# MDTS - Malta Driving Test Simulator

![MDTS - Malta Driving Test Simulator](image.png)

MDTS is a Google Street View–based practice and driving-test simulator. Test routes contain ordered examiner commands, answers, checkpoints, and penalties. Practice messages are maintained separately and appear only in Practice mode.

## Getting Started

Install the dependencies:

```bash
npm install
```

Create `.env.local` in the project root:

```text
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Start the development server:

```bash
npm run dev
```

Build the production files:

```bash
npm run build
```

The production output is generated in `dist`.

The Cloudflare deployment commands keep preview and production data separate:

```bash
npm run deploy:preview
npm run deploy:production
```

Preview uses the `mdts-data-preview` R2 bucket, while production uses
`mdts-data-production`. Both deployments serve public JSON through `/data/*`;
only authenticated administrator requests may write supported documents
through `/api/admin/data/*`.

## Pages

### Driving page

```text
http://localhost:5173/
```

Example:

```text
http://localhost:5173/?mode=exam&route=route-001
```

The start screen offers two modes:

* **Practice** starts immediately without an examiner or route selection. Every enabled observation becomes an automatic teaching message, and critical violations show a red warning.
* **Test** asks for a route or Random, then displays the test notice. Observation buttons remain available while driving, and a critical violation ends the test.

### Route Editor

```text
http://localhost:5173/editor.html
```

Example:

```text
http://localhost:5173/editor.html?route=route-001
```

The Editor uses two data workflows:

* On `localhost`, use desktop Chrome or Edge and select the repository's
  `public/data` folder. The Editor scans the route and global JSON files and
  saves validated changes directly to that folder.
* On a deployed HTTPS host, the Editor loads data from R2 automatically.
  Saving requires Cloudflare Access administrator authentication and writes
  through the protected `/api/admin/data/*` endpoints.

Existing routes, Observation Checks, and Critical Violations are listed
dynamically. Creating or saving a route also updates `route-index.json`.

### Cached locations map

```text
http://localhost:5173/cached.html
```

This full-screen map loads every shard declared in
`public/data/geocoding-cache/index.json` and marks each valid cached
coordinate. It fits the map to all loaded points, displays the total cached
location count, and shows the location label and coordinates when a marker is
selected. The page requires the same `VITE_GOOGLE_MAPS_API_KEY` as the driving
page and Route Editor.

## URL Parameters

### `mode`

Selects the driving mode after the start screen:

```text
?mode=practice
?mode=exam&route=route-001
```

Without `mode`, the application displays the Practice/Test choice.

### `route`

Selects the route JSON file loaded by the driving page or Route Editor.

```text
?route=route-001
```

The value is mapped to:

```text
public/data/routes/route-001.json
```

Route IDs may contain letters, numbers, and hyphens.

If the parameter is omitted or contains unsupported characters, the application uses the default route configured in `src/config.js`:

```js
defaultRoute: "route-001"
```

A syntactically valid route ID whose JSON file does not exist will cause route loading to fail.

Examples:

```text
/?route=route-001
/?route=route-002
/editor.html?route=route-001
/editor.html?route=route-003
```

The driving page and Route Editor discover available routes from
`public/data/route-index.json`. During local development, `npm run dev` and
`npm run build` regenerate this index from the JSON files under
`public/data/routes`. The Editor also updates the index after saving a route.

### `lat` and `lng`

When both values are present and valid, they override the selected route's
initial Street View coordinates without changing the route data:

```text
/?route=route-001&lat=35.8880832&lng=14.5029997
```

Both parameters are required. Invalid or out-of-range coordinates are ignored.

### `currentinfo`

Displays the diagnostic Current Info panel on the driving page.

It is enabled only when the value is exactly `1`:

```text
?currentinfo=1
```

Example:

```text
/?route=route-001&currentinfo=1
```

The panel displays:

* Route name
* Current latitude and longitude
* Street View panorama ID
* Camera heading
* Reverse-geocoded location

The panel appears temporarily after Street View position, panorama, or heading changes and hides after approximately 10 seconds without another update.

If `currentinfo=1` is not present:

* The Current Info panel remains hidden.
* Reverse-geocoding requests for the panel are not scheduled.
* No new location labels are added to the browser geocoding cache through this feature.

These values do not enable the panel:

```text
?currentinfo
?currentinfo=true
?currentinfo=0
?CurrentInfo=1
```

### `exportcache`

Opens the geocoding-cache export dialog in the Route Editor.

It is enabled only when the value is exactly `1`:

```text
?exportcache=1
```

Recommended URL:

```text
/editor.html?route=route-001&exportcache=1
```

The parameter is handled by the Route Editor. It does not directly update repository files.

When enabled, the Editor:

1. Reads local entries from the browser key `way-location-cache-v1`.
2. Loads `public/data/geocoding-cache/index.json`.
3. Assigns local entries to cache shards according to their geographic bounds.
4. Loads each applicable shard.
5. Appends new entries to the existing entries.
6. Skips duplicate panorama IDs or coordinates.
7. Provides a merged JSON file for download.
8. Enables cache clearing only after every affected shard has been downloaded.

Coordinates are compared at five decimal places. An entry is considered a duplicate if either its panorama ID or rounded coordinate key already exists.

The export process downloads merged replacement files. It does not write directly to the local Git repository.

After downloading:

1. Replace the corresponding file under `public/data/geocoding-cache`.
2. Review the changes with Git.
3. Commit and push the files manually.
4. Clear the exported browser entries only after confirming that the downloads are safe.

Entries outside every configured shard are not exported and remain in local storage.

## Route Files

Route files are stored in:

```text
public/data/routes
```

The route ID and filename should match:

```text
Route ID: route-003
Filename: public/data/routes/route-003.json
URL: /?route=route-003
```

## Route JSON Structure

```json
{
  "id": "route-001",
  "name": "Example Route",
  "startState": {
    "lat": 35.8880832,
    "lng": 14.5029997,
    "heading": 24,
    "pitch": 0,
    "zoom": 1
  },
  "navigation": {
    "eventsAreCheckpoints": true,
    "defaultPenaltyOnMiss": 5
  },
  "events": []
}
```

### Route properties

| Property     |   Type | Description                                                        |
| ------------ | -----: | ------------------------------------------------------------------ |
| `id`         | string | Unique route ID. It should match the JSON filename.                |
| `name`       | string | Human-readable route name displayed by the application and Editor. |
| `startState` | object | Initial Street View position and camera state.                     |
| `navigation` | object | Route-level checkpoint and missed-event defaults.                  |
| `events`     |  array | Ordered route events ending with one `route-finish` event.          |

## Start State

```json
{
  "startState": {
    "lat": 35.8880832,
    "lng": 14.5029997,
    "heading": 24,
    "pitch": 0,
    "zoom": 1
  }
}
```

| Property  |   Type | Description                                                         |
| --------- | -----: | ------------------------------------------------------------------- |
| `lat`     | number | Initial latitude.                                                   |
| `lng`     | number | Initial longitude.                                                  |
| `heading` | number | Initial camera direction in degrees. `0` is north and `90` is east. |
| `pitch`   | number | Initial vertical camera angle. `0` is level.                        |
| `zoom`    | number | Initial Street View zoom level.                                     |

## Navigation Defaults

```json
{
  "navigation": {
    "eventsAreCheckpoints": true,
    "defaultPenaltyOnMiss": 5,
    "missedRouteMessage": {
      "message": "A required route point was missed.",
      "autoCloseMs": 0,
      "priority": "high"
    }
  }
}
```

| Property               |           Type | Description                                                              |
| ---------------------- | -------------: | ------------------------------------------------------------------------ |
| `eventsAreCheckpoints` |        boolean | Default value of `required` for events that do not define it explicitly. |
| `defaultPenaltyOnMiss` |         number | Default penalty when a required event is missed.                         |
| `missedRouteMessage`   | message object | Optional route-level message displayed when an event is missed.          |

The built-in defaults are:

```json
{
  "eventsAreCheckpoints": false,
  "defaultPenaltyOnMiss": 0
}
```

Route JSON is normalized after loading. Missing event-level values are resolved from these route-level defaults.

## Event Order and Route Progress

The position of an event in the `events` array defines its route order.

```text
events[0] → events[1] → events[2]
```

When the user reaches a later event:

* Earlier required events that were not reached become `missed`.
* Earlier optional events that were not reached become `skipped`.
* A missed event applies its missed-event penalty once.
* A skipped optional event does not apply a penalty.
* Suppressed earlier content will not appear later if the user returns to that location.

Checkpoint progress uses the event’s resolved position and trigger radius. Heading restrictions control whether the event content appears, but they do not determine whether the geographic checkpoint was reached.

The internal checkpoint states are:

```text
pending
reached
missed
skipped
```

The internal content states are:

```text
pending
triggered
suppressed
```

## Route Finish

Every route must contain exactly one `route-finish` event, and it must be the
last item in the ordered `events` array.

```json
{
  "id": "route-001-finish",
  "type": "route-finish",
  "lat": 35.8897667,
  "lng": 14.5038232,
  "radius": 20,
  "pano": null
}
```

Reaching this location settles earlier route checkpoints, outstanding examiner
commands, and active observation checks before producing the Test Result. A
route finish is always treated as a required checkpoint with no missed-event
penalty. Heading restrictions do not apply to it.

## Common Event Properties

Examiner commands and observation checks share these location properties:

```json
{
  "id": "event-001",
  "type": "examiner-command",
  "lat": 35.8889953,
  "lng": 14.5032702,
  "pano": null,
  "radius": 30,
  "headingMin": 340,
  "headingMax": 60,
  "required": true,
  "penaltyOnMiss": 5
}
```

| Property             |           Type | Description                                                          |
| -------------------- | -------------: | -------------------------------------------------------------------- |
| `id`                 |         string | Unique event ID within the route.                                    |
| `type`               |         string | `examiner-command` in route files or `observation-check` in the observation file. |
| `lat`                |         number | Trigger-center latitude.                                             |
| `lng`                |         number | Trigger-center longitude.                                            |
| `pano`               |         string | Optional Street View panorama ID.                                    |
| `radius`             |         number | Trigger and checkpoint radius in metres. Must be greater than zero.  |
| `headingMin`         |         number | Optional minimum camera heading.                                     |
| `headingMax`         |         number | Optional maximum camera heading.                                     |
| `required`           |        boolean | Whether missing the event should be recorded and penalized.          |
| `penaltyOnMiss`      |         number | Penalty applied when this required event is missed.                  |
| `missedRouteMessage` | message object | Optional event-specific message displayed when this event is missed. |

Examiner commands and observation checks also require a boolean
`grievousFault` value. When a grievous event fails, the final Test Result is
`Failed` regardless of the remaining score. It does not end the test early.

An event must provide either:

* Valid `lat` and `lng` coordinates; or
* A valid `pano` ID that can be resolved to coordinates.

When valid coordinates are present, they are used directly. `pano` remains optional.

Heading ranges may cross north. For example:

```json
{
  "headingMin": 340,
  "headingMax": 60
}
```

This accepts headings from 340° through 360° and from 0° through 60°.

If only one heading boundary is supplied, route validation fails.

The missed-event penalty is resolved in this order:

```text
event.penaltyOnMiss
→ route.navigation.defaultPenaltyOnMiss
→ 0
```

The missed-event message is resolved in this order:

```text
event.missedRouteMessage
→ route.navigation.missedRouteMessage
→ built-in message
```

## Observation Checks

Global observations are stored in `public/data/observation-checks.json`. They do not belong to a route. Practice mode displays every enabled observation as a teaching message. Test mode silently activates observations with `examEnabled` set to `true` and requires the matching toolbar button before the answer range is left.

```json
{
  "id": "observation-stop-line-001",
  "type": "observation-check",
  "enabled": true,
  "examEnabled": true,
  "observationType": "stop-line",
  "lat": 35.8889953,
  "lng": 14.5032702,
  "radius": 30,
  "answerRadius": 50,
  "headingMin": 340,
  "headingMax": 60,
  "penaltyOnMiss": 3,
  "penaltyOnIncorrect": 1,
  "practiceMessage": {
    "message": "Stop line ahead. Prepare to stop before the line.",
    "autoCloseMs": 8000,
    "priority": "normal"
  }
}
```

`headingMin` and `headingMax` are optional. When both are omitted, the
observation can trigger at any camera heading. When both are present, the
observation triggers only while the Street View camera heading is inside the
configured range. Both values must be provided together and must be between
`0` and `360`. A range such as `340` to `60` crosses north.

Set `examEnabled` to `false` for a teaching point that should appear in Practice but be ignored in Test. Observation button definitions are stored in `public/data/observation-types.json`.

## Critical Violations

Global critical violations are stored in `public/data/critical-violations.json`. A violation is armed when the driver reaches checkpoint A. Reaching forbidden destination B before `windowMs` expires triggers a red Practice warning or immediately fails a Test.

Every critical violation is inherently grievous, so critical-violation events
do not use a `grievousFault` field.

```json
{
  "id": "critical-wrong-way-001",
  "type": "critical-violation",
  "rule": "wrong-way-entry",
  "enabled": true,
  "oncePerSession": true,
  "triggerCheckpoint": {
    "location": { "lat": 35.892456, "lng": 14.501678 },
    "radius": 15,
    "pano": null
  },
  "forbiddenDestination": {
    "location": { "lat": 35.89221, "lng": 14.50165 },
    "radius": 15,
    "pano": null
  },
  "windowMs": 60000,
  "practiceWarning": {
    "title": "Serious driving error",
    "message": "You entered a one-way street in the prohibited direction.",
    "buttonLabel": "I understand",
    "autoCloseMs": 0
  },
  "examFailure": {
    "title": "Test failed",
    "message": "You entered a one-way street in the prohibited direction.",
    "reasonCode": "WRONG_WAY_ENTRY"
  }
}
```

## Test Result

Reaching `route-finish` ends a normal test and opens a result report. The score
starts at 100 and cannot fall below zero:

```text
score = max(0, 100 - totalPenalty)
```

The pass score is 75. The result is `Failed` when the score is below 75, a
grievous event failed, or a critical violation occurred. The report includes
the route, duration, total penalty, command and observation performance, missed
route points, critical violations, and an event map. The map shows the route
start, the finish after a normal completion, and every evaluated event. Correct
events use a green check, failed events use a red cross, and grievous failures
or critical violations use a red exclamation mark. Select a marker to view its
event details and cached or reverse-geocoded location. The finish marker is not
shown when a critical violation ends the test early.

## Examiner Command Events

Examiner commands appear as non-modal controls. Street View remains usable while the command is visible.

```json
{
  "id": "examiner-command-001",
  "type": "examiner-command",
  "lat": 35.8883578,
  "lng": 14.5031947,
  "radius": 20,
  "answerRadius": 50,
  "required": true,
  "penaltyOnMiss": 5,
  "command": "Turn right, please.",
  "answerMode": "single",
  "optionLayout": "single-column",
  "options": [],
  "penaltyOnOutOfRange": 1,
  "outOfRangeRouteMessage": {
    "message": "You left the answering area without answering.",
    "autoCloseMs": 0,
    "priority": "high"
  }
}
```

| Property                 |           Type | Description                                                                                                                                             |
| ------------------------ | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`                |         string | Examiner instruction displayed to the user.                                                                                                             |
| `answerRadius`           |         number | Maximum distance from the event centre within which an answer remains valid. It must be at least as large as `radius`.                                  |
| `answerMode`             |         string | `single`, `multiple`, or `sequence`.                                                                                                                    |
| `optionLayout`           |         string | Button layout. The default is `single-column`; `two-columns` is also supported.                                                                         |
| `options`                |          array | Available answer buttons.                                                                                                                               |
| `correctSequence`        |          array | Required option-ID order for sequence commands.                                                                                                         |
| `penalty`                |         number | General incorrect-answer penalty for multiple-choice and sequence commands. It is also the fallback for a single-choice option without its own penalty. |
| `penaltyOnOutOfRange`    |         number | Penalty applied when the user leaves the answering radius without submitting.                                                                           |
| `outOfRangeRouteMessage` | message object | Message displayed when the command expires outside its valid answering area.                                                                            |
| `correctRouteMessage`    | message object | Optional message displayed after a correct multiple-choice or sequence answer.                                                                          |
| `incorrectRouteMessage`  | message object | Optional message displayed after an incorrect multiple-choice or sequence answer.                                                                       |

### Single choice

Exactly one option must have:

```json
"correct": true
```

Selecting an option submits the answer immediately.

### Multiple choice

One or more options may be correct. The user selects the required options and presses Confirm.

The submitted selection must exactly match all options marked as correct.

### Sequence

The user must select every option in the order specified by `correctSequence`.

```json
{
  "answerMode": "sequence",
  "correctSequence": [
    "mirrors",
    "signal",
    "position",
    "speed",
    "look"
  ]
}
```

The sequence must contain every option ID exactly once.

## Examiner Options

```json
{
  "id": "option-1",
  "label": "Turn right",
  "correct": true,
  "penalty": 0,
  "routeMessage": {
    "message": "Correct. Continue to the right.",
    "autoCloseMs": 5000,
    "priority": "high"
  }
}
```

| Property       |           Type | Description                                                                                    |
| -------------- | -------------: | ---------------------------------------------------------------------------------------------- |
| `id`           |         string | Unique option ID within the command.                                                           |
| `label`        |         string | Button text displayed to the user.                                                             |
| `correct`      |        boolean | Whether the option is correct in single or multiple mode.                                      |
| `penalty`      |         number | Penalty for selecting this option in single-choice mode.                                       |
| `routeMessage` | message object | Optional important feedback displayed through the shared Route Message dialog after selection. |

For sequence commands, correctness is determined by `correctSequence`, so individual `correct` values are not required.

## Message Objects

Several properties use the same message-object structure:

```json
{
  "message": "Message text",
  "autoCloseMs": 5000,
  "priority": "high"
}
```

| Property      |   Type | Description                                                    |
| ------------- | -----: | -------------------------------------------------------------- |
| `message`     | string | Message text.                                                  |
| `autoCloseMs` | number | Close delay in milliseconds. `0` requires manual confirmation. |
| `priority`    | string | `normal` or `high`.                                            |

This format is used by:

* `missedRouteMessage`
* `outOfRangeRouteMessage`
* `correctRouteMessage`
* `incorrectRouteMessage`
* `option.routeMessage`

## Creating a Route

### Connect the data source

Open `/editor.html`. On `localhost`, choose **Connect data** and select the
repository's `public/data` folder in desktop Chrome or Edge. On a deployed
HTTPS host, the Editor connects to R2 and builds the data-set menu
automatically.

### Create the route

Select **New route**, enter a unique route ID and name, and create the draft.
Route IDs may contain only letters, numbers, and hyphens. Add and configure the
required events, including exactly one `route-finish` event as the last event,
then resolve all validation errors and select **Save**.

For local data, Save creates `public/data/routes/<route-id>.json` and rebuilds
`public/data/route-index.json`. For remote data, Save creates the R2 route with
overwrite protection and updates the remote route index. Keep the route ID,
filename, and URL parameter consistent.

### Edit the route

Open:

```text
/editor.html?route=route-003
```

In the Editor:

1. Change the route name if required.
2. Right-click the map or use **Add event**.
3. Select Single Choice, Multiple Choice, or Sequence.
4. Click the map to place the event.
5. Drag an existing marker to adjust its position.
6. Configure its radius and optional heading range.
7. Configure checkpoint requirements and missed-event penalties.
8. Configure examiner-command details.
9. Review Route Validation.
10. Save the data set.

To maintain roadside teaching and test observations, select **Observation
Checks**. Save writes `observation-checks.json` to the active data source.

To maintain two-point serious-error detection, select **Critical Violations**.
Place checkpoint A first and forbidden destination B second. Save writes
`critical-violations.json` to the active data source.

On local data, review the saved JSON and generated route index with Git before
committing them. On remote data, the Worker validates writes, uses ETags to
reject stale edits, and backs up replaced objects under the R2 `backups/`
prefix.

## Maintaining Event Order

The Route Editor keeps `route-finish` last. New examiner commands are inserted
immediately before it.

Because array order defines route progress, inspect the saved JSON and ensure
events appear in the actual driving order.

Each route must contain exactly one `route-finish` event as its final item.

The current Editor does not provide drag-and-drop event reordering. If necessary, reorder the event objects manually in the JSON file before committing it.

Changing the order may change which events are marked as missed when a later checkpoint is reached.

## Route Validation

The Editor checks:

* Route ID and name
* Start coordinates
* Presence of the events array
* Unique event IDs
* Exactly one final `route-finish` event
* Coordinates or Pano ID
* Positive trigger radius
* Complete Heading ranges
* Boolean `required` values
* Boolean `grievousFault` values for examiner commands and observations
* Non-negative missed-event penalties
* Supported event types
* Examiner command text
* Answer radius
* Option count, IDs, and labels
* Correct-answer rules
* Correct sequence contents
* Non-negative penalties

Observation Checks and Critical Violations have corresponding document- and
event-specific validation. Resolve validation errors before saving any data
set.

## Geocoding Cache Files

The cache manifest is:

```text
public/data/geocoding-cache/index.json
```

A shard entry defines its filename and geographic bounds:

```json
{
  "file": "malta-001.json",
  "bounds": {
    "south": 35.75,
    "west": 14.1,
    "north": 36.1,
    "east": 14.7
  }
}
```

If the cache becomes too large, create another JSON shard and add it to the manifest with non-overlapping geographic bounds. Entries exported from the browser are assigned to the first matching shard.

Open `/cached.html` to verify the coordinates currently present in all shards.
The page is read-only; it does not display unexported entries from browser
local storage and does not modify cache files.

## Current Demo Routes

```text
/?route=route-001
/?route=route-002
/?route=route-003
```

Editor URLs:

```text
/editor.html?route=route-001
/editor.html?route=route-002
/editor.html?route=route-003
```

Diagnostic URLs:

```text
/?route=route-001&currentinfo=1
/editor.html?route=route-001&exportcache=1
```

Cache map URL:

```text
/cached.html
```
