"use client";

import { useEffect, useRef, useState } from "react";
import {
  addLocalFamily,
  CAPACITY,
  createInitialState,
  currentPax,
  DEFAULT_TIME_LIMIT_MINUTES,
  editLocalFamily,
  familyDueAt,
  familyPax,
  FLEX_CAPACITY,
  flexSpacesLeft,
  insideFamilies,
  LEGACY_LOCAL_STORAGE_BACKUP_KEY,
  LEGACY_LOCAL_STORAGE_KEY,
  LOCAL_STORAGE_BACKUP_KEY,
  LOCAL_STORAGE_KEY,
  MAX_TIME_LIMIT_MINUTES,
  markLocalFamilyOut,
  purgeExpiredCompletedFamilies,
  RECENT_OUT_MILLISECONDS,
  recentOutFamilies,
  readLocalState,
  restoreLocalFamily,
  restoreRecentLocalFamily,
  serializeLocalState,
  spacesLeft,
  type Family,
  type PlayPotState,
} from "./play-pot-local";

type UndoAction = {
  id: string;
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

const sgTime = new Intl.DateTimeFormat("en-SG", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Singapore",
});

function formatClock(value: string | null) {
  return value ? sgTime.format(new Date(value)) : "-";
}

function familyLabel(family: Family) {
  return `F${family.familyNumber}`;
}

function timerState(family: Family, now: number) {
  const dueAt = Date.parse(familyDueAt(family));
  const difference = dueAt - now;
  if (difference > 0) {
    return {
      label: `${Math.max(1, Math.ceil(difference / 60_000))} MIN LEFT`,
      overdue: false,
    };
  }

  const minutesOver = Math.floor((now - dueAt) / 60_000);
  if (minutesOver < 1) {
    return { label: `${family.timeLimitMinutes} MIN REACHED`, overdue: true };
  }
  return { label: `+${minutesOver} MIN OVER`, overdue: true };
}

function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = FLEX_CAPACITY,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper" aria-label={`${label}: ${value}`}>
      <span className="stepper-label">{label}</span>
      <button
        type="button"
        aria-label={`Remove one ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        -
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
  onSave: (
    adults: number,
    children: number,
    visual: string,
    timeLimitMinutes: number,
  ) => void;
  disabled: boolean;
}) {
  const [adults, setAdults] = useState(family.adults);
  const [children, setChildren] = useState(family.children);
  const [visual, setVisual] = useState(family.visual);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(family.timeLimitMinutes);

  return (
    <details className="family-editor">
      <summary>Edit</summary>
      <div className="editor-body">
        <div className="editor-steppers">
          <Stepper
            label="Adults"
            value={adults}
            max={FLEX_CAPACITY - children}
            onChange={setAdults}
          />
          <Stepper
            label="Children"
            value={children}
            max={FLEX_CAPACITY - adults}
            onChange={setChildren}
          />
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
        <div
          className="time-limit-editor"
          aria-label={`Time limit: ${timeLimitMinutes} minutes`}
        >
          <span>Time limit</span>
          <button
            type="button"
            aria-label="Decrease time limit by 1 minute"
            disabled={timeLimitMinutes <= 1}
            onClick={() => setTimeLimitMinutes((minutes) => Math.max(1, minutes - 1))}
          >
            -
          </button>
          <strong>{timeLimitMinutes} MIN</strong>
          <button
            type="button"
            aria-label="Extend time limit by 1 minute"
            disabled={timeLimitMinutes >= MAX_TIME_LIMIT_MINUTES}
            onClick={() =>
              setTimeLimitMinutes((minutes) =>
                Math.min(MAX_TIME_LIMIT_MINUTES, minutes + 1),
              )
            }
          >
            +
          </button>
        </div>
        <button
          className="save-correction"
          type="button"
          disabled={disabled}
          onClick={() => onSave(adults, children, visual, timeLimitMinutes)}
        >
          SAVE CHANGES
        </button>
      </div>
    </details>
  );
}

function ActiveFamilyCard({
  family,
  now,
  disabled,
  onOut,
  onEdit,
}: {
  family: Family;
  now: number;
  disabled: boolean;
  onOut: (trigger: HTMLButtonElement) => void;
  onEdit: (
    adults: number,
    children: number,
    visual: string,
    timeLimitMinutes: number,
  ) => void;
}) {
  const timer = timerState(family, now);

  return (
    <article className={`family-card ${timer.overdue ? "family-card-due" : ""}`}>
      <div className="family-main">
        <div className="family-id-block">
          <span className="family-id">{familyLabel(family)}</span>
          <span className="family-pax">
            {family.adults}A {family.children}C / {familyPax(family)} PAX
          </span>
        </div>
        <div className={`timer-pill ${timer.overdue ? "timer-due" : ""}`}>
          <strong>{timer.label}</strong>
        </div>
      </div>

      <div className="family-times">
        <span>IN {formatClock(family.enteredAt)}</span>
        <span aria-hidden="true">/</span>
        <span>
          {family.timeLimitMinutes} MIN {formatClock(familyDueAt(family))}
        </span>
      </div>

      <p className={family.visual ? "visual-note" : "visual-note visual-missing"}>
        {family.visual || "No visual yet"}
      </p>

      <div className="family-actions">
        <FamilyEditor
          key={`${family.id}-${family.adults}-${family.children}-${family.visual}-${family.timeLimitMinutes}`}
          family={family}
          disabled={disabled}
          onSave={onEdit}
        />
        <button
          type="button"
          className="out-button"
          disabled={disabled}
          onClick={(event) => onOut(event.currentTarget)}
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
  const stateRef = useRef<PlayPotState | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [guestPin, setGuestPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [customAdults, setCustomAdults] = useState(1);
  const [customChildren, setCustomChildren] = useState(1);
  const [visual, setVisual] = useState("");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [outCandidate, setOutCandidate] = useState<Family | null>(null);
  const [confirmFlex, setConfirmFlex] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<Family | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement | null>(null);
  const confirmationReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const confirmationHandledRef = useRef(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState("");
  const [isInstalled, setIsInstalled] = useState(false);

  function showState(next: PlayPotState) {
    stateRef.current = next;
    setState(next);
    setRecoveryRequired(false);
  }

  function commitState(next: PlayPotState) {
    const previous = stateRef.current;
    const savedAt = Date.now();
    const sanitizedNext = purgeExpiredCompletedFamilies(next, savedAt);
    let saved = true;
    try {
      const serialized = serializeLocalState(sanitizedNext);
      if (!readLocalState(serialized, savedAt)) {
        throw new Error("The updated phone record could not be verified.");
      }
      if (previous) {
        window.localStorage.setItem(
          LOCAL_STORAGE_BACKUP_KEY,
          serializeLocalState(
            purgeExpiredCompletedFamilies(previous, savedAt),
          ),
        );
      } else {
        window.localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, serialized);
      }
      window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_BACKUP_KEY);
      setUnsaved(false);
    } catch {
      saved = false;
      setUnsaved(true);
    }
    showState(sanitizedNext);
    return saved;
  }

  function openThisPhoneState() {
    const openedAt = Date.now();
    const currentRaw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    const backupRaw = window.localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
    const hasCurrentVersion = currentRaw !== null || backupRaw !== null;
    let next = readLocalState(currentRaw, openedAt);
    let recovered = false;
    let migrated = false;

    if (!next && backupRaw !== null) {
      next = readLocalState(backupRaw, openedAt);
      recovered = Boolean(next);
    }

    if (!next && !hasCurrentVersion) {
      const legacyRaw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
      const legacyBackupRaw = window.localStorage.getItem(
        LEGACY_LOCAL_STORAGE_BACKUP_KEY,
      );
      const hasLegacyVersion = legacyRaw !== null || legacyBackupRaw !== null;
      next = readLocalState(legacyRaw, openedAt);
      if (!next && legacyBackupRaw !== null) {
        next = readLocalState(legacyBackupRaw, openedAt);
        recovered = Boolean(next);
      }
      if (next) migrated = true;
      else if (!hasLegacyVersion) {
        next = createInitialState(openedAt, crypto.randomUUID());
      }
    }

    if (!next) {
      stateRef.current = null;
      setState(null);
      setRecoveryRequired(true);
      setAuthState("ready");
      return;
    }

    showState(next);
    setAuthState("ready");
    try {
      const serialized = serializeLocalState(next);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      window.localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, serialized);
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_BACKUP_KEY);
      setUnsaved(false);
    } catch {
      setUnsaved(true);
    }
    if (recovered) {
      setNotice({ tone: "info", message: "Recovered this phone's last valid record." });
    } else if (migrated) {
      setNotice({ tone: "info", message: "This phone's saved timers were updated safely." });
    }
  }

  async function loadState() {
    setLoadError("");
    try {
      const response = await fetch("/api/guest", { cache: "no-store" });
      const body = (await response.json()) as { authenticated?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not open Play Pot.");
      if (!body.authenticated) {
        stateRef.current = null;
        setState(null);
        setAuthState("locked");
        return;
      }
      openThisPhoneState();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not open Play Pot.");
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadState(), 0);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      void loadState();
    };
    const refreshFromThisBrowser = (event: StorageEvent) => {
      if (event.key !== LOCAL_STORAGE_KEY || !event.newValue) return;
      const next = readLocalState(event.newValue);
      if (next) showState(next);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("storage", refreshFromThisBrowser);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("storage", refreshFromThisBrowser);
    };
    // This effect owns the page lifecycle and deliberately runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state) return;

    const checkedAt = Date.now();
    const sanitized = purgeExpiredCompletedFamilies(state, checkedAt);
    if (sanitized !== state) {
      const immediateCleanup = window.setTimeout(() => commitState(sanitized), 0);
      return () => window.clearTimeout(immediateCleanup);
    }

    const recent = recentOutFamilies(state, checkedAt);
    if (!recent.length) return;
    const nextExpiry = Math.min(
      ...recent.map(
        (family) =>
          Date.parse(family.departedAt ?? "") + RECENT_OUT_MILLISECONDS,
      ),
    );
    const expiryCleanup = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current) return;
      const next = purgeExpiredCompletedFamilies(current, Date.now());
      if (next !== current) commitState(next);
    }, Math.max(0, nextExpiry - Date.now() + 25));

    return () => window.clearTimeout(expiryCleanup);
    // commitState deliberately writes both current and backup storage copies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.tone === "error" ? 10_000 : 8_000,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!outCandidate && !confirmFlex && !restoreCandidate) return;
    confirmationHandledRef.current = false;
    const cancelConfirmation = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOutCandidate(null);
      setConfirmFlex(false);
      setRestoreCandidate(null);
      const returnTarget = confirmationReturnFocusRef.current;
      confirmationReturnFocusRef.current = null;
      window.setTimeout(() => returnTarget?.focus(), 0);
    };
    const focusCancelButton = window.setTimeout(
      () => cancelConfirmationRef.current?.focus(),
      0,
    );
    document.addEventListener("keydown", cancelConfirmation);
    return () => {
      window.clearTimeout(focusCancelButton);
      document.removeEventListener("keydown", cancelConfirmation);
    };
  }, [outCandidate, confirmFlex, restoreCandidate]);

  function cancelOpenConfirmation() {
    setOutCandidate(null);
    setConfirmFlex(false);
    setRestoreCandidate(null);
    const returnTarget = confirmationReturnFocusRef.current;
    confirmationReturnFocusRef.current = null;
    window.setTimeout(() => returnTarget?.focus(), 0);
  }

  function vibrate() {
    if ("vibrate" in navigator) navigator.vibrate(20);
  }

  function reportActionError(error: unknown) {
    setNotice({
      tone: "error",
      message: error instanceof Error ? error.message : "Play Pot could not update.",
    });
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
      setUnlockError("Could not connect. Check this phone's internet connection.");
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

    const guidance =
      "iPhone: Share > Add to Home Screen. Android: browser menu > Install app.";
    if (state) setNotice({ tone: "info", message: guidance });
    else setInstallHelp(guidance);
  }

  function handleAdd(allowFlex = false) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = addLocalFamily(
        current,
        { adults: customAdults, children: customChildren, visual },
        crypto.randomUUID(),
        now,
        { allowFlex },
      );
      const added = insideFamilies(next).find(
        (family) => family.familyNumber === current.nextFamilyNumber,
      );
      commitState(next);
      const totalInside = currentPax(next);
      setNotice({
        tone: "success",
        message: `${added ? familyLabel(added) : "Family"} entered / ${customAdults + customChildren} pax / ${
          totalInside > CAPACITY ? `FLEX ${totalInside} of ${FLEX_CAPACITY}` : `${DEFAULT_TIME_LIMIT_MINUTES}-min timer started`
        }`,
      });
      setCustomAdults(1);
      setCustomChildren(1);
      setVisual("");
      vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleOut(family: Family) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const liveFamily = insideFamilies(current).find(
        (candidate) => candidate.id === family.id,
      );
      if (!liveFamily) throw new Error("That family is no longer inside.");
      const next = markLocalFamilyOut(current, liveFamily.id, now);
      commitState(next);
      setNotice({
        tone: "success",
        message: `${familyLabel(liveFamily)} OUT / ${familyPax(liveFamily)} spaces freed`,
        undo: { id: liveFamily.id },
      });
      vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleEdit(
    family: Family,
    adults: number,
    children: number,
    nextVisual: string,
    timeLimitMinutes: number,
  ) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = editLocalFamily(
        current,
        family.id,
        { adults, children, visual: nextVisual, timeLimitMinutes },
        now,
      );
      commitState(next);
      setNotice({
        tone: "success",
        message: `${familyLabel(family)} updated / ${adults + children} pax / ${timeLimitMinutes} min`,
      });
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleUndo(undo: UndoAction) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = restoreLocalFamily(current, undo.id, now);
      commitState(next);
      setNotice({ tone: "success", message: "Last OUT action undone" });
      vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleRestoreRecent(family: Family) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = restoreRecentLocalFamily(current, family.id, now);
      commitState(next);
      setNotice({
        tone: "success",
        message: `${familyLabel(family)} restored / original IN ${formatClock(
          family.enteredAt,
        )} / ${currentPax(next)} inside`,
      });
      vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleStartFresh() {
    const next = createInitialState(now, crypto.randomUUID());
    try {
      const serialized = serializeLocalState(next);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      window.localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, serialized);
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_BACKUP_KEY);
      setUnsaved(false);
    } catch {
      setUnsaved(true);
    }
    showState(next);
    setNotice({ tone: "info", message: "Fresh record started on this phone." });
  }

  if (authState === "locked") {
    return (
      <main className="guest-screen">
        <section className="guest-card" aria-labelledby="guest-title">
          <div className="brand-mark">PP</div>
          <span className="guest-kicker">STAFF GUEST ACCESS</span>
          <h1 id="guest-title">PLAY POT</h1>
          <p>Enter the staff PIN to open Play Pot on this phone.</p>

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
              onChange={(event) =>
                setGuestPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-describedby={unlockError ? "guest-error" : undefined}
            />
            {unlockError ? (
              <p id="guest-error" className="guest-error" role="alert">
                {unlockError}
              </p>
            ) : null}
            <button type="submit" disabled={guestPin.length !== 6 || pending === "unlock"}>
              {pending === "unlock" ? "OPENING..." : "OPEN PLAY POT"}
            </button>
          </form>

          {!isInstalled ? (
            <button type="button" className="install-app-button" onClick={() => void handleInstall()}>
              INSTALL ON THIS PHONE
            </button>
          ) : null}
          {installHelp ? <p className="install-help">{installHelp}</p> : null}
          <small>Private staff tool / family details stay on this phone.</small>
        </section>
      </main>
    );
  }

  if (recoveryRequired) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">PP</div>
        <h1>CHECK THIS PHONE</h1>
        <p>The saved record cannot be read safely.</p>
        <button type="button" onClick={handleStartFresh}>
          START FRESH ON THIS PHONE
        </button>
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
          <p>Opening this phone&apos;s shift...</p>
        )}
      </main>
    );
  }

  const activeFamilies = insideFamilies(state);
  const recentlyOut = recentOutFamilies(state, now);
  const paxInside = currentPax(state);
  const remaining = spacesLeft(state);
  const toTarget = Math.max(0, remaining);
  const toHardMax = flexSpacesLeft(state);
  const selectedPax = customAdults + customChildren;
  const projectedPax = paxInside + selectedPax;
  const fits = projectedPax <= CAPACITY;
  const canFlex =
    projectedPax > CAPACITY && projectedPax <= FLEX_CAPACITY;
  const overTargetBy = Math.max(0, paxInside - CAPACITY);
  const aboveHardMaxBy = Math.max(0, paxInside - FLEX_CAPACITY);
  const restoreProjectedPax = restoreCandidate
    ? paxInside + familyPax(restoreCandidate)
    : paxInside;
  const busy = Boolean(pending);

  return (
    <main className="app-shell">
      <header className="status-header">
        <div className="brand-row">
          <h1>PLAY POT</h1>
          <span className="live-label">THIS PHONE / LIVE</span>
        </div>

        <div className="capacity-row">
          <div className="capacity-number">
            <strong>{paxInside}</strong>
            <span>/ {CAPACITY} TARGET</span>
          </div>
          <div
            className={`spaces-card ${
              paxInside >= CAPACITY - 3 ? "spaces-low" : ""
            }`}
          >
            <strong>{paxInside <= CAPACITY ? toTarget : toHardMax}</strong>
            <span>{paxInside <= CAPACITY ? "TO TARGET" : "TO HARD MAX"}</span>
          </div>
        </div>

        {aboveHardMaxBy ? (
          <div className="over-capacity-alert" role="alert">
            ABOVE HARD MAX / {paxInside} INSIDE / {aboveHardMaxBy} OVER {FLEX_CAPACITY} / STOP ENTRY
          </div>
        ) : paxInside === FLEX_CAPACITY ? (
          <div className="over-capacity-alert" role="alert">
            HARD MAX / {FLEX_CAPACITY} INSIDE / STOP ENTRY
          </div>
        ) : overTargetBy ? (
          <div className="over-capacity-alert" role="alert">
            FLEX MODE / {paxInside} INSIDE / {overTargetBy} OVER TARGET / {toHardMax} TO HARD MAX
          </div>
        ) : paxInside === CAPACITY ? (
          <div className="target-capacity-alert" role="status">
            AT {CAPACITY} TARGET / FLEX ENTRY REQUIRES CONFIRMATION
          </div>
        ) : null}
        {unsaved ? (
          <div className="storage-alert" role="alert">
            NOT SAVED ON THIS PHONE / KEEP THIS SCREEN OPEN
          </div>
        ) : null}
      </header>

      <div className="content-stack">
        <section className="admission-section" aria-labelledby="admission-title">
          <div className="admission-composer">
            <div className="section-heading">
              <h2 id="admission-title">New family</h2>
              <span className="policy-reminder">
                {CAPACITY} TARGET / {FLEX_CAPACITY} HARD MAX
              </span>
            </div>

            <div className="front-counts">
              <Stepper
                label="Adults"
                value={customAdults}
                max={FLEX_CAPACITY - customChildren}
                onChange={setCustomAdults}
              />
              <Stepper
                label="Children"
                value={customChildren}
                max={FLEX_CAPACITY - customAdults}
                onChange={setCustomChildren}
              />
            </div>

            <div className="quick-details">
              <label className="field-label" htmlFor="visual-input">
                Visual <span>optional / 2-4 words</span>
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

            <div
              className={`admission-result ${
                fits ? "result-fit" : canFlex ? "result-overflow" : "result-block"
              }`}
            >
              {fits ? (
                <>
                  <strong>{selectedPax} PAX FITS</strong>
                  <span>{CAPACITY - projectedPax} to target after entry</span>
                </>
              ) : canFlex ? (
                <>
                  <strong>FLEX ENTRY / {projectedPax} OF {FLEX_CAPACITY}</strong>
                  <span>
                    {projectedPax - CAPACITY} over target / {FLEX_CAPACITY - projectedPax} to hard max
                  </span>
                </>
              ) : (
                <>
                  <strong>ENTRY BLOCKED</strong>
                  <span>
                    {paxInside > FLEX_CAPACITY
                      ? `Area is ${aboveHardMaxBy} over the hard max / correct or check OUT first`
                      : `Needs ${selectedPax} / only ${toHardMax} places to the hard max`}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              className={`commit-family-button ${canFlex ? "commit-overflow" : ""}`}
              disabled={busy || (!fits && !canFlex)}
              onClick={(event) => {
                if (canFlex) {
                  confirmationReturnFocusRef.current = event.currentTarget;
                  confirmationHandledRef.current = false;
                  setConfirmFlex(true);
                } else handleAdd();
              }}
            >
              {fits
                ? `ENTER FAMILY / ${selectedPax} PAX`
                : canFlex
                  ? `FLEX ENTRY / RECORD ${projectedPax} OF ${FLEX_CAPACITY}`
                  : toHardMax <= 0
                    ? "HARD MAX / STOP ENTRY"
                    : `CANNOT ENTER / ${selectedPax} PAX`}
            </button>
          </div>
        </section>

        <section className="operating-section" aria-labelledby="inside-title">
          <div className="section-heading">
            <h2 id="inside-title">Inside now</h2>
            <span className="section-count">{activeFamilies.length} FAMILIES</span>
          </div>

          <div className="family-list">
            {activeFamilies.length ? (
              activeFamilies.map((family) => (
                <ActiveFamilyCard
                  key={family.id}
                  family={family}
                  now={now}
                  disabled={busy}
                  onOut={(trigger) => {
                    confirmationReturnFocusRef.current = trigger;
                    confirmationHandledRef.current = false;
                    setOutCandidate(family);
                  }}
                  onEdit={(adults, children, nextVisual, timeLimitMinutes) =>
                    handleEdit(
                      family,
                      adults,
                      children,
                      nextVisual,
                      timeLimitMinutes,
                    )
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

        {recentlyOut.length ? (
          <section className="recent-out-section" aria-label="Recently OUT families">
            <details>
              <summary>
                <span>
                  <strong>Recently OUT</strong>
                  <em>{recentlyOut.length}</em>
                </span>
                <small>Kept on this phone for 15 min</small>
              </summary>
              <div className="recent-out-list">
                {recentlyOut.map((family) => (
                  <article className="recent-out-card" key={family.id}>
                    <div className="recent-out-main">
                      <div>
                        <strong>{familyLabel(family)}</strong>
                        <span>
                          {family.adults}A {family.children}C / {familyPax(family)} PAX
                        </span>
                      </div>
                      <p>{family.visual || "No visual recorded"}</p>
                    </div>
                    <div className="recent-out-times">
                      <span>IN {formatClock(family.enteredAt)}</span>
                      <span>OUT {formatClock(family.departedAt)}</span>
                    </div>
                    <button
                      type="button"
                      className="restore-button"
                      disabled={busy}
                      onClick={(event) => {
                        confirmationReturnFocusRef.current = event.currentTarget;
                        confirmationHandledRef.current = false;
                        setRestoreCandidate(family);
                      }}
                    >
                      RESTORE
                    </button>
                  </article>
                ))}
              </div>
            </details>
          </section>
        ) : null}
      </div>

      {outCandidate ? (
        <div className="confirm-overlay">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-out-title"
            aria-describedby="confirm-out-copy"
          >
            <h2 id="confirm-out-title">{familyLabel(outCandidate)} OUT?</h2>
            <p id="confirm-out-copy">
              {outCandidate.visual || `${outCandidate.adults}A ${outCandidate.children}C`} /
              remove {familyPax(outCandidate)} pax from Inside now.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={cancelOpenConfirmation}
              >
                NO
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (confirmationHandledRef.current) return;
                  confirmationHandledRef.current = true;
                  const family = outCandidate;
                  setOutCandidate(null);
                  confirmationReturnFocusRef.current = null;
                  handleOut(family);
                }}
              >
                YES, OUT
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmFlex ? (
        <div className="confirm-overlay">
          <section
            className="confirm-dialog confirm-dialog-overflow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-flex-title"
            aria-describedby="confirm-flex-copy"
          >
            <h2 id="confirm-flex-title">ALLOW FLEX ENTRY?</h2>
            <p id="confirm-flex-copy">
              This changes {paxInside} to {projectedPax} inside, {projectedPax - CAPACITY} above the {CAPACITY} target. {FLEX_CAPACITY - projectedPax} places remain before the hard maximum of {FLEX_CAPACITY}.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={cancelOpenConfirmation}
              >
                NO
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (confirmationHandledRef.current) return;
                  confirmationHandledRef.current = true;
                  setConfirmFlex(false);
                  confirmationReturnFocusRef.current = null;
                  handleAdd(true);
                }}
              >
                YES, ENTER
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {restoreCandidate ? (
        <div className="confirm-overlay">
          <section
            className={`confirm-dialog ${
              restoreProjectedPax > CAPACITY ? "confirm-dialog-overflow" : ""
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-restore-title"
            aria-describedby="confirm-restore-copy"
          >
            <h2 id="confirm-restore-title">
              RESTORE {familyLabel(restoreCandidate)}?
            </h2>
            <p id="confirm-restore-copy">
              Return {familyPax(restoreCandidate)} pax to Inside now with the original IN time of {formatClock(restoreCandidate.enteredAt)}. The live count becomes {restoreProjectedPax}.
              {restoreProjectedPax > FLEX_CAPACITY
                ? ` This reveals a count above the ${FLEX_CAPACITY} hard max. Stop new entry and correct the live situation.`
                : restoreProjectedPax > CAPACITY
                  ? ` This is ${restoreProjectedPax - CAPACITY} above the ${CAPACITY} target.`
                  : ""}
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={cancelOpenConfirmation}
              >
                NO
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (confirmationHandledRef.current) return;
                  confirmationHandledRef.current = true;
                  const family = restoreCandidate;
                  setRestoreCandidate(null);
                  confirmationReturnFocusRef.current = null;
                  handleRestoreRecent(family);
                }}
              >
                YES, RESTORE
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {notice ? (
        <div className={`toast toast-${notice.tone}`} role="status" aria-live="polite">
          <span>{notice.message}</span>
          {notice.undo ? (
            <button type="button" onClick={() => handleUndo(notice.undo!)}>
              UNDO
            </button>
          ) : (
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
              X
            </button>
          )}
        </div>
      ) : null}
    </main>
  );
}
