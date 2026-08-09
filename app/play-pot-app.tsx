"use client";

import { useEffect, useRef, useState } from "react";
import {
  addLocalFamily,
  CAPACITY,
  createInitialState,
  currentPax,
  DEFAULT_TIME_LIMIT_MINUTES,
  deleteRecentLocalFamily,
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
  createOfflineAccess,
  OFFLINE_ACCESS_KEY,
  readOfflineAccess,
} from "./offline-access";

type UndoAction = {
  id: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
  undo?: UndoAction;
};

type AuthState = "checking" | "locked" | "ready";

type Theme = "light" | "dark";

type EditCandidate = {
  family: Family;
  adults: number;
  children: number;
  visual: string;
  timeLimitMinutes: number;
};

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

const ENTRY_LOCK_MILLISECONDS = 700;
const GUEST_CHECK_TIMEOUT_MILLISECONDS = 7_000;
const THEME_STORAGE_KEY = "play-pot.theme.v1";

function formatClock(value: string | null) {
  return value ? sgTime.format(new Date(value)) : "-";
}

function familyLabel(family: Family) {
  return `F${family.familyNumber}`;
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      onClick={onToggle}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-orb" />
      </span>
      <span>{dark ? "LIGHT" : "DARK"}</span>
    </button>
  );
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
  paxInside,
  onSave,
  disabled,
}: {
  family: Family;
  paxInside: number;
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
  const projectedPax =
    paxInside - familyPax(family) + adults + children;
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
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label={`Edit ${familyLabel(family)}`}>Edit</summary>
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
        <div className="quick-time-actions" aria-label="Quick time adjustments">
          <button
            type="button"
            disabled={timeLimitMinutes <= 1}
            onClick={() =>
              setTimeLimitMinutes((minutes) => Math.max(1, minutes - 5))
            }
          >
            -5 MIN
          </button>
          <button
            type="button"
            disabled={timeLimitMinutes === DEFAULT_TIME_LIMIT_MINUTES}
            onClick={() => setTimeLimitMinutes(DEFAULT_TIME_LIMIT_MINUTES)}
          >
            RESET 15
          </button>
          <button
            type="button"
            disabled={timeLimitMinutes >= MAX_TIME_LIMIT_MINUTES}
            onClick={() =>
              setTimeLimitMinutes((minutes) =>
                Math.min(MAX_TIME_LIMIT_MINUTES, minutes + 5),
              )
            }
          >
            +5 MIN
          </button>
        </div>
        <div
          className={`edit-projection ${
            projectedPax > FLEX_CAPACITY
              ? "edit-projection-critical"
              : projectedPax > CAPACITY
                ? "edit-projection-flex"
                : ""
          }`}
        >
          <span>LIVE TOTAL AFTER SAVE</span>
          <strong>
            {paxInside} → {projectedPax}
          </strong>
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
  paxInside,
  disabled,
  onOut,
  onEdit,
}: {
  family: Family;
  now: number;
  paxInside: number;
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
          paxInside={paxInside}
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
  const [isOffline, setIsOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [theme, setTheme] = useState<Theme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [customAdults, setCustomAdults] = useState(1);
  const [customChildren, setCustomChildren] = useState(1);
  const [visual, setVisual] = useState("");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [outCandidate, setOutCandidate] = useState<Family | null>(null);
  const [confirmFlex, setConfirmFlex] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<Family | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Family | null>(null);
  const [editCandidate, setEditCandidate] = useState<EditCandidate | null>(null);
  const [entryLocked, setEntryLocked] = useState(false);
  const [entryRecorded, setEntryRecorded] = useState(false);
  const entryLockRef = useRef(false);
  const entryUnlockTimerRef = useRef<number | null>(null);
  const offlineAccessPreparingRef = useRef<number | null>(null);
  const offlineAccessGenerationRef = useRef(0);
  const guestCheckGenerationRef = useRef(0);
  const cancelConfirmationRef = useRef<HTMLButtonElement | null>(null);
  const confirmationDialogRef = useRef<HTMLElement | null>(null);
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

  function handleThemeToggle() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  function clearOfflineAccess() {
    offlineAccessGenerationRef.current += 1;
    try {
      window.localStorage.removeItem(OFFLINE_ACCESS_KEY);
    } catch {
      // Access is already unavailable if this browser cannot update local storage.
    }
  }

  function hasValidOfflineAccess() {
    try {
      return Boolean(
        readOfflineAccess(
          window.localStorage.getItem(OFFLINE_ACCESS_KEY),
          Date.now(),
        ),
      );
    } catch {
      return false;
    }
  }

  function queryOfflineWorker(worker: ServiceWorker) {
    return new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve(ready);
      };
      const timeout = window.setTimeout(() => finish(false), 600);
      channel.port1.onmessage = (event: MessageEvent) => {
        finish(
          event.data?.type === "PLAY_POT_OFFLINE_STATUS" &&
            event.data?.ready === true,
        );
      };
      try {
        worker.postMessage(
          { type: "PLAY_POT_OFFLINE_STATUS" },
          [channel.port2],
        );
      } catch {
        finish(false);
      }
    });
  }

  async function offlineShellIsReady() {
    const deadline = Date.now() + 8_000;
    do {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const candidates = [registration.waiting, registration.active].filter(
          (worker, index, workers): worker is ServiceWorker =>
            Boolean(worker) && workers.indexOf(worker) === index,
        );
        const readiness = await Promise.all(
          candidates.map((worker) => queryOfflineWorker(worker)),
        );
        if (readiness.some(Boolean)) return true;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    return false;
  }

  function rememberOfflineAccessWhenReady(verifiedAt: number) {
    const generation = offlineAccessGenerationRef.current;
    if (
      !("serviceWorker" in navigator) ||
      offlineAccessPreparingRef.current === generation
    ) {
      return;
    }
    offlineAccessPreparingRef.current = generation;
    void (async () => {
      try {
        await navigator.serviceWorker.ready;
        if (!(await offlineShellIsReady())) return;
        if (generation !== offlineAccessGenerationRef.current) return;
        const access = createOfflineAccess(verifiedAt);
        const serializedAccess = JSON.stringify(access);
        if (!readOfflineAccess(serializedAccess, Date.now())) return;
        window.localStorage.setItem(
          OFFLINE_ACCESS_KEY,
          serializedAccess,
        );
      } catch {
        // Offline access is optional and visitor records remain untouched.
      } finally {
        if (offlineAccessPreparingRef.current === generation) {
          offlineAccessPreparingRef.current = null;
        }
      }
    })();
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
    const requestGeneration = guestCheckGenerationRef.current + 1;
    guestCheckGenerationRef.current = requestGeneration;
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(
      () => controller.abort(),
      GUEST_CHECK_TIMEOUT_MILLISECONDS,
    );
    setLoadError("");
    try {
      const response = await fetch("/api/guest", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (requestGeneration !== guestCheckGenerationRef.current) return;
      if (response.status === 401 || response.status === 403) {
        clearOfflineAccess();
        stateRef.current = null;
        setState(null);
        setIsOffline(false);
        setAuthState("locked");
        return;
      }
      const body = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
      };
      if (requestGeneration !== guestCheckGenerationRef.current) return;
      if (!response.ok) {
        throw new Error(body.error ?? "Play Pot is temporarily unavailable.");
      }
      if (!body.authenticated) {
        clearOfflineAccess();
        stateRef.current = null;
        setState(null);
        setIsOffline(false);
        setAuthState("locked");
        return;
      }
      const verifiedAt = Date.now();
      setIsOffline(false);
      openThisPhoneState();
      rememberOfflineAccessWhenReady(verifiedAt);
    } catch {
      if (requestGeneration !== guestCheckGenerationRef.current) return;
      if (stateRef.current || hasValidOfflineAccess()) {
        setIsOffline(true);
        setLoadError("");
        if (!stateRef.current) openThisPhoneState();
        return;
      }
      setIsOffline(true);
      setLoadError(
        "Connect once and open Play Pot online before using it offline.",
      );
    } finally {
      window.clearTimeout(requestTimeout);
    }
  }

  useEffect(() => {
    const readTheme = window.setTimeout(() => {
      try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === "dark" || savedTheme === "light") {
          setTheme(savedTheme);
        }
      } catch {
        // Light mode remains the safe fallback when preferences cannot be read.
      } finally {
        setThemeReady(true);
      }
    }, 0);
    return () => window.clearTimeout(readTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (!themeReady) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional and must never block Play Pot operations.
    }
  }, [theme, themeReady]);

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
    const markOffline = () => setIsOffline(true);
    const revalidateOnline = () => {
      void loadState();
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.update())
          .catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("storage", refreshFromThisBrowser);
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", revalidateOnline);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("storage", refreshFromThisBrowser);
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", revalidateOnline);
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
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => undefined);
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
      notice.undo
        ? UNDO_MILLISECONDS
        : notice.tone === "error"
          ? 10_000
          : 8_000,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (
      !outCandidate &&
      !confirmFlex &&
      !restoreCandidate &&
      !deleteCandidate &&
      !editCandidate
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
        setEditCandidate(null);
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
  }, [outCandidate, confirmFlex, restoreCandidate, deleteCandidate, editCandidate]);

  function cancelOpenConfirmation() {
    setOutCandidate(null);
    setConfirmFlex(false);
    setRestoreCandidate(null);
    setDeleteCandidate(null);
    setEditCandidate(null);
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
        if (response.status === 401 || response.status === 403) {
          clearOfflineAccess();
        }
        setUnlockError(body.error ?? "Could not open Play Pot.");
        return;
      }
      const verifiedAt = Date.now();
      setGuestPin("");
      rememberOfflineAccessWhenReady(verifiedAt);
      await loadState();
    } catch {
      setUnlockError(
        "Connect to the internet once to unlock offline access on this phone.",
      );
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
      const totalInside = currentPax(next);
      setNotice({
        tone: saved ? "success" : "error",
        message: saved
          ? `${added ? familyLabel(added) : "Family"} entered / ${customAdults + customChildren} pax / ${
              totalInside > CAPACITY
                ? `FLEX ${totalInside} of ${FLEX_CAPACITY}`
                : `${DEFAULT_TIME_LIMIT_MINUTES}-min timer started`
            }`
          : "Entry was not recorded because this phone could not save it. Try again.",
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
          <div className="guest-theme-row">
            <ThemeToggle theme={theme} onToggle={handleThemeToggle} />
          </div>
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
  const editProjectedPax = editCandidate
    ? paxInside -
      familyPax(editCandidate.family) +
      editCandidate.adults +
      editCandidate.children
    : paxInside;
  const nextDueFamily = nextDueLocalFamily(state);
  const nextDueTimer = nextDueFamily
    ? timerState(nextDueFamily, now)
    : null;
  const busy = Boolean(pending);

  return (
    <main className="app-shell">
      <header className="status-header">
        <div className="brand-row">
          <h1>PLAY POT</h1>
          <div className="brand-actions">
            <span className="live-label">THIS PHONE / LIVE</span>
            <ThemeToggle theme={theme} onToggle={handleThemeToggle} />
          </div>
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

        {nextDueFamily && nextDueTimer ? (
          <div
            className={`next-due ${
              nextDueTimer.overdue ? "next-due-overdue" : ""
            }`}
            role="status"
            aria-live="polite"
          >
            <span>NEXT DUE</span>
            <strong>
              {familyLabel(nextDueFamily)}
              {nextDueFamily.visual ? ` · ${nextDueFamily.visual}` : ""}
            </strong>
            <em>{nextDueTimer.label}</em>
          </div>
        ) : null}

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
            PHONE STORAGE ERROR / LAST ACTION NOT RECORDED
          </div>
        ) : null}
        {isOffline ? (
          <div className="offline-status" role="status">
            OFFLINE / SAVING ON THIS PHONE
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
                Visual <span>recommended / no names</span>
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
              className={`commit-family-button ${
                canFlex ? "commit-overflow" : ""
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
                : fits
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
              </details>
            </section>
          ) : null}

          <div className="family-list">
            {activeFamilies.length ? (
              activeFamilies.map((family) => (
                <ActiveFamilyCard
                  key={family.id}
                  family={family}
                  now={now}
                  paxInside={paxInside}
                  disabled={busy}
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
                <strong>AREA CLEAR</strong>
                <span>Ready for the next family.</span>
              </div>
            )}
          </div>
        </section>
      </div>

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
            ref={confirmationDialogRef}
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
                : ` This is ${editProjectedPax - CAPACITY} above the ${CAPACITY} target.`}
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
