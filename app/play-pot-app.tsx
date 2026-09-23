"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { confirmationArmed } from "./confirmation-guard";
import {
  addLocalFamily,
  CAPACITY,
  createInitialState,
  currentPax,
  DEFAULT_TIME_LIMIT_MINUTES,
  deleteAllRecentLocalFamilies,
  deleteRecentLocalFamily,
  editLocalFamily,
  familyDueAt,
  familyPax,
  FLEX_CAPACITY,
  insideFamilies,
  LEGACY_LOCAL_STORAGE_BACKUP_KEY,
  LEGACY_LOCAL_STORAGE_KEY,
  LOCAL_STORAGE_BACKUP_KEY,
  LOCAL_STORAGE_KEY,
  MAX_TIME_LIMIT_MINUTES,
  markLocalFamilyOut,
  nextDueLocalFamily,
  purgeExpiredCompletedFamilies,
  RECENT_OUT_MILLISECONDS,
  recentOutFamilies,
  readLocalState,
  restoreLocalFamily,
  restoreRecentLocalFamily,
  serializeLocalState,
  spacesLeft,
  UNDO_MILLISECONDS,
  type Family,
  type PlayPotState,
} from "./play-pot-local";
import {
  createLiveSyncPayload,
  LIVE_DEVICE_STORAGE_KEY,
  LIVE_HEARTBEAT_MILLISECONDS,
} from "./live-view-core";
import {
  formatClock,
  formatMinutesOver,
  formatShortDate,
  isFromEarlierDay,
} from "./time-format";

type UndoAction = {
  id: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
  undo?: UndoAction;
  durationMs?: number;
};

type AuthState = "checking" | "locked" | "ready";

type EditCandidate = {
  family: Family;
  adults: number;
  children: number;
  visual: string;
  timeLimitMinutes: number;
};

const ENTRY_LOCK_MILLISECONDS = 700;
const ACTION_NOTICE_MILLISECONDS = 1_000;
const VISUAL_PLACEHOLDER = "Clothing or items only, e.g. red stroller";

function familyLabel(family: Family) {
  return `#${family.familyNumber}`;
}

function peopleCount(count: number) {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

function familyBreakdown(family: Family) {
  const adults = `${family.adults} ${family.adults === 1 ? "adult" : "adults"}`;
  const children = `${family.children} ${
    family.children === 1 ? "child" : "children"
  }`;
  return `${adults}, ${children}`;
}

function timerState(family: Family, now: number) {
  const dueAt = Date.parse(familyDueAt(family));
  const difference = dueAt - now;
  if (difference > 0) {
    return {
      label: `${Math.max(1, Math.ceil(difference / 60_000))} min left`,
      overdue: false,
    };
  }

  const minutesOver = Math.floor((now - dueAt) / 60_000);
  if (minutesOver < 1) {
    return { label: "Due now", overdue: true };
  }
  return { label: formatMinutesOver(minutesOver), overdue: true };
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
    <div className="stepper" role="group" aria-label={`${label}: ${value}`}>
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

// Two of these sit side by side in the entry dock, so the unit sits under the number.
function CountStepper({
  label,
  units,
  value,
  onChange,
  min = 1,
  max = FLEX_CAPACITY,
}: {
  label: string;
  units: [string, string];
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="count-stepper" role="group" aria-label={`${label}: ${value}`}>
      <button
        type="button"
        aria-label={`Remove one ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="count-stepper-value">
        <strong>{value}</strong>
        <small>{value === 1 ? units[0] : units[1]}</small>
      </span>
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
  summary,
  onSave,
  disabled,
}: {
  family: Family;
  summary: React.ReactNode;
  onSave: (
    adults: number,
    children: number,
    visual: string,
    timeLimitMinutes: number,
    trigger: HTMLButtonElement,
  ) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adults, setAdults] = useState(family.adults);
  const [children, setChildren] = useState(family.children);
  const [visual, setVisual] = useState(family.visual);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(family.timeLimitMinutes);
  const changed =
    adults !== family.adults ||
    children !== family.children ||
    visual !== family.visual ||
    timeLimitMinutes !== family.timeLimitMinutes;

  function resetAndClose() {
    setAdults(family.adults);
    setChildren(family.children);
    setVisual(family.visual);
    setTimeLimitMinutes(family.timeLimitMinutes);
    setOpen(false);
  }

  return (
    <details
      className="family-editor"
      open={open}
      onToggle={(event) => {
        const editor = event.currentTarget;
        setOpen(editor.open);
        // Its scroll margins keep the opened editor clear of the header and the entry dock.
        if (editor.open) editor.scrollIntoView({ block: "nearest" });
      }}
    >
      {/* The whole details area opens the editor; the chip says so. */}
      <summary aria-label={`Edit ${familyLabel(family)}`}>
        {summary}
        <span className={open ? "edit-cue edit-cue-open" : "edit-cue"}>
          {open ? (
            "Close"
          ) : (
            // A pencil keeps the description line wide; the summary label says "Edit".
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </summary>
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
          Wearing or carrying <span>clothing/items only</span>
        </label>
        <input
          id={`visual-${family.id}`}
          className="text-input"
          value={visual}
          maxLength={60}
          onChange={(event) => setVisual(event.target.value)}
          placeholder={VISUAL_PLACEHOLDER}
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
          <strong>{timeLimitMinutes} min</strong>
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
        <div className="editor-actions">
          <button className="cancel-correction" type="button" onClick={resetAndClose}>
            Cancel
          </button>
          <button
            className="save-correction"
            type="button"
            disabled={disabled || !changed}
            onClick={(event) =>
              onSave(
                adults,
                children,
                visual,
                timeLimitMinutes,
                event.currentTarget,
              )
            }
          >
            Save changes
          </button>
        </div>
      </div>
    </details>
  );
}

function ActiveFamilyCard({
  family,
  now,
  disabled,
  isNextDue,
  onOut,
  onEdit,
}: {
  family: Family;
  now: number;
  disabled: boolean;
  isNextDue: boolean;
  onOut: (trigger: HTMLButtonElement) => void;
  onEdit: (
    adults: number,
    children: number,
    visual: string,
    timeLimitMinutes: number,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const timer = timerState(family, now);
  const fromEarlierDay = isFromEarlierDay(family.enteredAt, now);
  // "12 min left" shows as a large 12 over a small "min left".
  const [timerLead, ...timerRest] = timer.label.split(" ");
  const timeUsed = Math.min(
    1,
    Math.max(0, (now - Date.parse(family.enteredAt)) / (family.timeLimitMinutes * 60_000)),
  );

  return (
    <article
      className={`family-card ${timer.overdue ? "family-card-due" : ""} ${
        isNextDue ? "family-card-next" : ""
      }`}
    >
      {fromEarlierDay ? (
        <p className="stale-entry-flag" role="note">
          <strong>From an earlier day</strong>
          <span>In {formatShortDate(family.enteredAt)}</span>
        </p>
      ) : null}
      <div
        className={`timer-pill ${timer.overdue ? "timer-due" : ""}`}
        style={{ "--used": `${Math.round(timeUsed * 100)}%` } as React.CSSProperties}
      >
        <strong>{timerLead}</strong>
        <span>{timerRest.join(" ")}</span>
      </div>
      <button
        type="button"
        className="out-button"
        disabled={disabled}
        onClick={(event) => onOut(event.currentTarget)}
        aria-label={`Check ${familyLabel(family)} out`}
      >
        Out
      </button>
      <FamilyEditor
        key={`${family.id}-${family.adults}-${family.children}-${family.visual}-${family.timeLimitMinutes}`}
        family={family}
        disabled={disabled}
        onSave={onEdit}
        summary={
          <span className="family-details">
            <span className={family.visual ? "visual-note" : "visual-note visual-missing"}>
              {family.visual || "No description yet"}
            </span>
            <span className="family-id-line">
              <span className="family-id">
                {familyLabel(family)} · {familyPax(family)} people
              </span>
              <span className="family-pax">
                {familyBreakdown(family)}
              </span>
            </span>
            <span className="family-times">
              <span>In {formatClock(family.enteredAt)}</span>
              <span className="family-due-time">
                Due {formatClock(familyDueAt(family))}
              </span>
            </span>
          </span>
        }
      />
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
  const [deleteCandidate, setDeleteCandidate] = useState<Family | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmStartFresh, setConfirmStartFresh] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editCandidate, setEditCandidate] = useState<EditCandidate | null>(null);
  const [entryLocked, setEntryLocked] = useState(false);
  const [entryRecorded, setEntryRecorded] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  // The list is anchored to the entry dock; stay pinned to the bottom unless staff scrolled up.
  const stickToBottomRef = useRef(true);
  const guestPinInputRef = useRef<HTMLInputElement | null>(null);
  const entryLockRef = useRef(false);
  const entryUnlockTimerRef = useRef<number | null>(null);
  const cancelConfirmationRef = useRef<HTMLButtonElement | null>(null);
  const confirmationDialogRef = useRef<HTMLElement | null>(null);
  const confirmationReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const confirmationHandledRef = useRef(false);
  const confirmationOpenedAtRef = useRef(0);
  const liveDeviceIdRef = useRef("");
  const liveSyncInFlightRef = useRef(false);
  const liveSyncPendingRef = useRef<PlayPotState | null>(null);

  function liveDeviceId() {
    if (liveDeviceIdRef.current) return liveDeviceIdRef.current;
    try {
      const existing = window.localStorage.getItem(LIVE_DEVICE_STORAGE_KEY);
      if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) {
        liveDeviceIdRef.current = existing;
        return existing;
      }
    } catch {
      // A temporary ID still allows the tracker itself to remain usable.
    }
    const created = crypto.randomUUID();
    liveDeviceIdRef.current = created;
    try {
      window.localStorage.setItem(LIVE_DEVICE_STORAGE_KEY, created);
    } catch {
      // Live view is best-effort and never blocks local operations.
    }
    return created;
  }

  function scheduleLiveSync(next: PlayPotState) {
    liveSyncPendingRef.current = next;
    if (liveSyncInFlightRef.current) return;
    liveSyncInFlightRef.current = true;

    const flush = async () => {
      while (liveSyncPendingRef.current) {
        const pendingState = liveSyncPendingRef.current;
        liveSyncPendingRef.current = null;
        try {
          await fetch("/api/live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              createLiveSyncPayload(pendingState, liveDeviceId()),
            ),
            cache: "no-store",
            keepalive: true,
          });
        } catch {
          // A failed mirror must never interrupt the phone's local tracker.
        }
      }
      liveSyncInFlightRef.current = false;
    };
    void flush();
  }

  function showState(next: PlayPotState) {
    stateRef.current = next;
    setState(next);
    setRecoveryRequired(false);
  }

  function commitState(
    next: PlayPotState,
    options: { mirrorToBackup?: boolean } = {},
  ) {
    const previous = stateRef.current;
    const savedAt = Date.now();
    const sanitizedNext = purgeExpiredCompletedFamilies(next, savedAt);
    let saved = true;
    try {
      const serialized = serializeLocalState(sanitizedNext);
      if (!readLocalState(serialized, savedAt)) {
        throw new Error("The updated phone record could not be verified.");
      }
      if (previous && options.mirrorToBackup !== true) {
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
    if (saved) {
      showState(sanitizedNext);
      // A new card must not show "16 min left" until the next clock tick.
      setNow(savedAt);
    }
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
      const body = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not open Play Pot.");
      }
      if (!body.authenticated) {
        stateRef.current = null;
        setState(null);
        setAuthState("locked");
        return;
      }
      openThisPhoneState();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not open Play Pot.",
      );
    }
  }

  useEffect(
    () => () => {
      if (entryUnlockTimerRef.current !== null) {
        window.clearTimeout(entryUnlockTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadState(), 0);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      void loadState();
    };
    const refreshFromThisBrowser = (event: StorageEvent) => {
      if (event.key !== LOCAL_STORAGE_KEY) return;
      if (!event.newValue) {
        stateRef.current = null;
        setState(null);
        setRecoveryRequired(true);
        setNotice({
          tone: "error",
          message: "This phone's Play Pot record was cleared in another window.",
        });
        return;
      }
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
      const immediateCleanup = window.setTimeout(
        () => commitState(sanitized, { mirrorToBackup: true }),
        0,
      );
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
      if (next !== current) {
        commitState(next, { mirrorToBackup: true });
      }
    }, Math.max(0, nextExpiry - Date.now() + 25));

    return () => window.clearTimeout(expiryCleanup);
    // commitState deliberately writes both current and backup storage copies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (authState !== "ready" || !state) return;
    const initialSync = window.setTimeout(() => scheduleLiveSync(state), 0);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const current = stateRef.current;
      if (current) scheduleLiveSync(current);
    }, LIVE_HEARTBEAT_MILLISECONDS);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(heartbeat);
    };
    // Live sync is best-effort and intentionally follows each saved revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, state]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.durationMs ??
        (notice.undo
          ? UNDO_MILLISECONDS
          : notice.tone === "error"
            ? 10_000
            : 8_000),
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // On a weak signal the first open can take 10 s; say so instead of looking frozen.
  useEffect(() => {
    const slow = window.setTimeout(() => setSlowLoad(true), 4_000);
    return () => window.clearTimeout(slow);
  }, []);

  useEffect(() => {
    if (authState === "locked") guestPinInputRef.current?.focus();
  }, [authState]);

  useEffect(() => {
    const trackBottom = () => {
      stickToBottomRef.current =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 96;
    };
    window.addEventListener("scroll", trackBottom, { passive: true });
    return () => window.removeEventListener("scroll", trackBottom);
  }, []);

  // Keeps the family due next directly above ENTER after every change.
  useLayoutEffect(() => {
    if (authState !== "ready" || !state || !stickToBottomRef.current) return;
    window.scrollTo(0, document.documentElement.scrollHeight);
  }, [authState, state]);

  // A layout effect stamps the open time before any later tap is handled.
  useLayoutEffect(() => {
    confirmationOpenedAtRef.current = performance.now();
  }, [
    outCandidate,
    confirmFlex,
    restoreCandidate,
    deleteCandidate,
    confirmDeleteAll,
    editCandidate,
    confirmStartFresh,
    confirmReset,
  ]);

  useEffect(() => {
    if (
      !outCandidate &&
      !confirmFlex &&
      !restoreCandidate &&
      !deleteCandidate &&
      !confirmDeleteAll &&
      !editCandidate &&
      !confirmStartFresh &&
      !confirmReset
    ) {
      return;
    }
    confirmationHandledRef.current = false;
    const handleConfirmationKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOutCandidate(null);
        setConfirmFlex(false);
        setRestoreCandidate(null);
        setDeleteCandidate(null);
        setConfirmDeleteAll(false);
        setEditCandidate(null);
        setConfirmStartFresh(false);
        setConfirmReset(false);
        const returnTarget = confirmationReturnFocusRef.current;
        confirmationReturnFocusRef.current = null;
        window.setTimeout(() => returnTarget?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        confirmationDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons.at(0);
      const last = buttons.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusCancelButton = window.setTimeout(
      () => cancelConfirmationRef.current?.focus(),
      0,
    );
    document.addEventListener("keydown", handleConfirmationKeydown);
    return () => {
      window.clearTimeout(focusCancelButton);
      document.removeEventListener("keydown", handleConfirmationKeydown);
    };
  }, [
    outCandidate,
    confirmFlex,
    restoreCandidate,
    deleteCandidate,
    confirmDeleteAll,
    editCandidate,
    confirmStartFresh,
    confirmReset,
  ]);

  function cancelOpenConfirmation() {
    setOutCandidate(null);
    setConfirmFlex(false);
    setRestoreCandidate(null);
    setDeleteCandidate(null);
    setConfirmDeleteAll(false);
    setEditCandidate(null);
    setConfirmStartFresh(false);
    setConfirmReset(false);
    const returnTarget = confirmationReturnFocusRef.current;
    confirmationReturnFocusRef.current = null;
    window.setTimeout(() => returnTarget?.focus(), 0);
  }

  function confirmationIsArmed() {
    return confirmationArmed(confirmationOpenedAtRef.current, performance.now());
  }

  function handleConfirmationNo() {
    if (!confirmationIsArmed()) return;
    cancelOpenConfirmation();
  }

  // Lets exactly one YES through, and only once the dialog is armed.
  function claimConfirmation() {
    if (confirmationHandledRef.current || !confirmationIsArmed()) return false;
    confirmationHandledRef.current = true;
    return true;
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
    await unlockWithPin(guestPin);
  }

  async function unlockWithPin(pin: string) {
    if (pin.length !== 6 || pending) return;

    setPending("unlock");
    setUnlockError("");
    try {
      const response = await fetch("/api/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
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

  function handleAdd(allowFlex = false) {
    if (entryLockRef.current) return;
    const current = stateRef.current;
    if (!current) return;
    entryLockRef.current = true;
    setEntryLocked(true);
    setEntryRecorded(false);
    let recorded = false;
    try {
      const actionAt = Date.now();
      const next = addLocalFamily(
        current,
        { adults: customAdults, children: customChildren, visual },
        crypto.randomUUID(),
        actionAt,
        { allowFlex },
      );
      const added = insideFamilies(next).find(
        (family) => family.familyNumber === current.nextFamilyNumber,
      );
      const saved = commitState(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `${added ? familyLabel(added) : "Family"} entered · ${customAdults + customChildren} people · ${DEFAULT_TIME_LIMIT_MINUTES}-min timer started`
          : "Not entered: this phone could not save it. Try again.",
        durationMs: saved ? ACTION_NOTICE_MILLISECONDS : undefined,
      });
      recorded = saved;
      if (saved) {
        setCustomAdults(1);
        setCustomChildren(1);
        setVisual("");
        vibrate();
      }
    } catch (error) {
      reportActionError(error);
    } finally {
      setEntryRecorded(recorded);
      if (entryUnlockTimerRef.current !== null) {
        window.clearTimeout(entryUnlockTimerRef.current);
      }
      entryUnlockTimerRef.current = window.setTimeout(() => {
        entryLockRef.current = false;
        setEntryLocked(false);
        setEntryRecorded(false);
        entryUnlockTimerRef.current = null;
      }, ENTRY_LOCK_MILLISECONDS);
    }
  }

  function handleOut(family: Family) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const actionAt = Date.now();
      const liveFamily = insideFamilies(current).find(
        (candidate) => candidate.id === family.id,
      );
      if (!liveFamily) throw new Error("That family is no longer inside.");
      const next = markLocalFamilyOut(current, liveFamily.id, actionAt);
      const saved = commitState(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `${familyLabel(liveFamily)} checked out · ${familyPax(liveFamily)} people left Play Pot`
          : "OUT not saved: this phone could not save it. Try again.",
        undo: saved ? { id: liveFamily.id } : undefined,
      });
      if (saved) vibrate();
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
        // A correction must use the actual tap time after mobile backgrounding.
        // eslint-disable-next-line react-hooks/purity
        Date.now(),
      );
      const saved = commitState(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `${familyLabel(family)} updated · ${adults + children} people · ${timeLimitMinutes}-min limit`
          : "Changes not saved: this phone could not save them. Try again.",
      });
    } catch (error) {
      reportActionError(error);
    }
  }

  function requestEdit(
    family: Family,
    adults: number,
    children: number,
    nextVisual: string,
    timeLimitMinutes: number,
    trigger: HTMLButtonElement,
  ) {
    const current = stateRef.current;
    if (!current) return;
    const projectedPax =
      currentPax(current) - familyPax(family) + adults + children;
    const increasesLivePax = adults + children > familyPax(family);
    if (increasesLivePax && projectedPax > CAPACITY) {
      confirmationReturnFocusRef.current = trigger;
      confirmationHandledRef.current = false;
      setEditCandidate({
        family,
        adults,
        children,
        visual: nextVisual,
        timeLimitMinutes,
      });
      return;
    }
    handleEdit(family, adults, children, nextVisual, timeLimitMinutes);
  }

  function handleUndo(undo: UndoAction) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const family = current.families.find((candidate) => candidate.id === undo.id);
      const next = restoreLocalFamily(current, undo.id, Date.now());
      const saved = commitState(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `Check-out undone · ${family ? familyLabel(family) : "Family"} is back inside`
          : "Undo not saved: this phone could not save it. Try again.",
      });
      if (saved) vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleRestoreRecent(family: Family) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = restoreRecentLocalFamily(current, family.id, Date.now());
      const saved = commitState(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `${familyLabel(family)} back inside · IN ${formatClock(
              family.enteredAt,
            )} · ${peopleCount(currentPax(next))} inside`
          : "Not put back: this phone could not save it. Try again.",
      });
      if (saved) vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleDeleteRecent(family: Family) {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = deleteRecentLocalFamily(current, family.id, Date.now());
      const saved = commitState(next, { mirrorToBackup: true });
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `${familyLabel(family)}'s checked-out record deleted from this phone`
          : "Record not deleted: this phone could not save the change. Try again.",
      });
      if (saved) vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleDeleteAllRecent() {
    const current = stateRef.current;
    if (!current) return;
    try {
      const next = deleteAllRecentLocalFamilies(current, Date.now());
      const saved = commitState(next, { mirrorToBackup: true });
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? "All checked-out records deleted from this phone"
          : "Records not deleted: this phone could not save the change. Try again.",
      });
      if (saved) vibrate();
    } catch (error) {
      reportActionError(error);
    }
  }

  function handleStartFresh() {
    const next = createInitialState(Date.now(), crypto.randomUUID());
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

  function handleResetAll() {
    const saved = commitState(createInitialState(Date.now(), crypto.randomUUID()), {
      mirrorToBackup: true,
    });
    setNotice({
      tone: saved ? "success" : "error",
      message: saved
        ? "All clear · Play Pot is reset and numbering starts at #1"
        : "Reset not saved: this phone could not save it. Try again.",
    });
    if (saved) {
      setCustomAdults(1);
      setCustomChildren(1);
      setVisual("");
      vibrate();
    }
  }

  if (authState === "locked") {
    return (
      <main className="guest-screen">
        <section className="guest-card" aria-labelledby="guest-title">
          <div className="brand-mark">PP</div>
          <span className="guest-kicker">Staff access</span>
          <h1 id="guest-title">Play Pot</h1>
          <p>Enter the staff PIN to open Play Pot on this phone.</p>
          <p id="guest-pin-hint" className="guest-pin-hint">
            PIN <strong>000000</strong>
          </p>

          <form className="guest-form" onSubmit={(event) => void handleGuestUnlock(event)}>
            <label htmlFor="guest-pin">Staff PIN</label>
            <input
              ref={guestPinInputRef}
              id="guest-pin"
              className="guest-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={guestPin}
              onChange={(event) => {
                const pin = event.target.value.replace(/\D/g, "").slice(0, 6);
                setGuestPin(pin);
                // The sixth digit unlocks without a separate tap on ENTER.
                if (pin.length === 6) void unlockWithPin(pin);
              }}
              aria-describedby={
                unlockError ? "guest-pin-hint guest-error" : "guest-pin-hint"
              }
            />
            {unlockError ? (
              <p id="guest-error" className="guest-error" role="alert">
                {unlockError}
              </p>
            ) : null}
            <button type="submit" disabled={guestPin.length !== 6 || pending === "unlock"}>
              {pending === "unlock" ? "Opening…" : "Open"}
            </button>
          </form>
          <small>
            Each phone controls its own tracker. Read-only live view active. No
            names or contact details.
          </small>
        </section>
      </main>
    );
  }

  if (recoveryRequired) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">PP</div>
        <h1>Check this phone</h1>
        <p>
          The saved record cannot be read safely. Tell your supervisor before
          starting fresh.
        </p>
        <button
          type="button"
          onClick={(event) => {
            confirmationReturnFocusRef.current = event.currentTarget;
            confirmationHandledRef.current = false;
            setConfirmStartFresh(true);
          }}
        >
          Start fresh on this phone
        </button>

        {confirmStartFresh ? (
          <div className="confirm-overlay">
            <section
              ref={confirmationDialogRef}
              className="confirm-dialog confirm-dialog-delete"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-start-fresh-title"
              aria-describedby="confirm-start-fresh-copy"
            >
              <h2 id="confirm-start-fresh-title">Start fresh on this phone?</h2>
              <p id="confirm-start-fresh-copy">
                This replaces this phone&apos;s unreadable Play Pot record with
                an empty one. Families recorded on it will no longer show. This
                cannot be undone.
              </p>
              <div className="confirm-actions">
                <button
                  ref={cancelConfirmationRef}
                  type="button"
                  className="confirm-no"
                  onClick={handleConfirmationNo}
                >
                  No
                </button>
                <button
                  type="button"
                  className="confirm-yes"
                  onClick={() => {
                    if (!claimConfirmation()) return;
                    setConfirmStartFresh(false);
                    confirmationReturnFocusRef.current = null;
                    handleStartFresh();
                  }}
                >
                  Yes, start fresh
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    );
  }

  if (!state) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">PP</div>
        <h1>Play Pot</h1>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button type="button" onClick={() => void loadState()}>
              TRY AGAIN
            </button>
          </>
        ) : (
          <>
            <p>Opening this phone&apos;s shift...</p>
            {slowLoad ? (
              <p className="loading-slow" role="status">
                Still connecting. On weak signal this can take up to 10 seconds.
                Keep this screen open.
              </p>
            ) : null}
          </>
        )}
      </main>
    );
  }

  const activeFamilies = insideFamilies(state);
  const recentlyOut = recentOutFamilies(state, now);
  const paxInside = currentPax(state);
  const remaining = spacesLeft(state);
  const slotsLeftToFifteen = Math.max(0, remaining);
  const selectedPax = customAdults + customChildren;
  const projectedPax = paxInside + selectedPax;
  const fits = projectedPax <= CAPACITY;
  const canFlex =
    projectedPax > CAPACITY && projectedPax <= FLEX_CAPACITY;
  const restoreProjectedPax = restoreCandidate
    ? paxInside + familyPax(restoreCandidate)
    : paxInside;
  const editProjectedPax = editCandidate
    ? paxInside -
      familyPax(editCandidate.family) +
      editCandidate.adults +
      editCandidate.children
    : paxInside;
  // Earlier-day families keep their card flag but must not hide today's next due.
  const nextDueFamily = nextDueLocalFamily(state, (family) =>
    isFromEarlierDay(family.enteredAt, now),
  );
  const nextDueTimer = nextDueFamily
    ? timerState(nextDueFamily, now)
    : null;
  const busy = Boolean(pending);
  const familyCount =
    activeFamilies.length === 0
      ? "No families"
      : `${activeFamilies.length} ${
          activeFamilies.length === 1 ? "family" : "families"
        }`;
  // Newest at the top, family due next at the bottom, right above ENTER.
  const familiesByDue = [...activeFamilies].sort(
    (left, right) =>
      Date.parse(familyDueAt(right)) - Date.parse(familyDueAt(left)) ||
      right.familyNumber - left.familyNumber,
  );

  return (
    <main className="app-shell">
      <header className="status-header">
        <h1 className="sr-only">Play Pot</h1>
        <div className="capacity-row">
          <div
            className={`capacity-number ${
              paxInside >= FLEX_CAPACITY
                ? "capacity-max"
                : paxInside >= CAPACITY ? "capacity-full" : "capacity-safe"
            }`}
          >
            <strong>{paxInside}</strong>
            <span className="capacity-detail">
              <span>/ {CAPACITY} people</span>
              <span>{familyCount}</span>
            </span>
          </div>
          {/* Under 15: spaces left. From 15: how many more before the hard stop at 20. */}
          <div className="spaces-card">
            <strong>
              {paxInside < CAPACITY
                ? slotsLeftToFifteen
                : Math.max(0, FLEX_CAPACITY - paxInside)}
            </strong>
            <span>
              {paxInside < CAPACITY
                ? `${slotsLeftToFifteen === 1 ? "space" : "spaces"} left`
                : paxInside < FLEX_CAPACITY
                  ? `left, max ${FLEX_CAPACITY}`
                  : "full"}
            </span>
          </div>
          <button
            type="button"
            className="reset-button"
            disabled={busy || (activeFamilies.length === 0 && recentlyOut.length === 0)}
            onClick={(event) => {
              confirmationReturnFocusRef.current = event.currentTarget;
              confirmationHandledRef.current = false;
              setConfirmReset(true);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="reset-label">Reset</span>
          </button>
        </div>

        {unsaved ? (
          <div className="storage-alert" role="alert">
            Not saved on this phone. Your last action didn't count.
          </div>
        ) : null}
      </header>

      <div className="content-stack">
        <section className="operating-section" aria-labelledby="inside-title">
          {recentlyOut.length ? (
            <section
              className="recent-out-section"
              aria-label="Checked-out families"
            >
              <details>
                <summary>
                  <span>
                    <strong>Checked out</strong>
                    <em>{recentlyOut.length}</em>
                  </span>
                  <small>Last 15 min · put a family back if checked out by mistake</small>
                </summary>
                <div className="recent-out-list">
                  {recentlyOut.map((family) => (
                    <article className="recent-out-card" key={family.id}>
                      <div className="recent-out-main">
                        <div>
                          <strong>{familyLabel(family)}</strong>
                          <span>
                            {familyBreakdown(family)} · {familyPax(family)} people
                          </span>
                        </div>
                        <p>{family.visual || "No description"}</p>
                      </div>
                      <div className="recent-out-times">
                        <span>In {formatClock(family.enteredAt)}</span>
                        <span>Out {formatClock(family.departedAt)}</span>
                      </div>
                      <div className="recent-out-actions">
                        <button
                          type="button"
                          className="restore-button"
                          aria-label={`Put ${familyLabel(family)} back inside`}
                          disabled={busy}
                          onClick={(event) => {
                            confirmationReturnFocusRef.current =
                              event.currentTarget;
                            confirmationHandledRef.current = false;
                            setRestoreCandidate(family);
                          }}
                        >
                          Put back inside
                        </button>
                        <button
                          type="button"
                          className="delete-recent-button"
                          aria-label={`Delete ${familyLabel(family)}'s checked-out record`}
                          disabled={busy}
                          onClick={(event) => {
                            confirmationReturnFocusRef.current =
                              event.currentTarget;
                            confirmationHandledRef.current = false;
                            setDeleteCandidate(family);
                          }}
                        >
                          Delete record
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  type="button"
                  className="delete-all-recent-button"
                  disabled={busy}
                  onClick={(event) => {
                    confirmationReturnFocusRef.current = event.currentTarget;
                    confirmationHandledRef.current = false;
                    setConfirmDeleteAll(true);
                  }}
                >
                  Delete all records
                </button>
              </details>
            </section>
          ) : null}

          <div className="section-heading">
            <h2 id="inside-title">Inside now</h2>
            <span className="section-count">{familyCount}</span>
          </div>

          <div className="family-list">
            {familiesByDue.length ? (
              familiesByDue.map((family) => (
                <ActiveFamilyCard
                  key={family.id}
                  family={family}
                  now={now}
                  disabled={busy}
                  isNextDue={family.id === nextDueFamily?.id}
                  onOut={(trigger) => {
                    confirmationReturnFocusRef.current = trigger;
                    confirmationHandledRef.current = false;
                    setOutCandidate(family);
                  }}
                  onEdit={(
                    adults,
                    children,
                    nextVisual,
                    timeLimitMinutes,
                    trigger,
                  ) =>
                    requestEdit(
                      family,
                      adults,
                      children,
                      nextVisual,
                      timeLimitMinutes,
                      trigger,
                    )
                  }
                />
              ))
            ) : (
              <div className="empty-state">
                <strong>All clear</strong>
                <span>Ready for the next family.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="entry-dock" aria-labelledby="admission-title">
        <h2 id="admission-title" className="sr-only">
          New family
        </h2>
        {/* Toasts cover this lane, never a button. */}
        <div className="dock-lane">
          {nextDueFamily && nextDueTimer ? (
            <div
              className={`next-due ${
                nextDueTimer.overdue ? "next-due-overdue" : ""
              }`}
              role="status"
              aria-live="polite"
            >
              <span>Next due</span>
              <strong>
                {familyLabel(nextDueFamily)}
                {nextDueFamily.visual ? ` · ${nextDueFamily.visual}` : ""}
              </strong>
              <em>{nextDueTimer.label}</em>
            </div>
          ) : (
            <p className="dock-lane-idle">
              {activeFamilies.length
                ? "Only families from an earlier day are inside."
                : "No timers running."}
            </p>
          )}
        </div>

        <div className="front-counts">
          <CountStepper
            label="Adults"
            units={["adult", "adults"]}
            value={customAdults}
            max={FLEX_CAPACITY - customChildren}
            onChange={setCustomAdults}
          />
          <CountStepper
            label="Children"
            units={["child", "children"]}
            value={customChildren}
            max={FLEX_CAPACITY - customAdults}
            onChange={setCustomChildren}
          />
        </div>

        {/* The clothing field and ENTER share one row to keep the dock short. */}
        <div className="dock-entry-row">
          <label className="sr-only" htmlFor="visual-input">
            Wearing or carrying (optional; clothing or items only)
          </label>
          <input
            id="visual-input"
            className="text-input visual-input"
            value={visual}
            maxLength={60}
            onChange={(event) => setVisual(event.target.value)}
            placeholder={VISUAL_PLACEHOLDER}
            autoComplete="off"
          />
  
          <button
            type="button"
            className={`commit-family-button ${
              !fits ? "commit-overflow" : ""
            } ${!fits && !canFlex ? "commit-blocked" : ""} ${
              entryLocked && entryRecorded ? "commit-recorded" : ""
            }`}
            disabled={busy || entryLocked || (!fits && !canFlex)}
            aria-busy={entryLocked}
            onClick={(event) => {
              if (canFlex) {
                confirmationReturnFocusRef.current = event.currentTarget;
                confirmationHandledRef.current = false;
                setConfirmFlex(true);
              } else handleAdd();
            }}
          >
            {entryLocked
              ? entryRecorded
                ? "Added ✓"
                : "One moment…"
              : fits || canFlex
                ? `Enter ${selectedPax} people`
                : paxInside >= FLEX_CAPACITY
                  ? `Full at ${FLEX_CAPACITY} · no entry`
                  : `Only ${Math.max(0, FLEX_CAPACITY - paxInside)} more ${
                      FLEX_CAPACITY - paxInside === 1 ? "fits" : "fit"
                    }`}
          </button>
          </div>
      </section>

      {outCandidate ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-out-title"
            aria-describedby="confirm-out-copy"
          >
            <h2 id="confirm-out-title">Check out {familyLabel(outCandidate)}?</h2>
            <p id="confirm-out-copy">
              {outCandidate.visual || familyBreakdown(outCandidate)} ·{" "}
              {familyPax(outCandidate)} people leave.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  const family = outCandidate;
                  setOutCandidate(null);
                  confirmationReturnFocusRef.current = null;
                  handleOut(family);
                }}
              >
                Yes, check out
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmFlex ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className="confirm-dialog confirm-dialog-overflow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-flex-title"
            aria-describedby="confirm-flex-copy"
          >
            <h2 id="confirm-flex-title">Enter above {CAPACITY}?</h2>
            <p id="confirm-flex-copy">
              This makes {projectedPax} people inside, over the normal {CAPACITY}.
              The hard limit is {FLEX_CAPACITY}.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  setConfirmFlex(false);
                  confirmationReturnFocusRef.current = null;
                  handleAdd(true);
                }}
              >
                Yes, enter
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {restoreCandidate ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className={`confirm-dialog ${
              restoreProjectedPax > CAPACITY
                ? "confirm-dialog-overflow"
                : "confirm-dialog-safe"
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-restore-title"
            aria-describedby="confirm-restore-copy"
          >
            <h2 id="confirm-restore-title">
              Put {familyLabel(restoreCandidate)} back inside?
            </h2>
            <p id="confirm-restore-copy">
              {familyPax(restoreCandidate)} people go back inside with their original
              IN time of {formatClock(restoreCandidate.enteredAt)}. Total inside
              becomes {restoreProjectedPax}.
              {restoreProjectedPax > FLEX_CAPACITY
                ? ` That is over the hard limit of ${FLEX_CAPACITY}: stop new entry and correct the count.`
                : restoreProjectedPax > CAPACITY
                  ? ` That is over the normal ${CAPACITY}.`
                  : ""}
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  const family = restoreCandidate;
                  setRestoreCandidate(null);
                  confirmationReturnFocusRef.current = null;
                  handleRestoreRecent(family);
                }}
              >
                Yes, put back
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className="confirm-dialog confirm-dialog-delete"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            aria-describedby="confirm-delete-copy"
          >
            <h2 id="confirm-delete-title">
              Delete {familyLabel(deleteCandidate)}&apos;s record?
            </h2>
            <p id="confirm-delete-copy">
              This removes {familyLabel(deleteCandidate)}&apos;s checked-out
              record from this phone for good. Nobody inside changes.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  const family = deleteCandidate;
                  setDeleteCandidate(null);
                  confirmationReturnFocusRef.current = null;
                  handleDeleteRecent(family);
                }}
              >
                Yes, delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmDeleteAll ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className="confirm-dialog confirm-dialog-delete"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-all-title"
            aria-describedby="confirm-delete-all-copy"
          >
            <h2 id="confirm-delete-all-title">Delete all checked-out records?</h2>
            <p id="confirm-delete-all-copy">
              This removes all {recentlyOut.length} checked-out
              {recentlyOut.length === 1 ? " record" : " records"} from this
              phone for good. Nobody inside changes.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  setConfirmDeleteAll(false);
                  confirmationReturnFocusRef.current = null;
                  handleDeleteAllRecent();
                }}
              >
                Yes, delete all
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {editCandidate ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className="confirm-dialog confirm-dialog-overflow"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-edit-title"
            aria-describedby="confirm-edit-copy"
          >
            <h2 id="confirm-edit-title">Save this count change?</h2>
            <p id="confirm-edit-copy">
              {familyLabel(editCandidate.family)} goes from {familyPax(
                editCandidate.family,
              )} to {editCandidate.adults + editCandidate.children} people. Total
              inside goes from {paxInside} to {editProjectedPax}.
              {editProjectedPax > FLEX_CAPACITY
                ? ` That is over the hard limit of ${FLEX_CAPACITY}, so new entry stays blocked until the count drops.`
                : ` That is over the normal ${CAPACITY}.`}
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  const candidate = editCandidate;
                  setEditCandidate(null);
                  confirmationReturnFocusRef.current = null;
                  handleEdit(
                    candidate.family,
                    candidate.adults,
                    candidate.children,
                    candidate.visual,
                    candidate.timeLimitMinutes,
                  );
                }}
              >
                Yes, save
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmReset ? (
        <div className="confirm-overlay">
          <section
            ref={confirmationDialogRef}
            className="confirm-dialog confirm-dialog-delete"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-reset-title"
            aria-describedby="confirm-reset-copy"
          >
            <h2 id="confirm-reset-title">Reset to a clean slate?</h2>
            <p id="confirm-reset-copy">
              This clears everything on this phone:{" "}
              <strong>
                {activeFamilies.length}{" "}
                {activeFamilies.length === 1 ? "family" : "families"} inside (
                {peopleCount(paxInside)})
              </strong>{" "}
              and{" "}
              <strong>
                {recentlyOut.length} checked-out{" "}
                {recentlyOut.length === 1 ? "record" : "records"}
              </strong>
              . Numbering starts again at #1. This can&apos;t be undone.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                No
              </button>
              <button
                type="button"
                className="confirm-yes"
                onClick={() => {
                  if (!claimConfirmation()) return;
                  setConfirmReset(false);
                  confirmationReturnFocusRef.current = null;
                  handleResetAll();
                }}
              >
                Yes, reset all
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
              Undo
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
