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

function familyBreakdown(family: Family) {
  const adults = `${family.adults} ${family.adults === 1 ? "ADULT" : "ADULTS"}`;
  const children = `${family.children} ${
    family.children === 1 ? "CHILD" : "CHILDREN"
  }`;
  return `${adults}, ${children}`;
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

function FamilyEditor({
  family,
  onSave,
  disabled,
  summary,
  defaultOpen = false,
  onClose,
}: {
  family: Family;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  onClose?: () => void;
  onSave: (
    adults: number,
    children: number,
    visual: string,
    timeLimitMinutes: number,
    trigger: HTMLButtonElement,
  ) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
    onClose?.();
  }

  return (
    <details
      className="family-editor"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label={`Edit ${familyLabel(family)}`}>{summary ?? "Edit"}</summary>
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
          Visual identifier <span>clothing/items only</span>
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
        <div className="editor-actions">
          <button className="cancel-correction" type="button" onClick={resetAndClose}>
            CANCEL
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
            SAVE CHANGES
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
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const timer = timerState(family, now);
  const fromEarlierDay = isFromEarlierDay(family.enteredAt, now);

  return (
    <article className={`family-card ${timer.overdue ? "family-card-due" : ""}`}>
      {fromEarlierDay ? (
        <p className="stale-entry-flag" role="note">
          <strong>FROM EARLIER DAY</strong>
          <span>IN {formatShortDate(family.enteredAt)}</span>
        </p>
      ) : null}
      <div className="family-main">
        <div className="family-id-block">
          <span className="family-id">
            {familyLabel(family)} | {familyPax(family)} PAX
          </span>
          <span className="family-pax">
            {familyBreakdown(family)}
          </span>
        </div>
        <div className={`timer-pill ${timer.overdue ? "timer-due" : ""}`}>
          <strong>{timer.label}</strong>
        </div>
      </div>

      <div className="family-times">
        <span>IN {formatClock(family.enteredAt)}</span>
        <span className="family-due-time">
          DUE {formatClock(familyDueAt(family))}
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


// ---- Layout prototype helpers (throwaway branch) ----
function shortTimer(family: Family, now: number) {
  const timer = timerState(family, now);
  if (timer.label.includes("REACHED")) return { big: "DUE", small: "NOW", overdue: true };
  const [big, ...rest] = timer.label.split(" ");
  return { big, small: rest.join(" "), overdue: timer.overdue };
}

function rowSummary(family: Family, now: number) {
  const timer = shortTimer(family, now);
  const stale = isFromEarlierDay(family.enteredAt, now);
  return (
    <span className="cr-summary">
      <span className="cr-info">
        <strong>
          #{family.familyNumber} · {family.visual || <em className="cr-novisual">No visual</em>}
        </strong>
        <small>
          {familyPax(family)} PAX · {family.adults}A {family.children}C · IN {formatClock(family.enteredAt)}
          {stale ? " · EARLIER DAY" : ""}
        </small>
      </span>
      <span className="cr-timer">
        <b>{timer.big}</b>
        <small>{timer.small}</small>
      </span>
    </span>
  );
}

type EditHandler = (
  adults: number,
  children: number,
  visual: string,
  timeLimitMinutes: number,
  trigger: HTMLButtonElement,
) => void;

function CompactFamilyRow({
  family,
  now,
  disabled,
  onEdit,
  action,
}: {
  family: Family;
  now: number;
  disabled: boolean;
  onEdit: EditHandler;
  action: React.ReactNode;
}) {
  const timer = timerState(family, now);
  return (
    <article className={`cr ${timer.overdue ? "cr-due" : ""}`}>
      <FamilyEditor
        key={`${family.id}-${family.adults}-${family.children}-${family.visual}-${family.timeLimitMinutes}`}
        family={family}
        disabled={disabled}
        onSave={onEdit}
        summary={rowSummary(family, now)}
      />
      {action}
    </article>
  );
}

function DockStepper({
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
    <div className="dock-stepper" role="group" aria-label={`${label}: ${value}`}>
      <button
        type="button"
        aria-label={`Remove one ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="dock-stepper-value">
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

function EditSheet({
  family,
  disabled,
  onSave,
  onClose,
}: {
  family: Family;
  disabled: boolean;
  onSave: EditHandler;
  onClose: () => void;
}) {
  return (
    <div
      className="confirm-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="confirm-dialog edit-sheet" role="dialog" aria-modal="true" aria-label={`Edit ${familyLabel(family)}`}>
        <h2>Edit {familyLabel(family)}</h2>
        <FamilyEditor
          family={family}
          disabled={disabled}
          defaultOpen
          onClose={onClose}
          onSave={(adults, children, visual, timeLimitMinutes, trigger) => {
            onSave(adults, children, visual, timeLimitMinutes, trigger);
            onClose();
          }}
        />
      </section>
    </div>
  );
}
// ---- end prototype helpers ----

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
  const [editCandidate, setEditCandidate] = useState<EditCandidate | null>(null);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editSheetId, setEditSheetId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [entryLocked, setEntryLocked] = useState(false);
  const [entryRecorded, setEntryRecorded] = useState(false);
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
    if (saved) showState(sanitizedNext);
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

  // Prototypes A and B keep the bottom-anchored list scrolled to the thumb.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [state?.revision, authState, mode]);

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
  ]);

  useEffect(() => {
    if (
      !outCandidate &&
      !confirmFlex &&
      !restoreCandidate &&
      !deleteCandidate &&
      !confirmDeleteAll &&
      !editCandidate &&
      !confirmStartFresh
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
  ]);

  function cancelOpenConfirmation() {
    setOutCandidate(null);
    setConfirmFlex(false);
    setRestoreCandidate(null);
    setDeleteCandidate(null);
    setConfirmDeleteAll(false);
    setEditCandidate(null);
    setConfirmStartFresh(false);
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
          ? `${added ? familyLabel(added) : "Family"} entered / ${customAdults + customChildren} pax / ${DEFAULT_TIME_LIMIT_MINUTES}-min timer started`
          : "Entry was not recorded because this phone could not save it. Try again.",
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
          ? `${familyLabel(liveFamily)} OUT / ${familyPax(liveFamily)} spaces freed`
          : "OUT was not recorded because this phone could not save it. Try again.",
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
          ? `${familyLabel(family)} updated / ${adults + children} pax / ${timeLimitMinutes} min`
          : "Changes were not recorded because this phone could not save them.",
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
      const next = restoreLocalFamily(current, undo.id, Date.now());
      const saved = commitState(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? "Last OUT action undone"
          : "Undo was not recorded because this phone could not save it.",
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
          ? `${familyLabel(family)} restored / original IN ${formatClock(
              family.enteredAt,
            )} / ${currentPax(next)} inside`
          : "Restore was not recorded because this phone could not save it.",
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
          ? `${familyLabel(family)} OUT record permanently deleted from this phone`
          : "The record could not be deleted from phone storage. Try again.",
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
          ? "All Recently OUT records permanently deleted from this phone"
          : "The records could not be deleted from phone storage. Try again.",
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

  if (authState === "locked") {
    return (
      <main className="guest-screen">
        <section className="guest-card" aria-labelledby="guest-title">
          <div className="brand-mark">PP</div>
          <span className="guest-kicker">STAFF GUEST ACCESS</span>
          <h1 id="guest-title">PLAY POT</h1>
          <p>Enter the staff PIN to open Play Pot on this phone.</p>
          <p id="guest-pin-hint" className="guest-pin-hint">
            PIN <strong>000000</strong>
          </p>

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
              {pending === "unlock" ? "ENTERING..." : "ENTER"}
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
        <h1>CHECK THIS PHONE</h1>
        <p>The saved record cannot be read safely.</p>
        <button
          type="button"
          onClick={(event) => {
            confirmationReturnFocusRef.current = event.currentTarget;
            confirmationHandledRef.current = false;
            setConfirmStartFresh(true);
          }}
        >
          START FRESH ON THIS PHONE
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
              <h2 id="confirm-start-fresh-title">START FRESH ON THIS PHONE?</h2>
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
                  NO
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
                  YES, START FRESH
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


  const openOut = (family: Family, trigger: HTMLButtonElement) => {
    confirmationReturnFocusRef.current = trigger;
    confirmationHandledRef.current = false;
    setOutCandidate(family);
  };
  const editFor =
    (family: Family): EditHandler =>
    (adults, children, nextVisual, timeLimitMinutes, trigger) =>
      requestEdit(family, adults, children, nextVisual, timeLimitMinutes, trigger);
  const byDue = [...activeFamilies].sort(
    (left, right) =>
      Date.parse(familyDueAt(left)) - Date.parse(familyDueAt(right)) ||
      left.familyNumber - right.familyNumber,
  );
  const overdueCount = activeFamilies.filter((family) => timerState(family, now).overdue).length;
  const headroom =
    paxInside < CAPACITY
      ? { value: slotsLeftToFifteen, label: "SPACES LEFT" }
      : paxInside < FLEX_CAPACITY
        ? { value: FLEX_CAPACITY - paxInside, label: `OVER ${CAPACITY} · LEFT TO ${FLEX_CAPACITY}` }
        : { value: 0, label: `FULL · MAX ${FLEX_CAPACITY}` };
  const compactHeader = (
    <header className="ph">
      <div className={`ph-count ${paxInside >= CAPACITY ? "is-full" : ""}`}>
        <strong>{paxInside}</strong>
        <span>/ {CAPACITY} INSIDE</span>
      </div>
      <div className="ph-left">
        <strong>{headroom.value}</strong>
        <span>{headroom.label}</span>
      </div>
      {unsaved ? (
        <div className="storage-alert" role="alert">
          PHONE STORAGE ERROR / LAST ACTION NOT RECORDED
        </div>
      ) : null}
    </header>
  );
  const enterButton = (
    <button
              type="button"
              className={`commit-family-button ${
                !fits ? "commit-overflow" : ""
              } ${entryLocked && entryRecorded ? "commit-recorded" : ""}`}
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
                  ? "RECORDED ✓"
                  : "PLEASE WAIT..."
                : fits || canFlex
                  ? `ENTER: ${selectedPax} PAX`
                  : paxInside >= FLEX_CAPACITY
                    ? `MAX ${FLEX_CAPACITY} / STOP ENTRY`
                    : `CANNOT ENTER / MAX ${FLEX_CAPACITY}`}
            </button>
  );
  const visualInput = (
    <input
      id="visual-input"
      className="text-input visual-input"
      value={visual}
      maxLength={60}
      onChange={(event) => setVisual(event.target.value)}
      placeholder="Visual (optional), e.g. red stroller"
      aria-label="Visual identifier, clothing or items only"
      autoComplete="off"
    />
  );
  const dockSteppers = (
    <div className="pdock-steppers">
      <DockStepper
        label="Adults"
        units={["ADULT", "ADULTS"]}
        value={customAdults}
        max={FLEX_CAPACITY - customChildren}
        onChange={setCustomAdults}
      />
      <DockStepper
        label="Children"
        units={["CHILD", "CHILDREN"]}
        value={customChildren}
        max={FLEX_CAPACITY - customAdults}
        onChange={setCustomChildren}
      />
    </div>
  );
  const recentBlock = (
    <>
      {recentlyOut.length ? (
            <section
              className="recent-out-section"
              aria-label="Recently OUT families"
            >
              <details>
                <summary>
                  <span>
                    <strong>Recently OUT</strong>
                    <em>{recentlyOut.length}</em>
                  </span>
                  <small>Recovery available for 15 min</small>
                </summary>
                <div className="recent-out-list">
                  {recentlyOut.map((family) => (
                    <article className="recent-out-card" key={family.id}>
                      <div className="recent-out-main">
                        <div>
                          <strong>{familyLabel(family)}</strong>
                          <span>
                            {family.adults}A {family.children}C /{" "}
                            {familyPax(family)} PAX
                          </span>
                        </div>
                        <p>{family.visual || "No visual recorded"}</p>
                      </div>
                      <div className="recent-out-times">
                        <span>IN {formatClock(family.enteredAt)}</span>
                        <span>OUT {formatClock(family.departedAt)}</span>
                      </div>
                      <div className="recent-out-actions">
                        <button
                          type="button"
                          className="restore-button"
                          aria-label={`Restore ${familyLabel(family)}`}
                          disabled={busy}
                          onClick={(event) => {
                            confirmationReturnFocusRef.current =
                              event.currentTarget;
                            confirmationHandledRef.current = false;
                            setRestoreCandidate(family);
                          }}
                        >
                          RESTORE
                        </button>
                        <button
                          type="button"
                          className="delete-recent-button"
                          aria-label={`Delete ${familyLabel(family)} OUT record`}
                          disabled={busy}
                          onClick={(event) => {
                            confirmationReturnFocusRef.current =
                              event.currentTarget;
                            confirmationHandledRef.current = false;
                            setDeleteCandidate(family);
                          }}
                        >
                          DELETE
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
                  DELETE ALL ENTRIES
                </button>
              </details>
            </section>
          ) : null}
    </>
  );
  const emptyState = (
    <div className="empty-state">
      <strong>AREA CLEAR</strong>
      <span>Ready for the next family.</span>
    </div>
  );
  const editSheetFamily = editSheetId
    ? activeFamilies.find((family) => family.id === editSheetId) ?? null
    : null;
  const editSheet = editSheetFamily ? (
    <EditSheet
      key={editSheetFamily.id}
      family={editSheetFamily}
      disabled={busy}
      onSave={editFor(editSheetFamily)}
      onClose={() => setEditSheetId(null)}
    />
  ) : null;

  const selectedFamily =
    activeFamilies.find((family) => family.id === selectedId) ?? nextDueFamily ?? byDue[0] ?? null;
  return (
    <main className="app-shell proto proto-c">
      {compactHeader}
      <div className="pmain">
        {recentBlock}
        {byDue.length ? (
          <div className="pc-list" role="radiogroup" aria-label="Choose the family to check out">
            {byDue.map((family) => {
              const selected = selectedFamily?.id === family.id;
              const timer = timerState(family, now);
              return (
                <article
                  key={family.id}
                  className={`cr cr-select ${timer.overdue ? "cr-due" : ""} ${selected ? "is-selected" : ""}`}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => setSelectedId(family.id)}
                >
                  {rowSummary(family, now)}
                  {selected ? (
                    <button
                      type="button"
                      className="pc-edit"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditSheetId(family.id);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          emptyState
        )}
      </div>
      <section className="pdock" aria-label="New family and check out">
        {dockSteppers}
        {visualInput}
        <div className="pc-actions">
          {enterButton}
          <button
            type="button"
            className="pc-out"
            disabled={busy || !selectedFamily}
            onClick={(event) => selectedFamily && openOut(selectedFamily, event.currentTarget)}
          >
            <strong>{selectedFamily ? `OUT ${familyLabel(selectedFamily)}` : "OUT"}</strong>
            <small>
              {selectedFamily
                ? selectedFamily.visual || `${familyPax(selectedFamily)} PAX`
                : "Nobody inside"}
            </small>
          </button>
        </div>
      </section>
      {editSheet}

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
                onClick={handleConfirmationNo}
              >
                NO
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
                YES, OUT
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
            <h2 id="confirm-flex-title">ENTER ABOVE {CAPACITY}?</h2>
            <p id="confirm-flex-copy">
              This will bring the total to {projectedPax}. Maximum {FLEX_CAPACITY}.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                NO
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
                YES, ENTER
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
                ? ` This reveals a total above ${FLEX_CAPACITY}. Stop new entry and correct the live count.`
                : restoreProjectedPax > CAPACITY
                  ? ` This puts the total above ${CAPACITY}.`
                  : ""}
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                NO
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
                YES, RESTORE
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
              DELETE {familyLabel(deleteCandidate)} RECORD?
            </h2>
            <p id="confirm-delete-copy">
              This permanently removes {familyLabel(deleteCandidate)}&apos;s OUT
              record from this phone. It will not change Inside now and cannot
              be undone.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                NO
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
                YES, DELETE
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
            <h2 id="confirm-delete-all-title">DELETE ALL RECENTLY OUT?</h2>
            <p id="confirm-delete-all-copy">
              This permanently deletes all {recentlyOut.length} Recently OUT
              {recentlyOut.length === 1 ? " record" : " records"} from this
              phone. This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                NO
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
                YES, DELETE ALL
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
            <h2 id="confirm-edit-title">SAVE COUNT CORRECTION?</h2>
            <p id="confirm-edit-copy">
              {familyLabel(editCandidate.family)} changes from {familyPax(
                editCandidate.family,
              )} to {editCandidate.adults + editCandidate.children} pax. The
              live total changes from {paxInside} to {editProjectedPax}.
              {editProjectedPax > FLEX_CAPACITY
                ? ` This records the true count, but new entry stays blocked above ${FLEX_CAPACITY}.`
                : ` This puts the total above ${CAPACITY}.`}
            </p>
            <div className="confirm-actions">
              <button
                ref={cancelConfirmationRef}
                type="button"
                className="confirm-no"
                onClick={handleConfirmationNo}
              >
                NO
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
                YES, SAVE
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
