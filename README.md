# The Way

![The Way route simulator](image.png)

The Way is a Google Street View–based practice and driving-test simulator. Exam routes contain ordered examiner commands, answers, checkpoints, and penalties. Practice messages are maintained separately and appear only in Practice mode.

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

* **Practice** starts immediately without an examiner or route selection and loads `public/data/route-messages.json`.
* **Exam** asks for a route or Random, then displays the existing test notice before starting.

### Route Editor

```text
http://localhost:5173/editor.html
```

Example:

```text
http://localhost:5173/editor.html?route=route-001
```

## URL Parameters

### `mode`

Selects the driving mode after the start screen:

```text
?mode=practice
?mode=exam&route=route-001
```

Without `mode`, the application displays the Practice/Exam choice.

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
```

The Route Editor currently allows only `route-001` and `route-002` during its initial URL selection. When adding another route to the Editor dropdown, update both:

```text
editor.html
src/editor/editor-main.js
```

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
| `events`     |  array | Ordered list of examiner commands used in Exam mode.                |

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

## Common Event Properties

Examiner commands and practice messages share these location properties:

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
| `type`               |         string | `examiner-command` in route files; `route-message` in the practice-message file. |
| `lat`                |         number | Trigger-center latitude.                                             |
| `lng`                |         number | Trigger-center longitude.                                            |
| `pano`               |         string | Optional Street View panorama ID.                                    |
| `radius`             |         number | Trigger and checkpoint radius in metres. Must be greater than zero.  |
| `headingMin`         |         number | Optional minimum camera heading.                                     |
| `headingMax`         |         number | Optional maximum camera heading.                                     |
| `required`           |        boolean | Whether missing the event should be recorded and penalized.          |
| `penaltyOnMiss`      |         number | Penalty applied when this required event is missed.                  |
| `missedRouteMessage` | message object | Optional event-specific message displayed when this event is missed. |

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

## Practice Route Messages

Practice messages are stored together in `public/data/route-messages.json`. They display only in Practice mode and are not part of any exam route or route-progress sequence.

```json
{
  "id": "route-message-001",
  "type": "route-message",
  "lat": 35.8889953,
  "lng": 14.5032702,
  "radius": 30,
  "message": "Continue along this road.",
  "autoCloseMs": 8000,
  "priority": "normal"
}
```

| Property      |   Type | Description                                                                          |
| ------------- | -----: | ------------------------------------------------------------------------------------ |
| `message`     | string | Text displayed in the Route Message dialog.                                          |
| `autoCloseMs` | number | Automatic close delay in milliseconds. Use `0` to require the OK button.             |
| `priority`    | string | `normal` or `high`. High-priority messages are placed before queued normal messages. |

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

### Create the JSON file

Copy an existing route as a starting point:

```text
public/data/routes/route-001.json
```

Save the copy with a new ID:

```text
public/data/routes/route-003.json
```

Update its top-level fields:

```json
{
  "id": "route-003",
  "name": "Route 3"
}
```

Keep the route ID, filename, and URL parameter consistent.

### Add the route to the Editor

Add an option to `editor.html`:

```html
<option value="route-003">Route 3</option>
```

Add the route ID to the initial-route allowlist in `src/editor/editor-main.js`:

```js
["route-001", "route-002", "route-003"]
```

The driving page itself does not use this allowlist. If the JSON file exists, it can be loaded directly with:

```text
/?route=route-003
```

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
10. Export the JSON.

To maintain Practice messages, select **Practice Messages** in the Editor. Only Route Message events are available in that data set, and exports use the filename `route-messages.json`.

The Editor currently exports a download. It does not directly overwrite the local repository file.

Replace the corresponding file under:

```text
public/data/routes
```

Then review and push manually:

```bash
git status
git diff
git add public/data/routes/route-003.json
git commit -m "Update route 003"
git push
```

## Maintaining Event Order

New events are appended to the end of the `events` array.

Because array order defines route progress, inspect the exported JSON and ensure events appear in the actual driving order.

The current Editor does not provide drag-and-drop event reordering. If necessary, reorder the event objects manually in the JSON file before committing it.

Changing the order may change which events are marked as missed when a later checkpoint is reached.

## Route Validation

The Editor checks:

* Route ID and name
* Start coordinates
* Presence of the events array
* Unique event IDs
* Coordinates or Pano ID
* Positive trigger radius
* Complete Heading ranges
* Boolean `required` values
* Non-negative missed-event penalties
* Supported event types
* Examiner command text
* Answer radius
* Option count, IDs, and labels
* Correct-answer rules
* Correct sequence contents
* Non-negative penalties

Resolve validation errors before exporting the Route JSON.

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

## Current Demo Routes

```text
/?route=route-001
/?route=route-002
```

Editor URLs:

```text
/editor.html?route=route-001
/editor.html?route=route-002
```

Diagnostic URLs:

```text
/?route=route-001&currentinfo=1
/editor.html?route=route-001&exportcache=1
```
