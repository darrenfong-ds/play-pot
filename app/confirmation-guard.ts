// The tap that opens a confirmation can repeat onto the dialog's buttons,
// so each dialog ignores taps until it has been open this long.
export const CONFIRMATION_ARM_MILLISECONDS = 400;

export function confirmationArmed(openedAt: number, now: number) {
  return now - openedAt >= CONFIRMATION_ARM_MILLISECONDS;
}
