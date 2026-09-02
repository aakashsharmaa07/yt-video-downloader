// ==========================================================================
// VidFetch - YouTube Downloader Frontend Logic
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const btnText = fetchBtn.querySelector('.btn-text');
  const btnIcon = fetchBtn.querySelector('.btn-icon');
  const spinner = fetchBtn.querySelector('.spinner');

  const loadingCard = document.getElementById('loadingCard');
  const resultCard = document.getElementById('resultCard');
  const videoThumb = document.getElementById('videoThumb');
  const videoDuration = document.getElementById('videoDuration');
  const watchLink = document.getElementById('watchLink');
  const videoTitle = document.getElementById('videoTitle');
  const channelAvatar = document.getElementById('channelAvatar');
  const channelName = document.getElementById('channelName');
  const videoViews = document.getElementById('videoViews');

  const tabVideo = document.getElementById('tabVideo');
  const tabAudio = document.getElementById('tabAudio');
  const formatsContainer = document.getElementById('formatsContainer');
  const startDownloadBtn = document.getElementById('startDownloadBtn');
  const downloadBtnLabel = document.getElementById('downloadBtnLabel');

  const progressSection = document.getElementById('progressSection');
  const progressStatus = document.getElementById('progressStatus');
  const progressFile = document.getElementById('progressFile');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const statSpeed = document.getElementById('statSpeed');
  const statSize = document.getElementById('statSize');
  const statEta = document.getElementById('statEta');

  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const toastContainer = document.getElementById('toastContainer');

  // State
  let currentVideoData = null;
  let activeTab = 'video'; // 'video' | 'audio'
  let selectedFormat = null;
  let currentPollInterval = null;

  // Render initial history
  renderHistory();

  // URL Input Events
  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    clearBtn.style.display = val ? 'inline-flex' : 'none';
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchVideoInfo();
    }
  });

  // Paste from clipboard button
  pasteBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlInput.value = text.trim();
          clearBtn.style.display = 'inline-flex';
          showToast('URL pasted from clipboard!', 'info');
          fetchVideoInfo();
        } else {
          showToast('Clipboard is empty.', 'error');
        }
      } else {
        showToast('Clipboard access not supported by browser. Please paste manually.', 'error');
      }
    } catch (err) {
      showToast('Could not access clipboard. Please paste manually.', 'error');
    }
  });

  fetchBtn.addEventListener('click', fetchVideoInfo);

  // Tab Switchers
  tabVideo.addEventListener('click', () => {
    if (activeTab === 'video') return;
    activeTab = 'video';
    tabVideo.classList.add('active');
    tabAudio.classList.remove('active');
    renderFormats();
  });

  tabAudio.addEventListener('click', () => {
    if (activeTab === 'audio') return;
    activeTab = 'audio';
    tabAudio.classList.add('active');
    tabVideo.classList.remove('active');
    renderFormats();
  });

  // Fetch Video Info API
  async function fetchVideoInfo() {
    const url = urlInput.value.trim();
    if (!url) {
      showToast('Please paste or enter a YouTube link.', 'error');
      urlInput.focus();
      return;
    }

    // Set Loading state
    setFetchingState(true);
    loadingCard.style.display = 'flex';
    resultCard.style.display = 'none';
    progressSection.style.display = 'none';

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch video information.');
      }

      currentVideoData = data;
      displayVideoData(data);
      showToast('Video stream fetched successfully!', 'success');
    } catch (err) {
      console.error('Fetch error:', err);
      showToast(err.message || 'Error fetching video. Please check the URL.', 'error');
    } finally {
      setFetchingState(false);
      loadingCard.style.display = 'none';
    }
  }

  function setFetchingState(isLoading) {
    if (isLoading) {
      fetchBtn.disabled = true;
      btnText.style.display = 'none';
      btnIcon.style.display = 'none';
      spinner.style.display = 'block';
    } else {
      fetchBtn.disabled = false;
      btnText.style.display = 'inline';
      btnIcon.style.display = 'inline';
      spinner.style.display = 'none';
    }
  }

  // Display Video Details
  function displayVideoData(data) {
    videoThumb.src = data.thumbnail;
    videoDuration.textContent = data.durationFormatted || '0:00';
    watchLink.href = data.originalUrl;
    videoTitle.textContent = data.title;
    videoTitle.title = data.title;

    channelName.textContent = data.uploader;
    channelAvatar.textContent = (data.uploader || 'Y').charAt(0).toUpperCase();
    videoViews.textContent = data.viewCountFormatted ? `${data.viewCountFormatted} views` : 'YouTube Video';

    // Reset to Video tab
    activeTab = 'video';
    tabVideo.classList.add('active');
    tabAudio.classList.remove('active');

    renderFormats();
    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Render Format Cards based on Active Tab
  function renderFormats() {
    formatsContainer.innerHTML = '';
    if (!currentVideoData) return;

    const list = activeTab === 'video' ? currentVideoData.videoFormats : currentVideoData.audioFormats;

    if (!list || list.length === 0) {
      formatsContainer.innerHTML = '<p style="color: #888; font-size: 0.9rem;">No formats available.</p>';
      return;
    }

    // Default select first available
    selectedFormat = list[0];
    updateDownloadBtnLabel();

    list.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `format-option-card ${index === 0 ? 'selected' : ''}`;
      card.dataset.index = index;

      card.innerHTML = `
        <div class="format-top-row">
          <span class="format-badge">${item.badge || item.ext.toUpperCase()}</span>
          <div class="format-check">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        </div>
        <div class="format-quality">${item.quality || item.label}</div>
        <div class="format-sub">${item.subLabel || (item.ext.toUpperCase() + ' Video')}</div>
        <div class="format-size">${item.approxSize || 'Standard'}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.format-option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedFormat = item;
        updateDownloadBtnLabel();
      });

      formatsContainer.appendChild(card);
    });
  }

  function updateDownloadBtnLabel() {
    if (!selectedFormat) return;
    const formatName = selectedFormat.label || selectedFormat.quality;
    downloadBtnLabel.textContent = `Download ${formatName} (${selectedFormat.ext.toUpperCase()})`;
  }

  // Download Trigger Handler
  startDownloadBtn.addEventListener('click', async () => {
    if (!currentVideoData || !selectedFormat) {
      showToast('Please select a quality format first.', 'error');
      return;
    }

    startDownloadBtn.disabled = true;
    startDownloadBtn.style.opacity = '0.7';

    // Show Progress Section
    progressSection.style.display = 'block';
    progressStatus.textContent = 'Initiating download request...';
    progressFile.textContent = `${currentVideoData.title.substring(0, 50)}... (${selectedFormat.ext.toUpperCase()})`;
    progressBarFill.style.width = '2%';
    progressPercent.textContent = '0%';
    statSpeed.textContent = '-- MB/s';
    statSize.textContent = selectedFormat.approxSize || '--';
    statEta.textContent = '--:--';
    progressSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      // 1. Prepare download job
      const prepRes = await fetch('/api/download/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentVideoData.originalUrl,
          type: activeTab,
          quality: selectedFormat.quality,
          title: currentVideoData.title
        })
      });

      const prepData = await prepRes.json();
      if (!prepRes.ok) {
        throw new Error(prepData.error || 'Failed to start download job.');
      }

      const jobId = prepData.jobId;
      pollJobProgress(jobId);
    } catch (err) {
      console.error('Download prepare error:', err);
      showToast(err.message || 'Failed to initiate download.', 'error');
      progressSection.style.display = 'none';
      startDownloadBtn.disabled = false;
      startDownloadBtn.style.opacity = '1';
    }
  });

  // Poll Job Progress
  function pollJobProgress(jobId) {
    if (currentPollInterval) clearInterval(currentPollInterval);

    currentPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/progress/${jobId}`);
        if (!res.ok) {
          throw new Error('Download job tracking lost.');
        }

        const data = await res.json();

        if (data.status === 'downloading') {
          progressStatus.textContent = 'Downloading stream from YouTube...';
          const p = Math.min(Math.max(data.progress || 0, 5), 95);
          progressBarFill.style.width = `${p}%`;
          progressPercent.textContent = `${Math.floor(p)}%`;
          if (data.speed) statSpeed.textContent = data.speed;
          if (data.totalSize) statSize.textContent = data.totalSize;
          if (data.eta) statEta.textContent = data.eta;
        } else if (data.status === 'merging') {
          progressStatus.textContent = 'Muxing high-def video & audio tracks...';
          progressBarFill.style.width = '96%';
          progressPercent.textContent = '96%';
          statSpeed.textContent = 'FFmpeg Processing';
          statEta.textContent = 'Almost done';
        } else if (data.status === 'converting') {
          progressStatus.textContent = 'Extracting and encoding high-bitrate MP3...';
          progressBarFill.style.width = '96%';
          progressPercent.textContent = '96%';
          statSpeed.textContent = 'Encoding MP3';
        } else if (data.status === 'ready') {
          clearInterval(currentPollInterval);
          progressStatus.textContent = 'Complete! Sending file to your device...';
          progressBarFill.style.width = '100%';
          progressPercent.textContent = '100%';
          statEta.textContent = '00:00';

          // Trigger File Download
          const downloadUrl = `/api/download/file/${jobId}`;
          const hiddenLink = document.createElement('a');
          hiddenLink.href = downloadUrl;
          hiddenLink.download = data.fileName || 'video';
          document.body.appendChild(hiddenLink);
          hiddenLink.click();
          document.body.removeChild(hiddenLink);

          // Trigger Confetti Celebration
          triggerConfetti();
          showToast('🎉 Download started! File saved.', 'success');

          // Save to Recent Downloads
          saveToHistory({
            title: currentVideoData.title,
            thumbnail: currentVideoData.thumbnail,
            url: currentVideoData.originalUrl,
            quality: selectedFormat.quality || selectedFormat.label,
            type: activeTab,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });

          // Reset button state
          startDownloadBtn.disabled = false;
          startDownloadBtn.style.opacity = '1';

          setTimeout(() => {
            progressSection.style.display = 'none';
          }, 6000);
        } else if (data.status === 'error') {
          clearInterval(currentPollInterval);
          throw new Error(data.error || 'Download failed during conversion.');
        }
      } catch (err) {
        clearInterval(currentPollInterval);
        console.error('Progress error:', err);
        showToast(err.message || 'Error occurred while processing download.', 'error');
        progressSection.style.display = 'none';
        startDownloadBtn.disabled = false;
        startDownloadBtn.style.opacity = '1';
      }
    }, 600);
  }

  // Toast System
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4d4d" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Recent Downloads Storage
  function saveToHistory(item) {
    try {
      let history = JSON.parse(localStorage.getItem('vidfetch_history') || '[]');
      // Avoid duplicate of immediate same video
      history = history.filter(h => h.url !== item.url);
      history.unshift(item);
      if (history.length > 6) history = history.slice(0, 6);
      localStorage.setItem('vidfetch_history', JSON.stringify(history));
      renderHistory();
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  function renderHistory() {
    try {
      const history = JSON.parse(localStorage.getItem('vidfetch_history') || '[]');
      if (!history || history.length === 0) {
        historySection.style.display = 'none';
        return;
      }

      historySection.style.display = 'block';
      historyList.innerHTML = '';

      history.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
          <img class="history-thumb" src="${item.thumbnail}" alt="thumb">
          <div class="history-info">
            <div class="history-title" title="${item.title}">${item.title}</div>
            <div class="history-meta">${item.quality} • ${item.type.toUpperCase()} • ${item.time}</div>
          </div>
        `;

        el.addEventListener('click', () => {
          urlInput.value = item.url;
          clearBtn.style.display = 'inline-flex';
          fetchVideoInfo();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        historyList.appendChild(el);
      });
    } catch (e) {
      console.warn(e);
    }
  }

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem('vidfetch_history');
    renderHistory();
    showToast('Recent downloads cleared.', 'info');
  });

  // Confetti Particle Effect
  function triggerConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#FF0000', '#FF3333', '#FFFFFF', '#FFAA00', '#FFD700', '#00E5FF'];

    for (let i = 0; i < 90; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 16,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        alpha: 1
      });
    }

    let animationFrame;
    function update() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let active = false;

      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.rotation += p.vr;
        p.alpha -= 0.012;

        if (p.alpha > 0) {
          active = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(p.alpha, 0);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });

      if (active) {
        animationFrame = requestAnimationFrame(update);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationFrame);
      }
    }

    update();
  }
});
