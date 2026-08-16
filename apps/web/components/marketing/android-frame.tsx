/**
 * Android device chrome for the marketing screenshots.
 *
 * Ported from design_new/android-frame.jsx, which is a generic Material 3
 * scaffold the design tool ships — it carried a teal Material palette that has
 * nothing to do with Open Innings, and an app bar, list item and full Gboard
 * the landing never renders. Only the bezel, status bar and gesture pill are
 * kept, and the colours now come from the Industry tokens so the frame moves
 * with the theme instead of fighting it.
 *
 * Decorative: `aria-hidden`, because a screenshot of a phone is not content a
 * screen reader should narrate. The surrounding copy carries the meaning.
 */

const DEVICE_WIDTH = 412;
const DEVICE_HEIGHT = 892;

function StatusBar() {
  return (
    <div className="oi-device-status">
      <span className="oi-device-time">9:30</span>
      <span className="oi-device-punch" />
      <span className="oi-device-icons">
        {/* Signal, wifi, battery — drawn rather than iconography, at the size
            they appear on a real status bar. */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 13.3L.67 5.97a10.37 10.37 0 0114.66 0L8 13.3z" />
        </svg>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14.67 14.67V1.33L1.33 14.67h13.34z" />
        </svg>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3.75" y="2" width="8.5" height="13" rx="1.5" />
          <rect x="5.5" y="0.9" width="5" height="2" rx="0.5" />
        </svg>
      </span>
    </div>
  );
}

export function AndroidFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="oi-device" style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT }} aria-hidden>
      <StatusBar />
      <div className="oi-device-screen">{children}</div>
      <div className="oi-device-nav">
        <span className="oi-device-pill" />
      </div>
    </div>
  );
}
