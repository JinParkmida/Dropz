# Korean Subtitle Translator - Chrome Extension

A powerful Chrome extension that provides real-time Korean-to-English subtitles for video content using **free** browser-native APIs and services.

## 🆓 Completely Free Features

### Core Functionality (No API Keys Required)
- **Real-time Speech Recognition**: Uses Web Speech API (built into Chrome)
- **Korean-to-English Translation**: Uses Google Translate (free unofficial endpoint)
- **Universal Video Support**: Works with YouTube, YouTube Shorts, V Live, Twitch, Vimeo, and more
- **Subtitle Export**: Save generated subtitles in SRT format
- **Full Customization**: Adjust fonts, colors, positions, and timing

### 🎯 Key Features
- **Zero Cost**: No API keys or subscriptions required for basic functionality
- **Real-time Processing**: Instant Korean speech-to-text and translation
- **Smart Audio Processing**: Voice activity detection and noise reduction
- **Synchronized Subtitles**: Precisely timed subtitle overlay on video players
- **Export Functionality**: Download subtitles in SRT format
- **Beautiful UI**: Modern, responsive design with live preview

## 🔧 Technical Issues We Solved

### Critical Problems Identified and Fixed

#### 1. **Audio Capture Permission Errors** ❌ → ✅
**Problem**: The extension was incorrectly requesting microphone permissions instead of tab audio capture permissions.

**Root Cause**: 
- Using `chrome.tabCapture.capture()` directly in background script
- Using `getDisplayMedia()` in offscreen document
- These methods trigger microphone permission requests

**Solution Implemented**:
```javascript
// BEFORE (Incorrect - triggers microphone permissions)
chrome.tabCapture.capture({ audio: true }, (stream) => { ... });

// AFTER (Correct - uses tab capture without microphone permissions)
const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId
    }
  }
});
```

#### 2. **Audio Muting During Capture** ❌ → ✅
**Problem**: Tab audio would be muted when the extension started capturing.

**Root Cause**: 
- Audio stream was not properly connected to `audioContext.destination`
- Missing audio processing chain connection

**Solution Implemented**:
```javascript
// Create audio context and connect to destination to prevent muting
this.audioContext = new AudioContext();
const source = this.audioContext.createMediaStreamSource(this.stream);

// CRITICAL: Connect source to destination to maintain audio playback
source.connect(this.audioContext.destination);
```

#### 3. **"Cannot capture a tab with an active stream" Errors** ❌ → ✅
**Problem**: Multiple capture attempts on the same tab caused conflicts.

**Root Cause**: 
- No tracking of active streams per tab
- Race conditions between start/stop operations

**Solution Implemented**:
```javascript
// Track capture state per tab
this.captureState = new Map(); // Track capture state per tab
this.activeStreams = new Set(); // Track active streams to prevent conflicts

// Check before starting capture
if (this.activeStreams.has(tabId)) {
  throw new Error('Tab is already being captured');
}
```

#### 4. **Subtitle Display Issues** ❌ → ✅
**Problem**: Subtitles not appearing over video content, especially on YouTube Shorts.

**Root Cause**: 
- Incorrect video element detection
- Missing YouTube Shorts support
- Poor overlay positioning

**Solution Implemented**:
```javascript
// Enhanced video detection with YouTube Shorts support
const selectors = [
  '#shorts-player video',           // YouTube Shorts specific
  '.html5-video-player video',      // YouTube main player
  '.shorts-video-container video',
  'ytd-shorts-player video',
  // ... more selectors
];

// Special positioning for YouTube Shorts
if (this.isYouTubeShorts()) {
  this.positionForYouTubeShorts(videoRect);
}
```

#### 5. **Settings Not Persisting** ❌ → ✅
**Problem**: User settings (show original text, auto-hide, etc.) were not saving or applying correctly.

**Root Cause**: 
- Incorrect event handling for checkboxes
- Missing storage synchronization
- Settings not being passed to content script

**Solution Implemented**:
```javascript
// Fixed checkbox event handling
document.getElementById('showOriginal').addEventListener('change', (e) => {
  console.log('Show original changed:', e.target.checked);
  this.updateSetting('showOriginal', e.target.checked);
  this.updatePreview(); // Update preview immediately
});

// Proper settings synchronization
await chrome.storage.sync.set({ subtitleSettings: this.settings });
await chrome.tabs.sendMessage(tab.id, {
  type: 'UPDATE_SUBTITLE_SETTINGS',
  settings: this.settings
});
```

### 🏗️ Architecture Improvements

#### **Background Script (`background.js`)**
- ✅ Proper tab capture using `chrome.tabCapture.getMediaStreamId()`
- ✅ Per-tab capture state tracking
- ✅ Stream conflict prevention
- ✅ Robust error handling and cleanup

#### **Offscreen Document (`offscreen.js`)**
- ✅ Correct audio stream handling with `chromeMediaSource: 'tab'`
- ✅ Audio processing chain to prevent muting
- ✅ Improved speech recognition restart logic
- ✅ Better error recovery and timeout handling

#### **Content Script (`content.js`)**
- ✅ Enhanced video element detection (including YouTube Shorts)
- ✅ Improved overlay positioning and styling
- ✅ Better settings synchronization
- ✅ Non-intrusive error notifications

#### **Popup Interface (`popup.js`)**
- ✅ Fixed settings persistence and preview updates
- ✅ Proper tab ID handling
- ✅ Real-time settings synchronization

## Installation

### From Chrome Web Store (Coming Soon)
1. Visit the Chrome Web Store
2. Search for "Korean Subtitle Translator"
3. Click "Add to Chrome"

### Manual Installation (Development)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon will appear in your toolbar

## Quick Start

### Basic Usage (100% Free)
1. Navigate to a video with Korean audio (YouTube, V Live, etc.)
2. Click the extension icon in your toolbar
3. Click "Start Capturing" to begin real-time translation
4. Subtitles will appear automatically over the video
5. Click "Stop Capturing" when finished

**That's it! No setup, no API keys, no costs.**

## How It Works

### Free Technology Stack
- **Speech Recognition**: Web Speech API (Chrome's built-in speech recognition)
- **Translation**: Google Translate unofficial endpoint (free but rate-limited)
- **Audio Processing**: Web Audio API for noise reduction and voice enhancement
- **Subtitle Rendering**: Custom overlay system with full styling control

### Browser Requirements
- **Chrome 88+**: Full support with Web Speech API
- **Edge (Chromium)**: Full compatibility
- **Brave**: Full compatibility
- **Firefox**: Limited support (different speech API)

## Advanced Features

### Premium Translation (Optional)
For users who want higher quality translations, you can optionally configure:
- **OpenAI GPT**: Requires API key, provides more natural translations
- **Cost**: Pay-per-use based on OpenAI pricing (~$0.002 per translation)

### Customization Options
- **Font Settings**: Size, family, weight, and color
- **Position**: Top, middle, or bottom placement
- **Background**: Adjustable opacity and color
- **Timing**: Auto-hide duration and interim results
- **Languages**: Show/hide original Korean text

## Supported Platforms

### Video Platforms
- ✅ **YouTube** - Full support including live streams
- ✅ **YouTube Shorts** - Optimized positioning and detection
- ✅ **V Live** - Korean content optimized
- ✅ **Twitch** - Live streaming support
- ✅ **Vimeo** - Professional video content
- ✅ **Generic HTML5** - Most video players
- ✅ **Embedded Players** - Cross-frame support

### Content Types
- Live streams and broadcasts
- Pre-recorded videos
- Educational content
- Entertainment shows
- News and documentaries

## Performance & Accuracy

### Speech Recognition Accuracy
- **Good**: Clear speech in quiet environments
- **Fair**: Background music or noise
- **Limitations**: Heavy accents, multiple speakers, very fast speech

### Translation Quality
- **Google Translate**: Good for general content, may struggle with idioms
- **OpenAI GPT** (optional): More natural, context-aware translations

### Performance Tips
- Use headphones to reduce audio feedback
- Ensure stable internet connection
- Close unnecessary tabs for better performance
- Adjust sensitivity settings for your audio environment

## Privacy & Security

### Data Handling
- **Audio**: Processed in real-time, not stored permanently
- **Translations**: Cached locally for performance, can be cleared
- **No Tracking**: No user analytics or data collection
- **Local Processing**: Most processing happens in your browser

### Permissions Explained
- **tabCapture**: Required to access audio from video tabs
- **activeTab**: Needed to inject subtitle overlay
- **storage**: For saving settings and translation cache
- **microphone**: Required by Chrome when using the Web Speech API. Even though
  the extension processes tab audio, the browser still requests microphone
  permission to start speech recognition.

## Troubleshooting

### Common Issues

#### No Subtitles Appearing
- **Check**: Browser supports Web Speech API (Chrome recommended)
- **Verify**: Video is actually playing Korean audio
- **Adjust**: Voice detection sensitivity in settings
- **Try**: Refreshing the page and restarting capture

#### Poor Recognition Quality
- **Improve**: Audio quality (use headphones, reduce background noise)
- **Adjust**: Sensitivity settings
- **Check**: Internet connection stability
- **Consider**: Premium OpenAI translation for better results

#### Extension Not Working
- **Update**: Chrome to latest version
- **Check**: Extension permissions granted
- **Try**: Reloading the extension
- **Verify**: Video platform is supported

### Browser Compatibility
The extension checks browser compatibility automatically:
- **Web Speech API**: Required for speech recognition
- **Audio Context**: Required for audio processing
- **Media Stream**: Required for tab audio capture

## Development

### Building from Source
```bash
# Clone repository
git clone https://github.com/your-repo/korean-subtitle-extension.git
cd korean-subtitle-extension

# No build process needed - it's a pure Chrome extension
# Just load the folder in Chrome's extension developer mode
```

### File Structure
```
korean-subtitle-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (tab capture & message routing)
├── offscreen.js          # Audio processing & speech recognition
├── content.js            # Content script (subtitle overlay)
├── popup.html/js/css     # Extension popup interface
├── options.html/js/css   # Settings page
└── README.md            # Documentation
```

### Key Technical Implementations

#### **Correct Tab Audio Capture**
```javascript
// Background Script
const streamId = await chrome.tabCapture.getMediaStreamId({
  targetTabId: tabId
});

// Offscreen Document
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId
    }
  }
});
```

#### **Audio Processing Without Muting**
```javascript
// Create audio context and maintain playback
this.audioContext = new AudioContext();
const source = this.audioContext.createMediaStreamSource(this.stream);

// CRITICAL: Connect to destination to prevent muting
source.connect(this.audioContext.destination);

// Apply processing for better recognition
const gainNode = this.audioContext.createGain();
const filterNode = this.audioContext.createBiquadFilter();
source.connect(filterNode).connect(gainNode).connect(this.audioContext.destination);
```

#### **Enhanced Video Detection**
```javascript
// Support for YouTube Shorts and other platforms
const selectors = [
  '#shorts-player video',           // YouTube Shorts
  '.html5-video-player video',      // YouTube main
  '.shorts-video-container video',
  'ytd-shorts-player video',
  'video',                          // Generic
  // ... more selectors
];
```

## Limitations & Trade-offs

### Free Service Limitations
- **Speech Recognition**: Depends on Chrome's Web Speech API accuracy
- **Translation**: Uses unofficial Google Translate (may be rate-limited)
- **Language Support**: Limited to what Web Speech API supports
- **Offline**: Requires internet connection for translation

### Compared to Paid Services
- **Accuracy**: May be lower than dedicated paid APIs
- **Reliability**: Free services may have occasional outages
- **Features**: Some advanced features require premium APIs
- **Support**: Community-based rather than commercial support

## Contributing

We welcome contributions to improve the free functionality:

1. **Speech Recognition**: Improve Web Speech API integration
2. **Translation**: Add more free translation services
3. **UI/UX**: Enhance user interface and experience
4. **Performance**: Optimize for better speed and accuracy
5. **Compatibility**: Support more browsers and platforms

### How to Contribute
1. Fork the repository
2. Create a feature branch
3. Test thoroughly with free services
4. Submit a pull request

## Support

### Getting Help
- 📖 **Documentation**: [Wiki](https://github.com/your-repo/korean-subtitle-extension/wiki)
- 🐛 **Bug Reports**: [Issues](https://github.com/your-repo/korean-subtitle-extension/issues)
- 💡 **Feature Requests**: [Discussions](https://github.com/your-repo/korean-subtitle-extension/discussions)

### Community
- 💬 **Discord**: [Join our community](https://discord.gg/korean-subtitle)
- 🐦 **Twitter**: [@KoreanSubtitle](https://twitter.com/KoreanSubtitle)

## Roadmap

### Version 1.1 (Free Features)
- [ ] Improved Web Speech API integration
- [ ] Additional free translation services
- [ ] Better audio processing
- [ ] Enhanced subtitle styling

### Version 1.2 (Community Features)
- [ ] Offline translation support
- [ ] Community translation corrections
- [ ] Multiple language support
- [ ] Mobile companion app

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Google** for Web Speech API and Chrome Extensions platform
- **Chrome Extensions Team** for the powerful development platform
- **Korean Language Community** for feedback and testing
- **Open Source Contributors** who made this possible

---

**Made with ❤️ for accessible Korean language learning**

*No API keys required • No subscriptions • No hidden costs*