function sendMessage(action) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action });
  });
}

document.getElementById('scanBtn').addEventListener('click', () => {
  sendMessage('scan');
  document.getElementById('status').innerText = 'Status: Fast Scanning...';
});

document.getElementById('startBtn').addEventListener('click', () => {
  sendMessage('start');
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'block';
  document.getElementById('status').innerText = 'Status: Auto-capturing...';
});

document.getElementById('stopBtn').addEventListener('click', () => {
  sendMessage('stop');
  document.getElementById('startBtn').style.display = 'block';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('status').innerText = 'Status: Paused';
});

// NEW: Visual feedback for the Manual button
document.getElementById('manualBtn').addEventListener('click', () => {
  sendMessage('manual');
  const btn = document.getElementById('manualBtn');
  const originalText = btn.innerText;
  
  btn.innerText = '✅ Saved!';
  btn.style.background = '#4CAF50'; // Turns green
  
  setTimeout(() => {
    btn.innerText = originalText;
    btn.style.background = '#2196F3'; // Reverts to blue
  }, 1500);
});

document.getElementById('downloadBtn').addEventListener('click', () => sendMessage('download'));