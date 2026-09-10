const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function inputField(label, field, value, options = {}) {
  const type = options.type || "text";
  const attrs = [
    `type="${type}"`,
    `data-field="${field}"`,
    `value="${escapeHtml(value)}"`,
  ];

  if (options.step) attrs.push(`step="${options.step}"`);
  if (options.min !== undefined) attrs.push(`min="${options.min}"`);
  if (options.max !== undefined) attrs.push(`max="${options.max}"`);

  return `
    <label class="form-field">
      <span>${label}</span>
      <input ${attrs.join(" ")} />
    </label>
  `;
}

function textareaField(label, field, value) {
  return `
    <label class="form-field full-width">
      <span>${label}</span>
      <textarea data-field="${field}" rows="3">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function messageText(message) {
  return typeof message === "string"
    ? message
    : message?.message || "";
}

function routeNavigationFields(route) {
  const navigation = route.navigation;

  return `
    <section class="form-section">
      <h3>Route checkpoint defaults</h3>
      <div class="form-grid">
        <label class="correct-control">
          <input type="checkbox" data-route-field="eventsAreCheckpoints"
            ${navigation.eventsAreCheckpoints ? "checked" : ""} />
          Events are checkpoints
        </label>
        ${inputField(
          "Default missed-event penalty",
          "route-default-penalty",
          navigation.defaultPenaltyOnMiss ?? 0,
          { type: "number", min: 0 }
        ).replace(
          'data-field="route-default-penalty"',
          'data-route-field="defaultPenaltyOnMiss"'
        )}
      </div>
    </section>
  `;
}

function commonFields(event) {
  return `
    <section class="form-section">
      <div class="section-title">
        <h3>Trigger</h3>
        <span>${escapeHtml(event.type)}</span>
      </div>
      <div class="form-grid">
        ${inputField("Latitude", "lat", event.lat, { type: "number", step: "any" })}
        ${inputField("Longitude", "lng", event.lng, { type: "number", step: "any" })}
        ${inputField("Trigger radius (m)", "radius", event.radius, { type: "number", min: 1 })}
        ${inputField("Pano ID (optional)", "pano", event.pano || "")}
        ${inputField("Heading minimum", "headingMin", event.headingMin ?? "", { type: "number", min: 0, max: 360 })}
        ${inputField("Heading maximum", "headingMax", event.headingMax ?? "", { type: "number", min: 0, max: 360 })}
      </div>
      <button class="text-button" type="button" data-action="clear-heading">
        Remove heading restriction
      </button>
    </section>
  `;
}

function checkpointFields(event, route) {
  const defaultPenalty = route.navigation.defaultPenaltyOnMiss;

  return `
    <section class="form-section">
      <h3>Route checkpoint</h3>
      <div class="form-grid">
        <label class="correct-control">
          <input type="checkbox" data-field="required"
            ${event.required ? "checked" : ""} />
          Required event
        </label>
        ${inputField(
          `Penalty on miss (route default: ${defaultPenalty})`,
          "penaltyOnMiss",
          event.penaltyOnMiss,
          { type: "number", min: 0 }
        )}
      </div>
    </section>
  `;
}

function routeMessageFields(event) {
  return `
    <section class="form-section">
      <h3>Message</h3>
      <div class="form-grid">
        ${textareaField("Message text", "message", event.message)}
        ${inputField("Auto-close (ms, 0 = OK)", "autoCloseMs", event.autoCloseMs ?? 0, { type: "number", min: 0 })}
        <label class="form-field">
          <span>Priority</span>
          <select data-field="priority">
            <option value="normal" ${event.priority !== "high" ? "selected" : ""}>Normal</option>
            <option value="high" ${event.priority === "high" ? "selected" : ""}>High</option>
          </select>
        </label>
      </div>
    </section>
  `;
}

function optionRows(event) {
  const isSequence = event.answerMode === "sequence";

  return (event.options || []).map((option, index) => `
    <div class="option-row">
      <div class="option-index">${index + 1}</div>
      <div class="option-fields">
        <label class="form-field">
          <span>Label</span>
          <input type="text" data-option-index="${index}" data-option-field="label"
            value="${escapeHtml(option.label)}" />
        </label>
        <label class="form-field compact">
          <span>Penalty</span>
          <input type="number" min="0" data-option-index="${index}"
            data-option-field="penalty" value="${escapeHtml(option.penalty ?? 0)}" />
        </label>
        ${isSequence ? "" : `
          <label class="correct-control">
            <input
              type="${event.answerMode === "single" ? "radio" : "checkbox"}"
              name="correct-option"
              data-option-index="${index}"
              data-option-field="correct"
              ${option.correct ? "checked" : ""}
            />
            Correct
          </label>
        `}
        ${isSequence ? "" : `
          <label class="form-field full-width">
            <span>Important feedback (optional)</span>
            <input type="text" data-option-index="${index}" data-option-field="feedback"
              value="${escapeHtml(messageText(option.routeMessage))}" />
          </label>
        `}
      </div>
      <button class="icon-button danger" type="button" data-action="remove-option"
        data-option-index="${index}" aria-label="Remove option">×</button>
    </div>
  `).join("");
}

function sequenceEditor(event) {
  if (event.answerMode !== "sequence") {
    return "";
  }

  const optionsById = new Map(
    event.options.map((option) => [option.id, option])
  );
  const sequence = event.correctSequence || [];

  return `
    <section class="sequence-editor">
      <h4>Correct sequence</h4>
      <p>Use the arrows to set the required order.</p>
      ${sequence.map((id, index) => `
        <div class="sequence-row">
          <strong>${index + 1}</strong>
          <span>${escapeHtml(optionsById.get(id)?.label || id)}</span>
          <button type="button" data-action="move-sequence" data-index="${index}"
            data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-action="move-sequence" data-index="${index}"
            data-direction="1" ${index === sequence.length - 1 ? "disabled" : ""}>↓</button>
        </div>
      `).join("")}
    </section>
  `;
}

function commandFields(event) {
  return `
    <section class="form-section">
      <h3>Examiner command</h3>
      <div class="form-grid">
        ${textareaField("Command", "command", event.command)}
        ${inputField("Answer radius (m)", "answerRadius", event.answerRadius, { type: "number", min: 1 })}
        ${inputField("Out-of-range penalty", "penaltyOnOutOfRange", event.penaltyOnOutOfRange ?? 0, { type: "number", min: 0 })}
        <label class="form-field">
          <span>Answer mode</span>
          <select data-field="answerMode">
            <option value="single" ${event.answerMode === "single" ? "selected" : ""}>Single choice</option>
            <option value="multiple" ${event.answerMode === "multiple" ? "selected" : ""}>Multiple choice</option>
            <option value="sequence" ${event.answerMode === "sequence" ? "selected" : ""}>Sequence</option>
          </select>
        </label>
        ${textareaField(
          "Out-of-range message",
          "outOfRangeMessage",
          messageText(event.outOfRangeRouteMessage)
        )}
      </div>
    </section>

    <section class="form-section">
      <div class="section-title">
        <h3>Options</h3>
        <button class="button small" type="button" data-action="add-option">+ Add option</button>
      </div>
      <div class="options-list">${optionRows(event)}</div>
      ${sequenceEditor(event)}
    </section>

    ${event.answerMode !== "single" ? `
      <section class="form-section">
        <h3>Command result</h3>
        <div class="form-grid">
          ${inputField("Incorrect-answer penalty", "penalty", event.penalty ?? 0, { type: "number", min: 0 })}
          ${textareaField("Correct message", "correctMessage", messageText(event.correctRouteMessage))}
          ${textareaField("Incorrect message", "incorrectMessage", messageText(event.incorrectRouteMessage))}
        </div>
      </section>
    ` : ""}
  `;
}

function normalizeAnswerMode(event, mode) {
  event.answerMode = mode;

  if (mode === "sequence") {
    const known = new Set(event.options.map((option) => option.id));
    const retained = (event.correctSequence || [])
      .filter((id) => known.has(id));
    event.correctSequence = [
      ...retained,
      ...event.options.map((option) => option.id)
        .filter((id) => !retained.includes(id)),
    ];
    return;
  }

  delete event.correctSequence;
  if (mode === "single") {
    const selectedIndex = Math.max(
      0,
      event.options.findIndex((option) => option.correct)
    );
    event.options.forEach((option, index) => {
      option.correct = index === selectedIndex;
    });
  } else if (!event.options.some((option) => option.correct)) {
    event.options[0].correct = true;
  }
}

export function createEventForm({ container, title, store }) {
  let currentEventId = null;

  function render(state) {
    const event = state.route?.events.find(
      (item) => item.id === state.selectedEventId
    );

    currentEventId = event?.id || null;
    title.textContent = event?.id || "Nothing selected";

    if (!event) {
      container.innerHTML = `
        <div class="empty-state">
          Right-click the map to add an event, or select an existing marker.
        </div>
      `;
      return;
    }

    const isPracticeMessages = state.route.type === "practice-messages";

    container.innerHTML = `
      ${isPracticeMessages ? "" : routeNavigationFields(state.route)}
      ${commonFields(event)}
      ${isPracticeMessages ? "" : checkpointFields(event, state.route)}
      ${event.type === "route-message"
        ? routeMessageFields(event)
        : commandFields(event)}
      <section class="form-section danger-zone">
        <button class="button danger" type="button" data-action="delete-event">
          Delete event
        </button>
      </section>
    `;
  }

  container.addEventListener("change", (domEvent) => {
    if (!currentEventId) return;

    const target = domEvent.target;
    const routeField = target.dataset.routeField;
    const field = target.dataset.field;
    const optionIndex = Number(target.dataset.optionIndex);

    if (routeField) {
      const route = store.getState().route;
      const navigation = {
        ...(route.navigation || {}),
      };

      navigation[routeField] = routeField === "eventsAreCheckpoints"
        ? target.checked
        : Number(target.value);
      store.updateRoute({ navigation });
      return;
    }
    const optionField = target.dataset.optionField;

    if (field) {
      store.mutateEvent(currentEventId, (event) => {
        const numericFields = new Set([
          "lat", "lng", "radius", "headingMin", "headingMax",
          "autoCloseMs", "answerRadius", "penaltyOnOutOfRange", "penalty",
          "penaltyOnMiss",
        ]);

        if (field === "required") {
          event.required = target.checked;
        } else if (field === "answerMode") {
          normalizeAnswerMode(event, target.value);
        } else if (field === "outOfRangeMessage") {
          event.outOfRangeRouteMessage = {
            ...(event.outOfRangeRouteMessage || {}),
            message: target.value,
            autoCloseMs: 0,
            priority: "high",
          };
        } else if (field === "correctMessage" || field === "incorrectMessage") {
          const key = field === "correctMessage"
            ? "correctRouteMessage"
            : "incorrectRouteMessage";
          event[key] = {
            ...(event[key] || {}),
            message: target.value,
            autoCloseMs: field === "correctMessage" ? 5000 : 0,
            priority: "high",
          };
        } else if (numericFields.has(field)) {
          if (target.value === "" && field.startsWith("heading")) {
            delete event[field];
          } else {
            event[field] = Number(target.value);
          }
        } else {
          event[field] = target.value;
        }
      });
      return;
    }

    if (Number.isInteger(optionIndex) && optionField) {
      store.mutateEvent(currentEventId, (event) => {
        const option = event.options[optionIndex];
        if (!option) return;

        if (optionField === "correct") {
          if (event.answerMode === "single") {
            event.options.forEach((item, index) => {
              item.correct = index === optionIndex;
            });
          } else {
            option.correct = target.checked;
          }
        } else if (optionField === "penalty") {
          option.penalty = Number(target.value);
        } else if (optionField === "feedback") {
          option.routeMessage = {
            ...(option.routeMessage || {}),
            message: target.value,
            autoCloseMs: option.correct ? 5000 : 0,
            priority: "high",
          };
        } else {
          option[optionField] = target.value;
        }
      });
    }
  });

  container.addEventListener("click", (domEvent) => {
    const button = domEvent.target.closest("button[data-action]");
    if (!button || !currentEventId) return;

    const action = button.dataset.action;

    if (action === "delete-event") {
      if (window.confirm(`Delete ${currentEventId}?`)) {
        store.removeEvent(currentEventId);
      }
      return;
    }

    if (action === "clear-heading") {
      store.mutateEvent(currentEventId, (event) => {
        delete event.headingMin;
        delete event.headingMax;
      });
      return;
    }

    if (action === "add-option") {
      store.mutateEvent(currentEventId, (event) => {
        let number = event.options.length + 1;
        while (event.options.some((option) => option.id === `option-${number}`)) {
          number += 1;
        }
        const option = {
          id: `option-${number}`,
          label: `Option ${number}`,
          correct: false,
          penalty: 1,
        };
        event.options.push(option);
        if (event.answerMode === "sequence") {
          event.correctSequence = [...(event.correctSequence || []), option.id];
        }
      });
      return;
    }

    if (action === "remove-option") {
      const index = Number(button.dataset.optionIndex);
      store.mutateEvent(currentEventId, (event) => {
        const [removed] = event.options.splice(index, 1);
        if (removed && event.correctSequence) {
          event.correctSequence = event.correctSequence.filter(
            (id) => id !== removed.id
          );
        }
        if (
          event.answerMode === "single" &&
          event.options.length > 0 &&
          !event.options.some((option) => option.correct)
        ) {
          event.options[0].correct = true;
        }
      });
      return;
    }

    if (action === "move-sequence") {
      const index = Number(button.dataset.index);
      const targetIndex = index + Number(button.dataset.direction);
      store.mutateEvent(currentEventId, (event) => {
        if (targetIndex < 0 || targetIndex >= event.correctSequence.length) return;
        [event.correctSequence[index], event.correctSequence[targetIndex]] =
          [event.correctSequence[targetIndex], event.correctSequence[index]];
      });
    }
  });

  return { render };
}
