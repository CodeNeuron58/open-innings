/**
 * The two app screens shown inside the phone frames on the marketing site.
 *
 * Ported from design_new/"Open Innings Screen.dc.html", whose two `<sc-if>`
 * branches (`isScore` / `isCard`) become two exported components here.
 *
 * These are pictures of the app, not the app: static markup, no state, no
 * data fetching. They live in the marketing namespace precisely so nobody
 * mistakes them for the real scorer in apps/mobile and tries to keep the two
 * in sync automatically. When the real screens change, update these by hand —
 * or better, replace them with actual screenshots.
 *
 * The frame marks itself `aria-hidden`, so nothing in here is announced.
 */

const BATTERS_LIVE = [
  { name: 'D. Nair *', r: '24', b: '18', four: '2', six: '1', sr: '133.3' },
  { name: 'K. Thomas', r: '11', b: '9', four: '1', six: '0', sr: '122.2' },
] as const;

const THIS_OVER = ['2', '1', '•', '6', '1'] as const;

const EXTRAS_KEYS = [
  { label: 'Wide', armed: false },
  { label: 'No ball', armed: true },
  { label: 'Bye', armed: false },
  { label: 'Leg bye', armed: false },
] as const;

/** 0–6 then W. 4 and 6 take accent tints, W takes the deep accent field. */
const RUN_KEYS = [
  { label: '0', tone: '' },
  { label: '1', tone: '' },
  { label: '2', tone: '' },
  { label: '3', tone: '' },
  { label: '4', tone: 'oi-key-four' },
  { label: '5', tone: '' },
  { label: '6', tone: 'oi-key-six' },
  { label: 'W', tone: 'oi-key-wicket' },
] as const;

const SCORECARD_ROWS = [
  { name: 'A. Menon', how: 'b T. Grewal', r: '14', b: '12', four: '2', six: '0', sr: '116.7' },
  {
    name: 'R. Iyer',
    how: 'c P. Kamath b P. Kamath',
    r: '19',
    b: '21',
    four: '1',
    six: '1',
    sr: '90.5',
  },
  {
    name: 'S. Prakash (c)',
    how: 'lbw b P. Kamath',
    r: '7',
    b: '11',
    four: '0',
    six: '0',
    sr: '63.6',
  },
  { name: 'V. Reddy', how: 'run out (N. Dsouza)', r: '1', b: '3', four: '0', six: '0', sr: '33.3' },
  { name: 'D. Nair', how: 'not out', r: '24', b: '18', four: '2', six: '1', sr: '133.3' },
  { name: 'K. Thomas', how: 'not out', r: '11', b: '9', four: '1', six: '0', sr: '122.2' },
] as const;

/** Shared match bar across the top of both screens. */
function MatchBar() {
  return (
    <div className="oi-scr-bar">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="oi-scr-icon"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <div className="oi-scr-bar-main">
        <div className="oi-scr-teams">
          KOR <span className="oi-scr-v">v</span> WHF
        </div>
        <div className="lbl oi-scr-meta">
          T20 &nbsp;·&nbsp; 2nd innings &nbsp;·&nbsp; Bengaluru Div 3
        </div>
      </div>
      <div className="oi-scr-live">
        <span className="oi-scr-dot" />
        <span className="lbl oi-scr-live-label">Live &nbsp;24</span>
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="oi-scr-icon"
      >
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </div>
  );
}

/** The scoring console — the screen the scorer holds for three hours. */
export function ScoreScreen() {
  return (
    <div className="oi-scr">
      <MatchBar />
      <div className="oi-scr-body">
        {/* Score plate — the one reversed field on the screen */}
        <div className="oi-scr-plate">
          <div className="oi-scr-plate-top">
            <div className="num oi-scr-score">78-4</div>
            <div className="oi-scr-overs">
              <div className="num oi-scr-overs-val">10.5</div>
              <div className="lbl oi-scr-overs-lbl">Overs</div>
            </div>
            <div className="oi-scr-target">
              <div className="lbl oi-scr-overs-lbl">Target</div>
              <div className="num oi-scr-target-val">164</div>
            </div>
          </div>
          <div className="oi-scr-rates">
            <div>
              <span className="lbl oi-scr-rate-lbl">CRR</span>{' '}
              <span className="num oi-scr-rate">7.20</span>
            </div>
            <div>
              <span className="lbl oi-scr-rate-lbl">RRR</span>{' '}
              <span className="num oi-scr-rate">9.38</span>
            </div>
            <div className="oi-scr-need">
              <span className="num oi-scr-rate">Need 86 off 55</span>
            </div>
          </div>
        </div>

        {/* Batters at the crease */}
        <div className="oi-scr-bat">
          <div className="lbl oi-scr-bat-head">
            <span>Batting</span>
            <span>R</span>
            <span>B</span>
            <span>4s</span>
            <span>6s</span>
            <span>SR</span>
          </div>
          {BATTERS_LIVE.map((batter) => (
            <div className="oi-scr-bat-row" key={batter.name}>
              <span>{batter.name}</span>
              <span className="num oi-scr-bat-r">{batter.r}</span>
              <span className="num oi-scr-dim">{batter.b}</span>
              <span className="num oi-scr-dim">{batter.four}</span>
              <span className="num oi-scr-dim">{batter.six}</span>
              <span className="num oi-scr-dim oi-scr-sr">{batter.sr}</span>
            </div>
          ))}
        </div>

        <div className="oi-scr-bowl">
          <span className="lbl oi-scr-bowl-lbl">Bowling</span>
          <span className="oi-scr-bowl-name">H. Bose</span>
          <span className="num oi-scr-bowl-fig">2.5–0–22–1</span>
          <span className="num oi-scr-dim oi-scr-sr">7.8</span>
        </div>

        <div className="oi-scr-over">
          <div className="oi-scr-over-head">
            <span className="lbl oi-scr-over-lbl">This over</span>
            <span className="num oi-scr-over-total">10 runs this over</span>
          </div>
          <div className="oi-scr-over-balls">
            {THIS_OVER.map((ball, i) => (
              <span className="num oi-scr-ball" key={i}>
                {ball}
              </span>
            ))}
            {/* The ball not yet bowled — drawn, not filled */}
            <span className="oi-scr-ball-empty" />
          </div>
        </div>

        {/* The console. Extras are modifiers above the run keypad, not a
            second keypad — "No ball" is shown armed. */}
        <div className="oi-scr-console">
          <div className="blueprint oi-scr-pad">
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            <div className="oi-scr-extras">
              {EXTRAS_KEYS.map((key) => (
                <div
                  className={key.armed ? 'oi-scr-extra oi-scr-extra-on' : 'oi-scr-extra'}
                  key={key.label}
                >
                  {key.label}
                </div>
              ))}
            </div>
            <div className="oi-scr-keys">
              {RUN_KEYS.map((key) => (
                <div className={`num oi-scr-key ${key.tone}`} key={key.label}>
                  {key.label}
                </div>
              ))}
            </div>
            <div className="oi-scr-undo-row">
              <div className="oi-scr-undo">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h11a5 5 0 010 10h-4" />
                </svg>
                Undo
              </div>
              <div className="num oi-scr-last">Last: 1</div>
              <span className="lbl oi-scr-armed">No ball armed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The scorecard — what everyone else opens from the shared link. */
export function ScorecardScreen() {
  return (
    <div className="oi-scr">
      <MatchBar />
      <div className="oi-card-scr">
        <div className="oi-card-scr-head">
          <h4 className="oi-card-scr-team">KORAMANGALA XI</h4>
          <span className="num oi-card-scr-score">78-4</span>
          <span className="num oi-card-scr-overs">(10.5)</span>
        </div>
        <div className="lbl oi-card-scr-chase">Chasing 164 &nbsp;·&nbsp; Need 86 off 55</div>

        <div className="oi-card-scr-tabs">
          <div className="oi-card-scr-tab oi-card-scr-tab-on">Scorecard</div>
          <div className="oi-card-scr-tab">Over by over</div>
        </div>

        <table className="oi-card-scr-table table">
          <thead>
            <tr>
              <th>Batter</th>
              <th>R</th>
              <th>B</th>
              <th>4s</th>
              <th>6s</th>
              <th>SR</th>
            </tr>
          </thead>
          <tbody>
            {SCORECARD_ROWS.map((row) => (
              <tr key={row.name}>
                <td>
                  <div className="oi-card-scr-name">{row.name}</div>
                  <div className="oi-card-scr-how">{row.how}</div>
                </td>
                <td className="num oi-card-scr-r">{row.r}</td>
                <td className="num oi-card-scr-dim">{row.b}</td>
                <td className="num oi-card-scr-dim">{row.four}</td>
                <td className="num oi-card-scr-dim">{row.six}</td>
                <td className="num oi-card-scr-dim oi-card-scr-sr">{row.sr}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="oi-card-scr-extras">
          <span className="lbl oi-card-scr-extras-lbl">Extras</span>{' '}
          <span className="num">5&nbsp; (wd 1, nb 1, b 0, lb 1)</span>
        </div>

        <div className="lbl oi-card-scr-fow-lbl">Fall of wickets</div>
        <div className="oi-card-scr-fow">
          1–8 (A. Menon, 1.5) &nbsp;·&nbsp; 2–33 (R. Iyer, 4.6) &nbsp;·&nbsp; 3–56 (S. Prakash, 8.2)
          &nbsp;·&nbsp; 4–68 (V. Reddy, 10.6)
        </div>
      </div>
    </div>
  );
}
