"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "quiet" | "busy";
type Theme = "light" | "dark";
type AgeStatus = "unchecked" | "under4" | "4plus";
type FamilyStatus = "waiting" | "inside" | "completed" | "left_queue";

type Family = {
  id: number;
  shiftId: number;
  familyNumber: number;
  adults: number;
  children: number;
  pax: number;
  visual: string;
  ageStatus: AgeStatus;
  status: FamilyStatus;
  createdAt: string;
  queuedAt: string | null;
  enteredAt: string | null;
  dueAt: string | null;
  departedAt: string | null;
};

type PlayPotState = {
  capacity: number;
  currentPax: number;
  spacesLeft: number;
  mode: Mode;
  shift: { id: number; startedAt: string };
  inside: Family[];
  waiting: Family[];
  history: Family[];
  serverTime: string;
};

type ActionResponse = {
  state: PlayPotState;
  affected: Family | null;
};

type UndoAction = {
  type: "restoreInside";
  id: number;
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
  undo?: UndoAction;
};

const PRESETS = [
  { adults: 1, children: 1 },
  { adults: 1, children: 2 },
  { adults: 2, children: 1 },
  { adults: 2, children: 2 },
];

const sgTime = new Intl.DateTimeFormat("en-SG", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Singapore",
});

function formatClock(value: string | null) {
  return value ? sgTime.format(new Date(value)) : "—";
}

function familyLabel(family: Family) {
  return `F${family.familyNumber}`;
}

function timerState(family: Family, now: number) {
  if (!family.dueAt) {
    return { label: "NOT STARTED", overdue: false, reached: false };
  }
  const difference = new Date(family.dueAt).getTime() - now;
  if (difference > 0) {
    return {
      label: `${Math.max(1, Math.ceil(difference / 60_000))} MIN LEFT`,
      overdue: false,
      reached: false,
    };
  }
  const minutesOver = Math.floor(Math.abs(difference) / 60_000);
  if (minutesOver < 1) {
    return { label: "15 MIN REACHED", overdue: true, reached: true };
  }
  return {
    label: `+${minutesOver} MIN OVER`,
    overdue: true,
    reached: true,
  };
}

function minutesInside(family: Family, now: number) {
  if (!family.enteredAt) return 0;
  return Math.max(
    0,
    Math.floor((now - new Date(family.enteredAt).getTime()) / 60_000),
  );
}

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as ActionResponse & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Play Pot could not update.");
  }
  return body;
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper" aria-label={`${label}: ${value}`}>
      <span className="stepper-label">{label}</span>
      <button
        type="button"
        aria-label={`Remove one ${label.toLowerCase()}`}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        −
      </button>
      <strong>{value}</strong>
      <button
        type="button"
        aria-label={`Add one ${label.toLowerCase()}`}
        onClick={() => onChange(Math.min(15, value + 1))}
      >
        +
      </button>
    </div>
  );
}

function FamilyEditor({
  family,
  onSave,
  disabled,
}: {
  family: Family;
  onSave: (adults: number, children: number, visual: string) => void;
  disabled: boolean;
}) {
  const [adults, setAdults] = useState(family.adults);
  const [children, setChildren] = useState(family.children);
  const [visual, setVisual] = useState(family.visual);

  return (
    <details className="family-editor">
      <summary>{family.visual ? "Correct details" : "+ Add visual / correct count"}</summary>
      <div className="editor-body">
        <div className="editor-steppers">
          <Stepper label="Adults" value={adults} onChange={setAdults} />
          <Stepper label="Children" value={children} onChange={setChildren} />
        </div>
        <label className="field-label" htmlFor={`visual-${family.id}`}>
          Visual identifier
        </label>
        <input
          id={`visual-${family.id}`}
          className="text-input"
          value={visual}
          maxLength={60}
          onChange={(event) => setVisual(event.target.value)}
          placeholder="e.g. blue stroller"
        />
        <button
          className="save-correction"
          type="button"
          disabled={disabled || adults + children > 15}
          onClick={() => onSave(adults, children, visual)}
        >
          SAVE {adults + children} PAX
        </button>
      </div>
    </details>
  );
}

function ActiveFamilyCard({
  family,
  now,
  mode,
  hasWaiting,
  askFirst,
  disabled,
  onOut,
  onEdit,
}: {
  family: Family;
  now: number;
  mode: Mode;
  hasWaiting: boolean;
  askFirst: boolean;
  disabled: boolean;
  onOut: () => void;
  onEdit: (adults: number, children: number, visual: string) => void;
}) {
  const timer = timerState(family, now);
  const urgent = timer.overdue && hasWaiting;
  const emphasized = timer.overdue && (mode === "busy" || hasWaiting);

  return (
    <article
      className={`family-card ${urgent ? "family-card-urgent" : emphasized ? "family-card-due" : ""}`}
    >
      <div className="family-main">
        <div className="family-id-block">
          <span className="family-id">{familyLabel(family)}</span>
          <span className="family-pax">
            {family.adults}A {family.children}C · {family.pax} PAX
          </span>
        </div>
        <div
          className={`timer-pill ${urgent ? "timer-urgent" : emphasized ? "timer-due" : ""}`}
        >
          {askFirst ? <span className="ask-first">ASK FIRST</span> : null}
          <strong>{timer.label}</strong>
        </div>
      </div>

      <div className="family-times">
        <span>IN {formatClock(family.enteredAt)}</span>
        <span aria-hidden="true">→</span>
        <span>15 MIN {formatClock(family.dueAt)}</span>
      </div>

      <p className={family.visual ? "visual-note" : "visual-note visual-missing"}>
        {family.visual || "No visual yet"}
      </p>

      <div className="family-actions">
        <FamilyEditor
          key={`${family.id}-${family.adults}-${family.children}-${family.visual}`}
          family={family}
          disabled={disabled}
          onSave={onEdit}
        />
        <button
          type="button"
          className="out-button"
          disabled={disabled}
          onClick={onOut}
          aria-label={`Check ${familyLabel(family)} out`}
        >
          OUT
        </button>
      </div>
    </article>
  );
}

export default function PlayPotApp() {
  const [state, setState] = useState<PlayPotState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [composerOpen, setComposerOpen] = useState(false);
  const [selection, setSelection] = useState<{ adults: number; children: number } | null>(null);
  const [customAdults, setCustomAdults] = useState(1);
  const [customChildren, setCustomChildren] = useState(1);
  const [visual, setVisual] = useState("");
  const [ageStatus, setAgeStatus] = useState<AgeStatus>("unchecked");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const mutationLock = useRef(false);

  async function loadState() {
    setLoadError("");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const body = (await response.json()) as PlayPotState & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load Play Pot.");
      setState(body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load Play Pot.");
    }
  }

  useEffect(() => {
    void loadState();
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const refreshOnReturn = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void loadState();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("play-pot-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme: Theme = saved === "dark" || (!saved && preferred) ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 10_000 : 8_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const overdueFamilies = useMemo(
    () => state?.inside.filter((family) => timerState(family, now).overdue) ?? [],
    [state, now],
  );
  const askFirstId = state?.waiting.length ? overdueFamilies[0]?.id : undefined;
  const queueHead = state?.waiting[0];
  const queueHeadCanEnter = Boolean(
    state && queueHead && queueHead.pax <= state.spacesLeft && state.spacesLeft >= 0,
  );

  function vibrate() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(20);
    }
  }

  async function runMutation(
    key: string,
    operation: () => Promise<void>,
    onFailure?: () => void,
  ) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setPending(key);
    try {
      await operation();
    } catch (error) {
      onFailure?.();
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Play Pot could not update.",
      });
    } finally {
      mutationLock.current = false;
      setPending("");
    }
  }

  async function handleAdd() {
    if (!state || !selection || ageStatus === "4plus") return;
    const pax = selection.adults + selection.children;
    const mustQueue =
      state.waiting.length > 0 || state.spacesLeft < pax || state.currentPax > state.capacity;
    const placement = mustQueue ? "waiting" : "inside";
    const operationId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    await runMutation("add", async () => {
      const result = await postAction({
        type: "add",
        operationId,
        adults: selection.adults,
        children: selection.children,
        visual,
        ageStatus,
        placement,
      });
      setState(result.state);
      const id = result.affected ? familyLabel(result.affected) : "Family";
      setNotice({
        tone: "success",
        message:
          placement === "inside"
            ? `${id} entered · ${pax} pax · 15-min timer started`
            : `${id} added to waiting · ${pax} pax`,
      });
      setSelection(null);
      setVisual("");
      setAgeStatus("unchecked");
      setComposerOpen(false);
      vibrate();
    });
  }

  async function handleOut(family: Family) {
    if (!state) return;
    const before = state;
    const optimisticPax = state.currentPax - family.pax;
    setState({
      ...state,
      currentPax: optimisticPax,
      spacesLeft: state.capacity - optimisticPax,
      inside: state.inside.filter((item) => item.id !== family.id),
      history: [
        { ...family, status: "completed", departedAt: new Date().toISOString() },
        ...state.history,
      ],
    });

    await runMutation(
      `out-${family.id}`,
      async () => {
        const result = await postAction({ type: "out", id: family.id });
        setState(result.state);
        setNotice({
          tone: "success",
          message: `${familyLabel(family)} OUT · ${family.pax} spaces freed`,
          undo: { type: "restoreInside", id: family.id },
        });
        vibrate();
      },
      () => setState(before),
    );
  }

  async function handleEnterWaiting(family: Family) {
    await runMutation(`enter-${family.id}`, async () => {
      const result = await postAction({ type: "enterWaiting", id: family.id });
      setState(result.state);
      setNotice({
        tone: "success",
        message: `${familyLabel(family)} entered · 15-min timer started now`,
      });
      vibrate();
    });
  }

  async function handleEdit(
    family: Family,
    adults: number,
    children: number,
    nextVisual: string,
  ) {
    await runMutation(`edit-${family.id}`, async () => {
      const result = await postAction({
        type: "editFamily",
        id: family.id,
        adults,
        children,
        visual: nextVisual,
      });
      setState(result.state);
      setNotice({
        tone: "success",
        message: `${familyLabel(family)} updated · ${adults + children} pax`,
      });
    });
  }

  async function handleUndo(undo: UndoAction) {
    await runMutation(`undo-${undo.id}`, async () => {
      const result = await postAction(undo);
      setState(result.state);
      setNotice({ tone: "success", message: "Last action undone" });
      vibrate();
    });
  }

  async function handleMode(mode: Mode) {
    if (!state || state.mode === mode) return;
    const before = state;
    setState({ ...state, mode });
    await runMutation(
      "mode",
      async () => {
        const result = await postAction({ type: "setMode", mode });
        setState(result.state);
      },
      () => setState(before),
    );
  }

  async function handleNewShift() {
    if (!state || state.inside.length || state.waiting.length) return;
    if (!window.confirm("Start a new shift? Completed history will be archived and IDs restart at F1.")) {
      return;
    }
    await runMutation("new-shift", async () => {
      const result = await postAction({ type: "newShift" });
      setState(result.state);
      setNotice({ tone: "success", message: "New shift started · next family is F1" });
    });
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("play-pot-theme", nextTheme);
  }

  if (!state) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">PP</div>
        <h1>PLAY POT</h1>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button type="button" onClick={() => void loadState()}>
              TRY AGAIN
            </button>
          </>
        ) : (
          <p>Opening today&apos;s shift…</p>
        )}
      </main>
    );
  }

  const selectedPax = selection ? selection.adults + selection.children : 0;
  const willQueue = Boolean(
    selection &&
      (state.waiting.length > 0 ||
        selectedPax > state.spacesLeft ||
        state.currentPax > state.capacity),
  );
  const isOverCapacity = state.currentPax > state.capacity;

  return (
    <main className="app-shell">
      <header className={`status-header status-${state.mode}`}>
        <div className="brand-row">
          <div>
            <span className="micro-label">CHILDREN&apos;S MUSEUM SINGAPORE</span>
            <h1>PLAY POT</h1>
          </div>
          <button
            type="button"
            className="theme-button"
            onClick={toggleTheme}
            aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? "DARK" : "LIGHT"}
          </button>
        </div>

        <div className="capacity-row">
          <div className="capacity-number">
            <strong>{state.currentPax}</strong>
            <span>/ {state.capacity} PAX</span>
          </div>
          <div className={`spaces-card ${state.spacesLeft <= 3 ? "spaces-low" : ""}`}>
            <strong>{Math.max(0, state.spacesLeft)}</strong>
            <span>SPACES LEFT</span>
          </div>
          <div className={`waiting-count ${state.waiting.length ? "has-waiting" : ""}`}>
            <strong>{state.waiting.length}</strong>
            <span>WAITING</span>
          </div>
        </div>

        <div className="mode-switch" aria-label="Operating mode">
          <button
            type="button"
            className={state.mode === "quiet" ? "mode-active" : ""}
            onClick={() => void handleMode("quiet")}
            disabled={Boolean(pending)}
          >
            QUIET MODE
          </button>
          <button
            type="button"
            className={state.mode === "busy" ? "mode-active busy-active" : ""}
            onClick={() => void handleMode("busy")}
            disabled={Boolean(pending)}
          >
            BUSY MODE
          </button>
        </div>

        {isOverCapacity ? (
          <div className="over-capacity-alert" role="alert">
            OVER CAPACITY BY {state.currentPax - state.capacity} · STOP ENTRY
          </div>
        ) : null}
      </header>

      <div className="content-stack">
        {state.mode === "busy" ? (
          <div className="control-banner">
            <strong>CONTROL ENTRY</strong>
            <span>One family at a time · check pass · count pax</span>
          </div>
        ) : null}

        {queueHead ? (
          <section
            className={`queue-alert ${queueHeadCanEnter ? "queue-alert-ready" : ""}`}
            aria-live="polite"
          >
            <div>
              <span>NEXT IN QUEUE</span>
              <strong>
                {queueHeadCanEnter
                  ? `${familyLabel(queueHead)} CAN ENTER NOW`
                  : `${familyLabel(queueHead)} NEEDS ${queueHead.pax} SPACES`}
              </strong>
            </div>
            {queueHeadCanEnter ? (
              <button
                type="button"
                onClick={() => void handleEnterWaiting(queueHead)}
                disabled={Boolean(pending)}
              >
                ENTER
              </button>
            ) : (
              <span className="need-more">
                {Math.max(0, queueHead.pax - state.spacesLeft)} MORE NEEDED
              </span>
            )}
          </section>
        ) : null}

        <section className="admission-section" aria-labelledby="admission-title">
          <button
            type="button"
            className="open-composer-button"
            onClick={() => setComposerOpen((open) => !open)}
            aria-expanded={composerOpen}
            aria-controls="admission-composer"
          >
            <span>{composerOpen ? "×" : "+"}</span>
            {composerOpen ? "CLOSE ADMISSION" : "ENTER FAMILY"}
          </button>

          {composerOpen ? (
            <div id="admission-composer" className="admission-composer">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">STEP 1</span>
                  <h2 id="admission-title">Tap family count</h2>
                </div>
                <span className="policy-reminder">15 PAX HARD LIMIT</span>
              </div>

              <div className="preset-grid">
                {PRESETS.map((preset) => {
                  const selected =
                    selection?.adults === preset.adults &&
                    selection?.children === preset.children;
                  return (
                    <button
                      type="button"
                      key={`${preset.adults}-${preset.children}`}
                      className={selected ? "preset-selected" : ""}
                      onClick={() => setSelection(preset)}
                    >
                      <strong>
                        {preset.adults}A {preset.children}C
                      </strong>
                      <span>{preset.adults + preset.children} PAX</span>
                    </button>
                  );
                })}
              </div>

              <details className="custom-count">
                <summary>CUSTOM COUNT</summary>
                <div className="custom-body">
                  <Stepper label="Adults" value={customAdults} onChange={setCustomAdults} />
                  <Stepper label="Children" value={customChildren} onChange={setCustomChildren} />
                  <button
                    type="button"
                    className="use-custom"
                    disabled={customAdults + customChildren > 15}
                    onClick={() =>
                      setSelection({ adults: customAdults, children: customChildren })
                    }
                  >
                    USE {customAdults + customChildren} PAX
                  </button>
                </div>
              </details>

              <div className="quick-details">
                <label className="field-label" htmlFor="visual-input">
                  Visual <span>optional · 2–4 words</span>
                </label>
                <input
                  id="visual-input"
                  className="text-input visual-input"
                  value={visual}
                  maxLength={60}
                  onChange={(event) => setVisual(event.target.value)}
                  placeholder="e.g. yellow tee kid"
                  autoComplete="off"
                />

                <fieldset className="age-check">
                  <legend>
                    Age check <span>optional</span>
                  </legend>
                  <div>
                    <button
                      type="button"
                      className={ageStatus === "unchecked" ? "age-selected" : ""}
                      onClick={() => setAgeStatus("unchecked")}
                    >
                      NOT RECORDED
                    </button>
                    <button
                      type="button"
                      className={ageStatus === "under4" ? "age-selected age-ok" : ""}
                      onClick={() => setAgeStatus("under4")}
                    >
                      UNDER 4 ✓
                    </button>
                    <button
                      type="button"
                      className={ageStatus === "4plus" ? "age-selected age-stop" : ""}
                      onClick={() => setAgeStatus("4plus")}
                    >
                      4+ CHECK
                    </button>
                  </div>
                </fieldset>
              </div>

              {ageStatus === "4plus" ? (
                <div className="eligibility-stop" role="alert">
                  MARKED 4+ · CHECK WITH STAFF BEFORE ADMISSION
                </div>
              ) : selection ? (
                <div className={`admission-result ${willQueue ? "result-queue" : "result-fit"}`}>
                  {willQueue ? (
                    <>
                      <strong>ADD TO WAITING</strong>
                      <span>
                        {state.waiting.length
                          ? "Queue already active · keep FIFO order"
                          : `Needs ${selectedPax} · only ${Math.max(0, state.spacesLeft)} spaces left`}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>{selectedPax} PAX FITS</strong>
                      <span>{state.spacesLeft - selectedPax} spaces remain after entry</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="admission-result result-empty">
                  TAP A COUNT ABOVE
                </div>
              )}

              <button
                type="button"
                className={`commit-family-button ${willQueue ? "commit-queue" : ""}`}
                disabled={!selection || ageStatus === "4plus" || Boolean(pending)}
                onClick={() => void handleAdd()}
              >
                {pending === "add"
                  ? "SAVING…"
                  : ageStatus === "4plus"
                    ? "STOP · CHECK AGE"
                    : !selection
                      ? "SELECT FAMILY COUNT"
                      : willQueue
                        ? `ADD ${selectedPax} PAX TO WAITING`
                        : `ENTER FAMILY · ${selectedPax} PAX`}
              </button>
            </div>
          ) : null}
        </section>

        <section className="operating-section" aria-labelledby="inside-title">
          <div className="section-heading sticky-section-title">
            <div>
              <span className="eyebrow">LIVE</span>
              <h2 id="inside-title">Inside now</h2>
            </div>
            <span className="section-count">{state.inside.length} FAMILIES</span>
          </div>

          {state.waiting.length && overdueFamilies.length ? (
            <div className="turnover-guidance">
              <strong>
                {familyLabel(overdueFamilies[0])} · {minutesInside(overdueFamilies[0], now)} MIN · ASK FIRST
              </strong>
              <span>Waiting family outside · longest inside is shown first</span>
            </div>
          ) : state.waiting.length ? (
            <div className="turnover-guidance turnover-neutral">
              <strong>NO FAMILY HAS REACHED 15 MIN YET</strong>
              <span>Keep queue order · do not disturb early</span>
            </div>
          ) : null}

          <div className="family-list">
            {state.inside.length ? (
              state.inside.map((family) => (
                <ActiveFamilyCard
                  key={family.id}
                  family={family}
                  now={now}
                  mode={state.mode}
                  hasWaiting={state.waiting.length > 0}
                  askFirst={family.id === askFirstId}
                  disabled={Boolean(pending)}
                  onOut={() => void handleOut(family)}
                  onEdit={(adults, children, nextVisual) =>
                    void handleEdit(family, adults, children, nextVisual)
                  }
                />
              ))
            ) : (
              <div className="empty-state">
                <strong>AREA CLEAR</strong>
                <span>Ready for the next family.</span>
              </div>
            )}
          </div>
        </section>

        <footer className="shift-footer">
          <div>
            <strong>SHIFT {state.shift.id}</strong>
            <span>Started {formatClock(state.shift.startedAt)} · use one active phone</span>
          </div>
          <button
            type="button"
            disabled={Boolean(pending) || state.inside.length > 0 || state.waiting.length > 0}
            onClick={() => void handleNewShift()}
          >
            NEW SHIFT
          </button>
        </footer>
      </div>

      {notice ? (
        <div className={`toast toast-${notice.tone}`} role="status" aria-live="polite">
          <span>{notice.message}</span>
          {notice.undo ? (
            <button type="button" onClick={() => void handleUndo(notice.undo!)}>
              UNDO
            </button>
          ) : (
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
              ×
            </button>
          )}
        </div>
      ) : null}
    </main>
  );
}
