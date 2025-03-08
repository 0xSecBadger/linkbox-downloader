# Linkbox Downloader

A lightweight, efficient Node.js script to download files and folders from Linkbox file sharing service.

## Features

- 📂 Recursively navigates through folder structures
- 📥 Downloads files with size checking
- 🎥 Special handling for video files
- 🚀 Optimized for speed with minimal dependencies
- 🔄 Multiple download methods (direct and browser-based)
- 📊 Clear console logging with emoji indicators

## Requirements

- Node.js 18+ (for native fetch support)
- If using Node.js < 18, you'll need to install `node-fetch` package

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/0xSecBadger/linkbox-downloader.git
   cd linkbox-downloader
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the script with a Linkbox URL as an argument:

```bash
node linkbox-downloader.js "https://linkbox.to/your-shared-folder-link"
```

All files will be downloaded to a `downloads` folder in the current directory.

## How It Works

1. **Browser Automation**: Uses Puppeteer to navigate the Linkbox web interface
2. **Folder Detection**: Identifies folders and files in the current view
3. **Recursive Navigation**: Traverses through folder structures
4. **Smart Download**: Attempts to download files using:
   - Direct URL extraction when possible
   - Fallback to browser download buttons
   - Size checking to avoid extremely large files
5. **File Organization**: Maintains the original folder structure

## Configuration Options

You can modify these constants at the top of the script:

- `MAX_FILE_SIZE`: Maximum file size to download (default: 100MB)
- `SELECTOR_TIMEOUT`: Timeout for waiting for elements (default: 5000ms)
- `DOWNLOAD_TIMEOUT`: Timeout for downloads (default: 30000ms)

## Headless Mode

By default, the script runs with a visible browser (`headless: false`). To run in headless mode for better performance, change this line in the `main()` function:

```javascript
const browser = await puppeteer.launch({
  headless: true,  // Change to true for headless mode
  // other options...
});
```

## Limitations

- Maximum file size is set to 100MB by default
- Some files may be skipped if download buttons aren't detected
- Cookie consent popups are handled in a basic way

## Troubleshooting

If you encounter issues:

1. **Downloads not starting**: Check if the Linkbox interface has changed, may need selector updates
2. **Permission errors**: Ensure you have write permissions to the downloads directory
3. **Timeouts**: Try increasing the timeout values for slower connections

## License

MIT

## Disclaimer

This tool is for personal use only. Please respect copyright laws and terms of service for any content you download.