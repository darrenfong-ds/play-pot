// Every displayed time and date uses Singapore time, whatever the phone's zone.
const SINGAPORE_TIME_ZONE = "Asia/Singapore";

const clockParts = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: SINGAPORE_TIME_ZONE,
});

const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: SINGAPORE_TIME_ZONE,
});

const shortDateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: SINGAPORE_TIME_ZONE,
});

// Builds "5:10 PM" from parts so ICU spacing and am/pm casing cannot drift.
export function formatClock(value: string | null) {
  if (!value) return "-";
  const parts = clockParts.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} ${part("dayPeriod").toUpperCase()}`;
}

export function singaporeDateKey(value: string | number) {
  return dateKeyFormat.format(new Date(value));
}

export function formatShortDate(value: string) {
  return shortDateFormat.format(new Date(value));
}

// Past an hour, whole hours are easier to read than "+1545 MIN OVER".
export function formatMinutesOver(minutesOver: number) {
  return minutesOver > 60
    ? `+${Math.floor(minutesOver / 60)} HR OVER`
    : `+${minutesOver} MIN OVER`;
}

// Display-only check. It never changes, removes, or checks out a family.
export function isFromEarlierDay(enteredAt: string, now: number) {
  return singaporeDateKey(enteredAt) < singaporeDateKey(now);
}
