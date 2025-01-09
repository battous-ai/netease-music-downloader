# NetEase Music Downloader

**Most of the code in this repository was written and developed by AI.**

[中文文档](./readmeZh.md)

A simple and easy-to-use tool for downloading music from NetEase Cloud Music. Supporting both single songs and albums with multiple ways to use.

## Features

- ✨ Support single/multiple song downloads
- 📀 Support full album downloads
- 🚀 Show download progress
- 🎵 Auto-fetch artist and song names
- 📂 Auto-create album directories
- ⚡️ Auto-skip downloaded files
- 🔍 Auto-detect unavailable or copyright-protected songs
- 📝 Auto-download lyrics (if available)

## Usage

### 1. Download via GitHub Issue (Recommended)

The easiest way to use, no installation required (due to the server being located overseas, some songs may not be downloaded):

1. Visit [Issues page](https://github.com/Gaohaoyang/netease-music-downloader/issues)
2. Click "New Issue"
3. Choose "Download Music" template
4. Fill in the type (song/album) and music ID
5. Submit the issue and download will start automatically
6. Download links will be provided in the issue comments

### 2. Use via npx

No installation needed, run directly:

```bash
# Download a song
npx netease-music-downloader download 426832090

# Download an album
npx netease-music-downloader album 34836039
```

### 3. Local Development

For local development:

```bash
# Clone repository
git clone https://github.com/Gaohaoyang/netease-music-downloader.git

# Enter directory
cd netease-music-downloader

# Install dependencies
pnpm install

# Run commands
pnpm start download 426832090  # Download a song
pnpm start album 34836039     # Download an album
```

## How to Get Music ID?

1. Open NetEase Cloud Music website or client
2. Find the song or album you want to download
3. Copy the link and get the ID from it:
   - Song link: `426832090` from `https://music.163.com/#/song?id=426832090`
   - Album link: `34836039` from `https://music.163.com/#/album?id=34836039`

## Download Directory Structure

```
downloads/
├── artist-songname.mp3              # Single song
├── artist-songname.lrc             # Lyrics file
└── album-name/                      # Album
    ├── 01.artist-song1.mp3
    ├── 01.artist-song1.lrc
    ├── 02.artist-song2.mp3
    ├── 02.artist-song2.lrc
    └── ...
```

## Notes

- For personal learning use only
- Please comply with relevant laws and regulations
- Some music may be unavailable due to copyright restrictions
- Downloaded music files will be automatically cleaned up after 3 hours
- Stable network connection required
- Special characters in filenames will be automatically removed

## License

MIT
