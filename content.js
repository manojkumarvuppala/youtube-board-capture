const { jsPDF } = window.jspdf;
let snapshots = [];
let captureInterval = null;
let isScanning = false;
let scanTime = 0;
const SCAN_STEP = 3; 

const diffCanvas = document.createElement('canvas');
diffCanvas.width = 64;
diffCanvas.height = 36;
const diffCtx = diffCanvas.getContext('2d', { willReadFrequently: true });
const fullCanvas = document.createElement('canvas');

let previousPixels = null;
let frameBuffer = []; 

// NEW: Tuned for a 3-minute minimum between full boards
let lastCaptureTime = -999; 
const MIN_TIME_BETWEEN_CAPTURES = 180; 

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function takeSnapshot(video) {
  fullCanvas.width = video.videoWidth;
  fullCanvas.height = video.videoHeight;
  fullCanvas.getContext('2d').drawImage(video, 0, 0);
  return fullCanvas.toDataURL('image/jpeg', 0.8);
}

function getBoardClearScore(pixels) {
  const colorBuckets = {};
  let maxBucketSize = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.floor(pixels[i] / 32);
    const g = Math.floor(pixels[i+1] / 32);
    const b = Math.floor(pixels[i+2] / 32);
    const key = `${r},${g},${b}`;
    
    colorBuckets[key] = (colorBuckets[key] || 0) + 1;
    if (colorBuckets[key] > maxBucketSize) {
      maxBucketSize = colorBuckets[key];
    }
  }
  return maxBucketSize;
}

function processFrame(video) {
  diffCtx.drawImage(video, 0, 0, 64, 36);
  const currentPixels = diffCtx.getImageData(0, 0, 64, 36).data;

  if (previousPixels) {
    let diffCount = 0;
    for (let i = 0; i < currentPixels.length; i += 4) {
      const rDiff = Math.abs(currentPixels[i] - previousPixels[i]);
      const gDiff = Math.abs(currentPixels[i+1] - previousPixels[i+1]);
      const bDiff = Math.abs(currentPixels[i+2] - previousPixels[i+2]);
      if (rDiff + gDiff + bDiff > 60) diffCount++;
    }
    
    const diffPercent = diffCount / (64 * 36);

    // INCREASED to 0.20 to ignore teacher walk-bys
    if (diffPercent > 0.20) { 
      if (frameBuffer.length > 0 && (video.currentTime - lastCaptureTime > MIN_TIME_BETWEEN_CAPTURES)) {
        
        let bestFrame = frameBuffer[0];
        for(let f of frameBuffer) {
            if(f.score > bestFrame.score) bestFrame = f;
        }
        
        snapshots.push({ img: bestFrame.img, time: bestFrame.time });
        console.log("Captured full board at", formatTime(bestFrame.time));
        lastCaptureTime = video.currentTime;
      }
      frameBuffer = []; 
      
    } else if (diffPercent < 0.05) { 
      frameBuffer.push({
         img: takeSnapshot(video),
         time: video.currentTime,
         score: getBoardClearScore(currentPixels)
      });
      
      // NEW: Keeps exactly the last 60 seconds of video history to find the clearest shot
      frameBuffer = frameBuffer.filter(f => video.currentTime - f.time <= 60);
    }
  }
  previousPixels = currentPixels;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const video = document.querySelector('video');
  if (!video) return alert("No video found on this page.");
  
  if (request.action === 'start') {
    if (!captureInterval) {
        captureInterval = setInterval(() => {
          if (!video.paused) processFrame(video);
        }, 1000);
    }
  } 
  else if (request.action === 'stop') {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  else if (request.action === 'scan') {
    if (isScanning) return;
    isScanning = true;
    scanTime = 0;
    previousPixels = null;
    frameBuffer = [];
    lastCaptureTime = -999; 
    
    video.pause(); 
    
    video.addEventListener('seeked', function scanLoop() {
      if (!isScanning) {
         video.removeEventListener('seeked', scanLoop);
         return;
      }
      
      processFrame(video);
      scanTime += SCAN_STEP;
      
      if (scanTime <= video.duration) {
        video.currentTime = scanTime; 
      } else {
        isScanning = false;
        
        if (frameBuffer.length > 0 && (video.currentTime - lastCaptureTime > MIN_TIME_BETWEEN_CAPTURES)) {
            let bestFrame = frameBuffer[0];
            for(let f of frameBuffer) {
                if(f.score > bestFrame.score) bestFrame = f;
            }
            snapshots.push({ img: bestFrame.img, time: bestFrame.time });
        }
        
        video.removeEventListener('seeked', scanLoop);
        alert("Fast Scan Complete! Click OK, then open the extension to Download PDF.");
      }
    });

    video.currentTime = 0; 
  }
  else if (request.action === 'manual') {
    // Popup alert removed. Silent background capture instead.
    snapshots.push({ img: takeSnapshot(video), time: video.currentTime });
  } 
  else if (request.action === 'download') {
    if (snapshots.length === 0) return alert("No snapshots taken yet!");
    const doc = new jsPDF({ orientation: "landscape" });
    snapshots.forEach((snap, index) => {
      if (index > 0) doc.addPage();
      doc.addImage(snap.img, 'JPEG', 10, 10, 277, 156);
      doc.text(`Timestamp: ${formatTime(snap.time)}`, 10, 175);
    });
    doc.save("lecture-notes.pdf");
    snapshots = []; 
  }
});