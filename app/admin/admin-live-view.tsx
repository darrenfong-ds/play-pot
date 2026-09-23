"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminLiveDevice, LiveFamilyRecord } from "../live-view-core";
import { formatClock } from "../time-format";

type AdminAuthState = "checking" | "locked" | "ready";

function timeSince(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1_000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

function timerLabel(family: LiveFamilyRecord, now: number) {
  const dueAt =
    Date.parse(family.enteredAt) + family.timeLimitMinutes * 60_000;
  const remaining = dueAt - now;
  if (remaining <= 0) {
    return `${Math.max(1, Math.ceil(Math.abs(remaining) / 60_000))} MIN OVER`;
  }
  return `${Math.max(1, Math.ceil(remaining / 60_000))} MIN LEFT`;
}

function familyPax(family: LiveFamilyRecord) {
  return family.adults + family.children;
}

function DeviceCard({ device, now }: { device: AdminLiveDevice; now: number }) {
  const paxInside = device.insideFamilies.reduce(
    (total, family) => total + familyPax(family),
    0,
  );
  return (
    <article className={`admin-device-card ${device.active ? "is-active" : ""}`}>
      <div className="admin-device-heading">
        <div>
          <span className="admin-device-label">{device.deviceLabel}</span>
          <strong>{device.active ? "ACTIVE NOW" : "RECENTLY ACTIVE"}</strong>
        </div>
        <span>{timeSince(device.updatedAt, now)}</span>
      </div>

      <div className="admin-device-stats">
        <div>
          <strong>{device.entryCount}</strong>
          <span>{device.entryCount === 1 ? "ENTRY" : "ENTRIES"}</span>
        </div>
        <div>
          <strong>{paxInside}</strong>
          <span>PAX INSIDE</span>
        </div>
        <div>
          <strong>{device.insideFamilies.length}</strong>
          <span>{device.insideFamilies.length === 1 ? "FAMILY" : "FAMILIES"}</span>
        </div>
      </div>

      {device.insideFamilies.length ? (
        <div className="admin-family-list">
          {device.insideFamilies.map((family) => (
            <div className="admin-family-row" key={family.id}>
              <div className="admin-family-main">
                <strong>
                  #{family.familyNumber} | {familyPax(family)} PAX
                </strong>
                <span>
                  {family.adults} {family.adults === 1 ? "ADULT" : "ADULTS"}, {" "}
                  {family.children} {family.children === 1 ? "CHILD" : "CHILDREN"}
                </span>
              </div>
              <div className="admin-family-timing">
                <strong>{timerLabel(family, now)}</strong>
                <span>
                  IN {formatClock(family.enteredAt)} | DUE {formatClock(
                    new Date(
                      Date.parse(family.enteredAt) +
                        family.timeLimitMinutes * 60_000,
                    ).toISOString(),
                  )}
                </span>
              </div>
              <p>{family.visual || "No visual recorded"}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="admin-empty-device">No family currently inside.</p>
      )}
    </article>
  );
}

export default function AdminLiveView() {
  const [authState, setAuthState] = useState<AdminAuthState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<AdminLiveDevice[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  async function loadDevices() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/live", { cache: "no-store" });
      if (response.status === 401) {
        setAuthState("locked");
        setDevices([]);
        return;
      }
      const body = (await response.json()) as {
        devices?: AdminLiveDevice[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Live view unavailable.");
      setDevices(body.devices ?? []);
      setError("");
      setNow(Date.now());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Live view unavailable.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const body = (await response.json()) as { authenticated?: boolean };
        setAuthState(body.authenticated ? "ready" : "locked");
      } catch {
        setAuthState("locked");
      }
    };
    void check();
  }, []);

  useEffect(() => {
    if (authState !== "ready") return;
    const initialLoad = window.setTimeout(() => void loadDevices(), 0);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDevices();
    }, 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [authState]);

  const activeDevices = useMemo(
    () => devices.filter((device) => device.active),
    [devices],
  );
  const recentDevices = useMemo(
    () => devices.filter((device) => !device.active),
    [devices],
  );

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return;
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not open Live View.");
      setPassword("");
      setAuthState("ready");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Could not open Live View.",
      );
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setDevices([]);
    setAuthState("locked");
  }

  if (authState !== "ready") {
    return (
      <main className="admin-login-screen">
        <section className="admin-login-card">
          <span>PRIVATE OWNER ACCESS</span>
          <h1>PLAY POT LIVE VIEW</h1>
          {authState === "checking" ? (
            <p>Checking access...</p>
          ) : (
            <form onSubmit={(event) => void handleLogin(event)}>
              <label htmlFor="admin-password">Admin password</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {error ? <p role="alert">{error}</p> : null}
              <button type="submit" disabled={!password}>
                OPEN LIVE VIEW
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-live-shell">
      <header className="admin-live-header">
        <div>
          <span>VIEW ONLY</span>
          <h1>PLAY POT LIVE VIEW</h1>
          <p>Family controls remain only on each staff phone.</p>
        </div>
        <button type="button" onClick={() => void handleLogout()}>
          LOG OUT
        </button>
      </header>

      <section className="admin-live-summary" aria-live="polite">
        <div>
          <strong>{activeDevices.length}</strong>
          <span>{activeDevices.length === 1 ? "PHONE ACTIVE" : "PHONES ACTIVE"}</span>
        </div>
        <button type="button" disabled={refreshing} onClick={() => void loadDevices()}>
          {refreshing ? "REFRESHING..." : "REFRESH"}
        </button>
      </section>

      {error ? <p className="admin-live-error" role="alert">{error}</p> : null}

      <section className="admin-live-section" aria-labelledby="active-devices-title">
        <div className="admin-section-heading">
          <h2 id="active-devices-title">Active now</h2>
          <span>{activeDevices.length}</span>
        </div>
        {activeDevices.length ? (
          <div className="admin-device-list">
            {activeDevices.map((device) => (
              <DeviceCard device={device} now={now} key={device.deviceId} />
            ))}
          </div>
        ) : (
          <div className="admin-zero-state">
            <strong>NO ACTIVE PHONES</strong>
            <span>A phone appears here while Play Pot is open and visible.</span>
          </div>
        )}
      </section>

      {recentDevices.length ? (
        <section className="admin-live-section" aria-labelledby="recent-devices-title">
          <div className="admin-section-heading">
            <h2 id="recent-devices-title">Recently active</h2>
            <span>{recentDevices.length}</span>
          </div>
          <div className="admin-device-list">
            {recentDevices.map((device) => (
              <DeviceCard device={device} now={now} key={device.deviceId} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="admin-retention-note">
        Anonymous live records expire after 12 hours of inactivity. Completed
        family details are not kept in this dashboard.
      </p>
    </main>
  );
}
