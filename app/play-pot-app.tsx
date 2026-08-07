"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type AuthState = "checking" | "locked" | "ready";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

class GuestSessionExpiredError extends Error {}

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
  if (response.status === 401) {
    throw new GuestSessionExpiredError("Guest session expired.");
  }
  if (!response.ok) {
    throw new Error(body.error ?? "Play Pot could not update.");
  }
  return body;
}

function Stepper({
  label,
  value,
  onChange,
  max = 15,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
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
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
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
  hasWaiting,
  askFirst,
  disabled,
  onOut,
  onEdit,
}: {
  family: Family;
  now: number;
  hasWaiting: boolean;
  askFirst: boolean;
  disabled: boolean;
  onOut: () => void;
  onEdit: (adults: number, children: number, visual: string) => void;
}) {
  const timer = timerState(family, now);
  const urgent = timer.overdue && hasWaiting;
  const emphasized = timer.overdue;

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
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [guestPin, setGuestPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [customAdults, setCustomAdults] = useState(1);
  const [customChildren, setCustomChildren] = useState(1);
  const [visual, setVisual] = useState("");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState("");
  const [isInstalled, setIsInstalled] = useState(false);
  const mutationLock = useRef(false);

  async function loadState() {
    setLoadError("");
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const body = (await response.json()) as PlayPotState & { error?: string };
      if (response.status === 401) {
        setState(null);
        setAuthState("locked");
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "Could not load Play Pot.");
      setState(body);
      setAuthState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load Play Pot.");
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadState(), 0);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const refreshOnReturn = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void loadState();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  useEffect(() => {
    const rememberInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallHelp("");
    };
    const detectInstalled = window.setTimeout(() => {
      const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
      setIsInstalled(
        window.matchMedia("(display-mode: standalone)").matches ||
          navigatorWithStandalone.standalone === true,
      );
    }, 0);

    window.addEventListener("beforeinstallprompt", rememberInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.clearTimeout(detectInstalled);
      window.removeEventListener("beforeinstallprompt", rememberInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
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
      if (error instanceof GuestSessionExpiredError) {
        setState(null);
        setAuthState("locked");
        setNotice(null);
        return;
      }
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Play Pot could not update.",
      });
    } finally {
      mutationLock.current = false;
      setPending("");
    }
  }

  async function handleGuestUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guestPin.length !== 6 || pending) return;

    setPending("unlock");
    setUnlockError("");
    try {
      const response = await fetch("/api/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: guestPin }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setUnlockError(body.error ?? "Could not open Play Pot.");
        return;
      }
      setGuestPin("");
      await loadState();
    } catch {
      setUnlockError("Could not connect. Check the phone's internet connection.");
    } finally {
      setPending("");
    }
  }

  async function handleInstall() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        setInstallHelp("");
      }
      return;
    }

    const guidance = "iPhone: Share → Add to Home Screen. Android: browser menu → Install app.";
    if (state) {
      setNotice({ tone: "info", message: guidance });
    } else {
      setInstallHelp(guidance);
    }
  }

  async function handleLock() {
    if (pending) return;
    setPending("lock");
    try {
      const response = await fetch("/api/guest", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not lock Play Pot.");
      setState(null);
      setAuthState("locked");
      setNotice(null);
      setGuestPin("");
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not lock Play Pot.",
      });
    } finally {
      setPending("");
    }
  }

  async function handleAdd() {
    if (!state) return;
    const pax = customAdults + customChildren;
    const mustQueue =
      state.waiting.length > 0 || state.spacesLeft < pax || state.currentPax > state.capacity;
    const placement = mustQueue ? "waiting" : "inside";
    const operationId = crypto.randomUUID();

    await runMutation("add", async () => {
      const result = await postAction({
        type: "add",
        operationId,
        adults: customAdults,
        children: customChildren,
        visual,
        ageStatus: "unchecked",
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
      setCustomAdults(1);
      setCustomChildren(1);
      setVisual("");
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

  if (authState === "locked") {
    return (
      <main className="guest-screen">
        <section className="guest-card" aria-labelledby="guest-title">
          <div className="brand-mark">PP</div>
          <span className="guest-kicker">STAFF GUEST ACCESS</span>
          <h1 id="guest-title">PLAY POT</h1>
          <p>Enter the shared 6-digit PIN to open the live capacity app.</p>

          <form className="guest-form" onSubmit={(event) => void handleGuestUnlock(event)}>
            <label htmlFor="guest-pin">Guest PIN</label>
            <input
              id="guest-pin"
              className="guest-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={guestPin}
              onChange={(event) => setGuestPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-describedby={unlockError ? "guest-error" : undefined}
            />
            {unlockError ? (
              <p id="guest-error" className="guest-error" role="alert">
                {unlockError}
              </p>
            ) : null}
            <button type="submit" disabled={guestPin.length !== 6 || pending === "unlock"}>
              {pending === "unlock" ? "OPENING…" : "OPEN PLAY POT"}
            </button>
          </form>

          {!isInstalled ? (
            <button type="button" className="install-app-button" onClick={() => void handleInstall()}>
              INSTALL ON THIS PHONE
            </button>
          ) : null}
          {installHelp ? <p className="install-help">{installHelp}</p> : null}
          <small>Private staff tool · live family details stay behind this screen.</small>
        </section>
      </main>
    );
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

  const selectedPax = customAdults + customChildren;
  const willQueue =
    state.waiting.length > 0 ||
    selectedPax > state.spacesLeft ||
    state.currentPax > state.capacity;
  const isOverCapacity = state.currentPax > state.capacity;

  return (
    <main className="app-shell">
      <header className="status-header">
        <div className="brand-row">
          <h1>PLAY POT</h1>
          <span className="live-label">GUEST · LIVE</span>
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

        {isOverCapacity ? (
          <div className="over-capacity-alert" role="alert">
            OVER CAPACITY BY {state.currentPax - state.capacity} · STOP ENTRY
          </div>
        ) : null}
      </header>

      <div className="content-stack">
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
          <div className="admission-composer">
            <div className="section-heading">
              <h2 id="admission-title">New family</h2>
              <span className="policy-reminder">CHECK PASS · 15 PAX MAX</span>
            </div>

            <div className="front-counts">
              <Stepper
                label="Adults"
                value={customAdults}
                max={15 - customChildren}
                onChange={setCustomAdults}
              />
              <Stepper
                label="Children"
                value={customChildren}
                max={15 - customAdults}
                onChange={setCustomChildren}
              />
            </div>

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
            </div>

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

            <button
              type="button"
              className={`commit-family-button ${willQueue ? "commit-queue" : ""}`}
              disabled={Boolean(pending)}
              onClick={() => void handleAdd()}
            >
              {pending === "add"
                ? "SAVING…"
                : willQueue
                  ? `ADD ${selectedPax} PAX TO WAITING`
                  : `ENTER FAMILY · ${selectedPax} PAX`}
            </button>
          </div>
        </section>

        <section className="operating-section" aria-labelledby="inside-title">
          <div className="section-heading sticky-section-title">
            <h2 id="inside-title">Inside now</h2>
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
          <div className="shift-footer-actions">
            {!isInstalled ? (
              <button type="button" onClick={() => void handleInstall()}>
                INSTALL APP
              </button>
            ) : null}
            <button type="button" disabled={Boolean(pending)} onClick={() => void handleLock()}>
              LOCK
            </button>
            <button
              type="button"
              disabled={Boolean(pending) || state.inside.length > 0 || state.waiting.length > 0}
              onClick={() => void handleNewShift()}
            >
              NEW SHIFT
            </button>
          </div>
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
