# 🎬 VidFetch - Modern YouTube Video & Audio Downloader

A modern, high-performance YouTube video & audio downloader web application built with a **YouTube Studio Dark Theme** (`#0F0F0F`, `#212121`, YouTube Red `#FF0000`/`#FF033E`), clean typography, glassmorphism, real-time download streaming, and MP3 audio extraction.

---

## ✨ Features

- **YouTube Studio Dark Design**: Deep matte blacks, authentic red glowing accents, sleek pill controls, and high-fidelity typography.
- **One-Click Clipboard Paste**: Instant `Paste from Clipboard` button that reads and parses YouTube URLs directly.
- **Rich Media Preview Card**:
  - 16:9 thumbnail preview with YouTube-style duration timestamp pill (`03:45`)
  - Channel name with verified creator badge (`✓`) and avatar
  - Formatted view count (e.g., `1.8B views`) and video title
- **Full HD & 4K Video Options**:
  - `4K Ultra HD`, `2K Quad HD`, `1080p Full HD`, `720p HD`, `480p`, `360p`
  - Automatic audio & video muxing using bundled FFmpeg
  - Approximate file size indicators
- **Studio-Quality Audio Extraction**:
  - `320 kbps High Quality MP3`
  - `128 kbps Standard MP3`
  - `Native M4A / AAC`
- **Live Download Progress Tracker**: Real-time progress bar, transfer speed (`MB/s`), and ETA countdown.
- **Recent Downloads Shelf**: Automatically remembers your recent downloads locally in your browser.
- **No Ads, No Limits**: 100% clean and fast.

---

## 🚀 How to Run

1. Open a terminal in this project folder:
   ```bash
   cd "C:\Users\aakas\OneDrive\Desktop\YT Video Downloader"
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser at:
   ```
   http://localhost:3000
   ```

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (YouTube Dark Theme Design System), Vanilla JS (Fast, Zero Dependencies)
- **Backend**: Node.js, Express.js
- **Extraction & Muxing Engine**: Standalone `yt-dlp.exe` with bundled `ffmpeg-static`
- **Runtime**: Node.js JS challenge solver
