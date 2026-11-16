/* global __BUILD_TIME__ */
// When this copy of the app was built, so you can tell whether a device has
// picked up the latest update.
const built = typeof __BUILD_TIME__ !== 'undefined' ? new Date(__BUILD_TIME__) : null;
const label = built ? built.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'development';

export function VersionLine() {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: '11px', fontWeight: 700, color: 'var(--quiet)' }}>
      Version {label}
    </div>
  );
}
