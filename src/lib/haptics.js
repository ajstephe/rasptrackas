// Android Chrome supports real haptic feedback via the Vibration API; iOS
// Safari doesn't implement it at all, so this is silently a no-op there —
// same "enhances Android specifically, harmless everywhere else" shape as
// the back-button and theme-color work. Kept to a short, sparing list of
// genuinely meaningful moments (a save actually committing, a destructive
// action actually confirmed) rather than sprinkled on every tap — haptics
// used everywhere stop reading as feedback and start reading as noise.
export function haptic(ms = 12) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) { /* never let a vibration failure interrupt the action it's confirming */ }
}
