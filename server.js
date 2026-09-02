const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const ffmpegStatic = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const YT_DLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const FFMPEG_PATH = ffmpegStatic;
const TEMP_DIR = path.join(__dirname, 'temp_downloads');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// In-memory download jobs tracker
const jobs = new Map();

// Helper: Sanitize filename for safe downloads
function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim().substring(0, 150) || 'youtube_video';
}

// Helper: Format duration (seconds -> HH:MM:SS or MM:SS)
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const sec = Math.floor(seconds % 60);
  const min = Math.floor((seconds / 60) % 60);
  const hrs = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(min)}:${pad(sec)}`;
  }
  return `${min}:${pad(sec)}`;
}

// Helper: Format view counts (1234567 -> 1.2M)
function formatViews(views) {
  if (!views || isNaN(views)) return null;
  if (views >= 1000000000) return (views / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (views >= 1000000) return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (views >= 1000) return (views / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(views);
}

// Helper: Format file size
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// Validate YouTube URL
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const regex = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)[\w-]{11}/;
  return regex.test(url.trim());
}

// API: Get Video Info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Please enter a valid YouTube video or Shorts link.' });
  }

  const cleanUrl = url.trim();

  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes', 'node',
    cleanUrl
  ];

  let stdoutData = '';
  let stderrData = '';

  const proc = spawn(YT_DLP_PATH, args);

  proc.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  proc.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp error:', stderrData);
      return res.status(500).json({
        error: 'Failed to fetch video information. Video may be private, age-restricted, or unavailable.'
      });
    }

    try {
      const data = JSON.parse(stdoutData);

      // Best thumbnail
      let bestThumbnail = data.thumbnail;
      if (data.thumbnails && data.thumbnails.length > 0) {
        const sorted = [...data.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
        bestThumbnail = sorted[0].url || bestThumbnail;
      }

      // Analyze available video resolutions
      const formats = data.formats || [];
      const videoHeights = new Set();
      const formatMap = new Map();

      formats.forEach((f) => {
        if (f.vcodec && f.vcodec !== 'none' && f.height) {
          videoHeights.add(f.height);
          const current = formatMap.get(f.height);
          if (!current || (f.filesize || f.filesize_approx || 0) > (current.filesize || current.filesize_approx || 0)) {
            formatMap.set(f.height, f);
          }
        }
      });

      // Standard resolution tiers we offer
      const standardTiers = [
        { height: 2160, label: '4K Ultra HD', quality: '2160p', badge: '4K' },
        { height: 1440, label: '2K Quad HD', quality: '1440p', badge: '2K' },
        { height: 1080, label: '1080p Full HD', quality: '1080p', badge: 'FHD' },
        { height: 720, label: '720p HD', quality: '720p', badge: 'HD' },
        { height: 480, label: '480p Standard', quality: '480p', badge: 'SD' },
        { height: 360, label: '360p Low', quality: '360p', badge: 'ECO' }
      ];

      const availableVideo = [];
      for (const tier of standardTiers) {
        const hasHeight = Array.from(videoHeights).some((h) => h >= tier.height);
        if (hasHeight) {
          const matchedFormat = formatMap.get(tier.height) || {};
          let sizeStr = null;
          const sz = matchedFormat.filesize || matchedFormat.filesize_approx;
          if (sz) {
            sizeStr = formatBytes(sz);
          } else if (data.duration) {
            const bitrates = { 2160: 18000, 1440: 9000, 1080: 4500, 720: 2500, 480: 1200, 360: 700 };
            const estBytes = (bitrates[tier.height] * 1024 * data.duration) / 8;
            sizeStr = '~' + formatBytes(estBytes);
          }

          availableVideo.push({
            quality: tier.quality,
            label: tier.label,
            badge: tier.badge,
            height: tier.height,
            ext: 'mp4',
            approxSize: sizeStr
          });
        }
      }

      if (availableVideo.length === 0) {
        availableVideo.push({
          quality: '720p',
          label: '720p HD / Best',
          badge: 'BEST',
          height: 720,
          ext: 'mp4',
          approxSize: data.duration ? '~' + formatBytes((2500 * 1024 * data.duration) / 8) : null
        });
      }

      // Audio Formats
      const audioOptions = [
        {
          quality: 'mp3-320',
          label: 'MP3 High Quality',
          subLabel: '320 kbps (High Fidelity)',
          badge: 'HQ',
          ext: 'mp3',
          approxSize: data.duration ? '~' + formatBytes((320 * 1024 * data.duration) / 8) : null
        },
        {
          quality: 'mp3-128',
          label: 'MP3 Standard',
          subLabel: '128 kbps (Optimized)',
          badge: 'STD',
          ext: 'mp3',
          approxSize: data.duration ? '~' + formatBytes((128 * 1024 * data.duration) / 8) : null
        },
        {
          quality: 'm4a',
          label: 'M4A Original',
          subLabel: 'Native YouTube Audio Stream',
          badge: 'AAC',
          ext: 'm4a',
          approxSize: data.duration ? '~' + formatBytes((140 * 1024 * data.duration) / 8) : null
        }
      ];

      res.json({
        id: data.id,
        title: data.title || 'YouTube Video',
        description: (data.description || '').substring(0, 200),
        uploader: data.uploader || data.channel || 'Unknown Creator',
        uploaderUrl: data.uploader_url || data.channel_url || '',
        thumbnail: bestThumbnail,
        duration: data.duration,
        durationFormatted: formatDuration(data.duration),
        viewCount: data.view_count,
        viewCountFormatted: formatViews(data.view_count),
        videoFormats: availableVideo,
        audioFormats: audioOptions,
        originalUrl: cleanUrl
      });
    } catch (err) {
      console.error('Parse error:', err);
      res.status(500).json({ error: 'Failed to parse video details.' });
    }
  });
});

// API: Prepare Download Job
app.post('/api/download/prepare', (req, res) => {
  const { url, type, quality, title } = req.body;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL provided.' });
  }

  const jobId = crypto.randomUUID();
  const cleanTitle = sanitizeFilename(title || 'youtube_video');
  const ext = type === 'audio' ? (quality === 'm4a' ? 'm4a' : 'mp3') : 'mp4';
  const outputTemplate = path.join(TEMP_DIR, `${jobId}.%(ext)s`);

  const job = {
    id: jobId,
    url,
    type,
    quality,
    title: cleanTitle,
    ext,
    status: 'starting',
    progress: 0,
    speed: '',
    eta: '',
    totalSize: '',
    error: null,
    filePath: null,
    fileName: `${cleanTitle}.${ext}`,
    createdAt: Date.now()
  };

  jobs.set(jobId, job);

  // Build yt-dlp arguments
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--ffmpeg-location', FFMPEG_PATH,
    '--js-runtimes', 'node',
    '-o', outputTemplate
  ];

  if (type === 'audio') {
    if (quality === 'm4a') {
      args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    } else {
      const audioQuality = quality === 'mp3-320' ? '0' : '4';
      args.push(
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', audioQuality
      );
    }
  } else {
    // Video
    const heightMatch = quality ? quality.match(/(\d+)p/) : null;
    const maxH = heightMatch ? heightMatch[1] : '1080';

    args.push(
      '-f',
      `bestvideo[height<=${maxH}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxH}]+bestaudio/best[height<=${maxH}]/best`,
      '--merge-output-format', 'mp4'
    );
  }

  args.push(url.trim());

  const proc = spawn(YT_DLP_PATH, args);

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const dlMatch = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?\s*([\d\.]+\s*\w+)\s+at\s+([\d\.]+\s*\w+\/s)\s+ETA\s+([\d:]+)/i);
      if (dlMatch) {
        job.status = 'downloading';
        job.progress = parseFloat(dlMatch[1]) || job.progress;
        job.totalSize = dlMatch[2] || job.totalSize;
        job.speed = dlMatch[3] || job.speed;
        job.eta = dlMatch[4] || job.eta;
        continue;
      }

      if (line.includes('[Merger]') || line.includes('Merging formats')) {
        job.status = 'merging';
        job.progress = 98;
      } else if (line.includes('[ExtractAudio]')) {
        job.status = 'converting';
        job.progress = 95;
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const str = data.toString();
    if (str.toLowerCase().includes('error:')) {
      console.error(`[Job ${jobId} stderr]:`, str);
      job.error = str.trim();
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = job.error || 'Failed to process video download.';
      return;
    }

    // Locate the output file
    try {
      const files = fs.readdirSync(TEMP_DIR);
      const match = files.find((f) => f.startsWith(jobId));
      if (match) {
        job.filePath = path.join(TEMP_DIR, match);
        job.status = 'ready';
        job.progress = 100;
      } else {
        job.status = 'error';
        job.error = 'Downloaded file could not be located.';
      }
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
    }
  });

  res.json({ jobId });
});

// API: Poll Download Job Status
app.get('/api/download/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Download job not found or expired.' });
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    totalSize: job.totalSize,
    fileName: job.fileName,
    error: job.error
  });
});

// API: Serve Downloaded File
app.get('/api/download/file/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || job.status !== 'ready' || !job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(404).send('File not found or still processing.');
  }

  const filePath = job.filePath;
  const fileName = job.fileName;

  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error('Download transfer error:', err);
    }
    // Clean up file and job entry after download
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        jobs.delete(jobId);
      } catch (cleanErr) {
        console.error('Cleanup error:', cleanErr);
      }
    }, 5000);
  });
});

// Periodic cleanup of orphaned temporary files (older than 15 minutes)
setInterval(() => {
  const now = Date.now();
  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const fullPath = path.join(TEMP_DIR, file);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > 15 * 60 * 1000) {
        fs.unlinkSync(fullPath);
      }
    }

    for (const [id, job] of jobs.entries()) {
      if (now - job.createdAt > 20 * 60 * 1000) {
        jobs.delete(id);
      }
    }
  } catch (err) {
    console.error('Auto-cleanup error:', err);
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 YouTube Downloader Server running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
