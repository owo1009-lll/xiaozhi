/**
 * Generates inline SVG strings for music notation questions.
 * Coordinate system: viewBox="0 0 260 130"
 *   Staff lines at y = 90 (line1/E4), 80 (line2/G4), 70 (line3/B4), 60 (line4/D5), 50 (line5/F5)
 *   Step = 5px per adjacent note position (half a staff space)
 */

const BASE_Y = 90;    // y of line 1 (bottom staff line)
const STEP = 5;       // px per note step
const X1 = 40;        // staff left edge
const X2 = 220;       // staff right edge
const STAFF_YS = [90, 80, 70, 60, 50]; // line 1 to line 5 (bottom to top)

// Step index from bottom line for each note name
const TREBLE_STEPS = {
  C4: -2, D4: -1,
  E4: 0, F4: 1, G4: 2, A4: 3, B4: 4,
  C5: 5, D5: 6, E5: 7, F5: 8,
  G5: 9, A5: 10,
};

const BASS_STEPS = {
  E2: -2, F2: -1,
  G2: 0, A2: 1, B2: 2, C3: 3, D3: 4,
  E3: 5, F3: 6, G3: 7, A3: 8,
  B3: 9, C4: 10,
};

function noteY(stepIndex) {
  return BASE_Y - stepIndex * STEP;
}

function staffLines() {
  return STAFF_YS.map(
    (y) => `<line x1="${X1}" y1="${y}" x2="${X2}" y2="${y}" stroke="#111" stroke-width="1.5"/>`,
  ).join("\n  ");
}

function ledgerLines(cx, stepIndex) {
  const lines = [];
  if (stepIndex <= -2) {
    for (let s = -2; s >= stepIndex; s -= 2) {
      const ly = BASE_Y - s * STEP;
      lines.push(
        `<line x1="${cx - 14}" y1="${ly}" x2="${cx + 14}" y2="${ly}" stroke="#111" stroke-width="1.5"/>`,
      );
    }
  }
  if (stepIndex >= 10) {
    for (let s = 10; s <= stepIndex; s += 2) {
      const ly = BASE_Y - s * STEP;
      lines.push(
        `<line x1="${cx - 14}" y1="${ly}" x2="${cx + 14}" y2="${ly}" stroke="#111" stroke-width="1.5"/>`,
      );
    }
  }
  return lines.join("\n  ");
}

function noteHead(cx, cy) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="8" ry="5.5" fill="#111" transform="rotate(-15 ${cx} ${cy})"/>`;
}

function noteStem(cx, cy, stepIndex) {
  // Below middle line (B4 = step 4 = y70) → stem up
  const up = stepIndex < 4;
  const sx = up ? cx + 7 : cx - 7;
  const sy2 = up ? cy - 30 : cy + 30;
  return `<line x1="${sx}" y1="${cy}" x2="${sx}" y2="${sy2}" stroke="#111" stroke-width="1.5"/>`;
}

function trebleClef() {
  // Position so spiral wraps around line 2 (G4) at y=80
  return `<text x="41" y="74" font-size="36" font-family="Times New Roman,Georgia,serif" fill="#111">𝄞</text>`;
}

function bassClef() {
  // Bass clef: reference F3 at line 4 (y=60), position character accordingly
  return `<text x="41" y="67" font-size="30" font-family="Times New Roman,Georgia,serif" fill="#111">𝄢</text>`;
}

function buildSVG(inner, height = 130) {
  return `<svg viewBox="0 0 260 ${height}" style="width:100%;max-width:260px;display:block;margin:0 auto 8px">${inner}</svg>`;
}

/**
 * Generates SVG of a single note on the staff.
 * noteName: e.g. "G4", "C4", "F#4"
 * clef: "treble" | "bass"
 */
export function generateNoteOnStaff(noteName, clef = "treble") {
  const steps = clef === "treble" ? TREBLE_STEPS : BASS_STEPS;
  const baseName = noteName.replace(/[#b♭♯]/g, "");
  const step = steps[baseName];
  if (step === undefined) return "";

  const cx = 155;
  const cy = noteY(step);

  let accidental = "";
  if (noteName.includes("#") || noteName.includes("♯")) {
    accidental = `<text x="${cx - 19}" y="${cy + 5}" font-size="15" font-family="serif" fill="#111">#</text>`;
  } else if ((noteName.includes("b") && noteName.length > 2) || noteName.includes("♭")) {
    accidental = `<text x="${cx - 17}" y="${cy + 6}" font-size="16" font-family="serif" fill="#111">♭</text>`;
  }

  const clefSvg = clef === "treble" ? trebleClef() : bassClef();

  const inner = `
  ${staffLines()}
  ${ledgerLines(cx, step)}
  ${clefSvg}
  ${accidental}
  ${noteHead(cx, cy)}
  ${noteStem(cx, cy, step)}`;

  return buildSVG(inner);
}

/**
 * Generates SVG showing two notes on the treble staff to represent an interval.
 * note1, note2: note names (lower note first)
 */
export function generateIntervalOnStaff(note1, note2, clef = "treble") {
  const steps = clef === "treble" ? TREBLE_STEPS : BASS_STEPS;
  const step1 = steps[note1.replace(/[#b♭♯]/g, "")];
  const step2 = steps[note2.replace(/[#b♭♯]/g, "")];
  if (step1 === undefined || step2 === undefined) return "";

  const cx1 = 130;
  const cx2 = 175;
  const cy1 = noteY(step1);
  const cy2 = noteY(step2);

  // Bracket above both notes
  const bracketY = Math.min(cy1, cy2) - 14;
  const bracket = [
    `<line x1="${cx1}" y1="${bracketY}" x2="${cx2}" y2="${bracketY}" stroke="#534AB7" stroke-width="1.5" stroke-dasharray="3,2"/>`,
    `<line x1="${cx1}" y1="${bracketY}" x2="${cx1}" y2="${bracketY + 6}" stroke="#534AB7" stroke-width="1.5"/>`,
    `<line x1="${cx2}" y1="${bracketY}" x2="${cx2}" y2="${bracketY + 6}" stroke="#534AB7" stroke-width="1.5"/>`,
  ].join("\n  ");

  const clefSvg = clef === "treble" ? trebleClef() : bassClef();

  const allLedgers = [
    ledgerLines(cx1, step1),
    ledgerLines(cx2, step2),
  ].filter(Boolean).join("\n  ");

  const inner = `
  ${staffLines()}
  ${allLedgers}
  ${clefSvg}
  ${bracket}
  ${noteHead(cx1, cy1)}
  ${noteStem(cx1, cy1, step1)}
  ${noteHead(cx2, cy2)}
  ${noteStem(cx2, cy2, step2)}`;

  return buildSVG(inner);
}
