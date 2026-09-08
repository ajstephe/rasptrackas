// Native-style tooltip for icon-only controls — dark rounded label, small
// arrow, and a deliberate hover-intent delay before it appears (matching
// real macOS tooltip timing) so it doesn't flash in on every incidental
// mouse pass. Pure CSS (see .tt-wrap/.tt in App.jsx's shared style block):
// @media (hover:hover) means touch never gets a stuck tooltip, and the
// show-delay lives on the :hover rule's transition-delay rather than a
// timer, so leaving early always hides it immediately.
export function Tooltip({ label, children }) {
  return (
    <span className="tt-wrap">
      {children}
      <span className="tt" role="tooltip">{label}</span>
    </span>
  );
}
