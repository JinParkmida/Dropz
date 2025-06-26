// Content script for video player interaction and subtitle overlay
class SubtitleOverlay {
  constructor() {
    console.log('SubtitleOverlay constructor started');
    this.isActive = false;
    this.overlayElement = null;
    this.subtitleQueue = [];
    this.currentSubtitle = null;
    this.interimSubtitle = null;
    this.settings = {
      fontSize: 16,
      fontColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      position: 'bottom',
      fontFamily: 'Arial, sans-serif',
      showOriginal: false,
      autoHide: true,
      maxLines: 2,
      showInterim: true
    };
    
    this.videoElement = null;
    this.observer = null;
    this.hideTimer = null;
    this.tabId = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    this.init();
  }

  async init() {
    console.log('SubtitleOverlay init() started');
    try {
      // Get current tab ID
      this.tabId = await this.getCurrentTabId();
      console.log('Current tab ID:', this.tabId);
      
      // Load settings
      const stored = await chrome.storage.sync.get(['subtitleSettings']);
      if (stored.subtitleSettings) {
        this.settings = { ...this.settings, ...stored.subtitleSettings };
        console.log('Settings loaded:', this.settings);
      }

      // Find video element with retry logic
      await this.findVideoElementWithRetry();
      console.log('Video element found:', this.videoElement);
      
      // Set up mutation observer for dynamic content
      this.setupMutationObserver();
      
      // Create overlay
      this.createOverlay();
      console.log('Overlay created:', this.overlayElement);
      
      // Listen for messages from background script
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        this.handleMessage(request, sender, sendResponse);
        return true; // Keep message channel open
      });

      // Check if we should restore capture state
      this.checkCaptureState();
    } catch (error) {
      console.error('Failed to initialize subtitle overlay:', error);
    }
  }

  async getCurrentTabId() {
    try {
      // This is a workaround since content scripts can't directly get tab ID
      const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' });
      return response?.tabId || null;
    } catch (error) {
      return null;
    }
  }

  async checkCaptureState() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_STATUS',
        tabId: this.tabId 
      });
      
      if (response?.isCapturing) {
        this.isActive = true;
        if (this.overlayElement) {
          this.overlayElement.style.display = 'block';
        }
      }
    } catch (error) {
      console.error('Failed to check capture state:', error);
    }
  }

  async findVideoElementWithRetry() {
    console.log('Finding video element with retry...');
    for (let i = 0; i < this.maxRetries; i++) {
      this.findVideoElement();
      if (this.videoElement) {
        console.log(`Video element found on attempt ${i + 1}`);
        break;
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  findVideoElement() {
    console.log('Searching for video element...');
    // Enhanced selectors for YouTube Shorts and other platforms
    const selectors = [
      // YouTube Shorts specific
      '#shorts-player video',
      '.html5-video-player video', // YouTube main player
      '.shorts-video-container video',
      'ytd-shorts-player video',
      
      // YouTube general
      'video#movie_player',
      '.video-stream.html5-main-video',
      '#movie_player video',
      '.webplayer-internal-video',
      
      // Generic video selectors
      'video', // Generic video element
      '.video-player video',
      '.vjs-tech', // Video.js
      '.jwplayer video', // JW Player
      '.plyr__video-wrapper video', // Plyr
      '.video-stream', // Twitch
      '.player video' // Generic player
    ];

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.tagName.toLowerCase() === 'video') {
          this.videoElement = element;
          console.log('Video element found with selector:', selector);
          break;
        }
      } catch (error) {
        // Silently continue to next selector
        continue;
      }
    }

    // Special handling for YouTube Shorts
    if (!this.videoElement && this.isYouTubeShorts()) {
      this.findYouTubeShortsVideo();
    }

    if (!this.videoElement) {
      // Try to find video element in iframes (with error handling)
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const video = iframeDoc.querySelector('video');
          if (video) {
            this.videoElement = video;
            console.log('Video element found in iframe');
            break;
          }
        } catch (e) {
          // Cross-origin iframe, can't access - silently continue
          continue;
        }
      }
    }

    if (!this.videoElement) {
      console.log('No video element found');
    }
  }

  isYouTubeShorts() {
    return window.location.href.includes('/shorts/') || 
           window.location.pathname.includes('/shorts/');
  }

  findYouTubeShortsVideo() {
    // YouTube Shorts has a different structure
    const shortsSelectors = [
      '#shorts-player video',
      'ytd-shorts-player video',
      '.shorts-video-container video',
      '[data-layer="4"] video', // Shorts overlay layer
      'ytd-reel-video-renderer video'
    ];

    for (const selector of shortsSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.tagName.toLowerCase() === 'video') {
          this.videoElement = element;
          console.log('YouTube Shorts video found:', selector);
          break;
        }
      } catch (error) {
        // Silently continue
        continue;
      }
    }

    // If still not found, wait and try again (Shorts loads dynamically)
    if (!this.videoElement && this.retryCount < this.maxRetries) {
      this.retryCount++;
      setTimeout(() => {
        this.findYouTubeShortsVideo();
      }, 1000);
    }
  }

  setupMutationObserver() {
    // Disconnect existing observer if any
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      try {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const video = node.querySelector ? node.querySelector('video') : null;
                if (video && !this.videoElement) {
                  this.videoElement = video;
                  console.log('Video element found via mutation observer');
                  this.positionOverlay();
                }
              }
            });
          }
        });
      } catch (error) {
        console.error('Error in mutation observer:', error);
      }
    });

    try {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      console.error('Failed to setup mutation observer:', error);
    }
  }

  createOverlay() {
    console.log('Creating overlay...');
    // Remove existing overlay if any
    const existing = document.getElementById('korean-subtitle-overlay');
    if (existing) {
      existing.remove();
    }

    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'korean-subtitle-overlay';
    this.overlayElement.className = 'subtitle-overlay';
    
    // Apply styles
    this.updateOverlayStyles();
    
    // Add to page
    document.body.appendChild(this.overlayElement);
    console.log('Overlay added to DOM');
    
    // Position overlay
    setTimeout(() => this.positionOverlay(), 100);
    
    // Handle window resize
    window.addEventListener('resize', () => this.positionOverlay(), { passive: true });
  }

  updateOverlayStyles() {
    console.log('Updating overlay styles...');
    if (!this.overlayElement) return;

    const styles = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      font-family: ${this.settings.fontFamily};
      font-size: ${this.settings.fontSize}px;
      color: ${this.settings.fontColor};
      background-color: ${this.settings.backgroundColor};
      padding: 8px 16px;
      border-radius: 4px;
      max-width: 80%;
      text-align: center;
      line-height: 1.4;
      word-wrap: break-word;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: opacity 0.3s ease;
      opacity: 0;
      visibility: hidden;
    `;

    this.overlayElement.style.cssText = styles;
  }

  positionOverlay() {
    console.log('Positioning overlay...');
    if (!this.overlayElement || !this.videoElement) return;

    try {
      const videoRect = this.videoElement.getBoundingClientRect();
      
      // Special positioning for YouTube Shorts
      if (this.isYouTubeShorts()) {
        this.positionForYouTubeShorts(videoRect);
        return;
      }

      const overlayRect = this.overlayElement.getBoundingClientRect();

      let left = videoRect.left + (videoRect.width - overlayRect.width) / 2;
      let top;

      switch (this.settings.position) {
        case 'top':
          top = videoRect.top + 20;
          break;
        case 'middle':
          top = videoRect.top + (videoRect.height - overlayRect.height) / 2;
          break;
        case 'bottom':
        default:
          top = videoRect.bottom - overlayRect.height - 20;
          break;
      }

      // Ensure overlay stays within viewport
      left = Math.max(10, Math.min(left, window.innerWidth - overlayRect.width - 10));
      top = Math.max(10, Math.min(top, window.innerHeight - overlayRect.height - 10));

      this.overlayElement.style.left = `${left}px`;
      this.overlayElement.style.top = `${top}px`;
      console.log('Overlay positioned at:', left, top);
    } catch (error) {
      console.error('Error positioning overlay:', error);
    }
  }

  positionForYouTubeShorts(videoRect) {
    try {
      // YouTube Shorts specific positioning
      const overlayRect = this.overlayElement.getBoundingClientRect();
      
      // Center horizontally
      let left = videoRect.left + (videoRect.width - overlayRect.width) / 2;
      
      // Position at bottom but above the UI elements
      let top = videoRect.bottom - overlayRect.height - 80; // Extra space for Shorts UI
      
      // Ensure it stays within bounds
      left = Math.max(10, Math.min(left, window.innerWidth - overlayRect.width - 10));
      top = Math.max(10, Math.min(top, window.innerHeight - overlayRect.height - 10));

      this.overlayElement.style.left = `${left}px`;
      this.overlayElement.style.top = `${top}px`;
    } catch (error) {
      console.error('Error positioning for YouTube Shorts:', error);
    }
  }

  showSubtitle(subtitleData) {
    console.log('Showing subtitle:', subtitleData);
    if (!this.overlayElement) return;

    try {
      const { original, translated, timestamp, interim } = subtitleData;
      
      // Handle interim results differently
      if (interim && !this.settings.showInterim) {
        return;
      }
      
      // Create subtitle content
      let content = '';
      console.log('showOriginal setting:', this.settings.showOriginal);
      console.log('autoHide setting:', this.settings.autoHide);
      
      if (this.settings.showOriginal) {
        const opacity = interim ? '0.6' : '0.8';
        content += `<div class="original-text" style="opacity: ${opacity}; font-size: 0.9em; margin-bottom: 4px;">${original}</div>`;
      }
      
      const translationText = interim ? `${translated} ...` : translated;
      const opacity = interim ? '0.7' : '1';
      content += `<div class="translated-text" style="opacity: ${opacity};">${translationText}</div>`;

      this.overlayElement.innerHTML = content;
      
      // Position and show overlay
      this.positionOverlay();
      this.overlayElement.style.opacity = '1';
      this.overlayElement.style.visibility = 'visible';

      // Handle auto-hide for final results only
      if (!interim && this.settings.autoHide) {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
          this.hideSubtitle();
        }, Math.max(3000, translated.length * 100)); // Dynamic duration based on text length
      }

      // Store current subtitle
      if (!interim) {
        this.currentSubtitle = subtitleData;
        this.subtitleQueue.push(subtitleData);
      } else {
        this.interimSubtitle = subtitleData;
      }
    } catch (error) {
      console.error('Error showing subtitle:', error);
    }
  }

  hideSubtitle() {
    if (this.overlayElement) {
      this.overlayElement.style.opacity = '0';
      this.overlayElement.style.visibility = 'hidden';
    }
    this.currentSubtitle = null;
    this.interimSubtitle = null;
  }

  async toggleOverlay() {
    this.isActive = !this.isActive;
    
    if (this.isActive) {
      if (this.overlayElement) {
        this.overlayElement.style.display = 'block';
      }
      // Start audio capture
      try {
        await chrome.runtime.sendMessage({ 
          type: 'START_CAPTURE',
          tabId: this.tabId 
        });
      } catch (error) {
        console.error('Failed to start capture:', error);
        this.isActive = false;
      }
    } else {
      if (this.overlayElement) {
        this.overlayElement.style.display = 'none';
      }
      this.hideSubtitle();
      // Stop audio capture
      try {
        await chrome.runtime.sendMessage({ 
          type: 'STOP_CAPTURE',
          tabId: this.tabId 
        });
      } catch (error) {
        console.error('Failed to stop capture:', error);
      }
    }
  }

  updateSettings(newSettings) {
    console.log('Updating settings with:', newSettings);
    this.settings = { ...this.settings, ...newSettings };
    this.updateOverlayStyles();
    this.positionOverlay();
    
    // Save settings
    chrome.storage.sync.set({ subtitleSettings: this.settings }).catch(error => {
      console.error('Failed to save settings:', error);
    });
  }

  exportSubtitles() {
    if (this.subtitleQueue.length === 0) {
      alert('No subtitles to export');
      return;
    }

    try {
      // Create SRT format
      let srtContent = '';
      this.subtitleQueue.forEach((subtitle, index) => {
        const startTime = this.formatTime(subtitle.timestamp);
        const endTime = this.formatTime(subtitle.timestamp + 3000); // 3 second duration
        
        srtContent += `${index + 1}\n`;
        srtContent += `${startTime} --> ${endTime}\n`;
        srtContent += `${subtitle.translated}\n\n`;
      });

      // Download file
      const blob = new Blob([srtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `korean-subtitles-${Date.now()}.srt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting subtitles:', error);
      alert('Failed to export subtitles');
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
    
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
  }

  handleMessage(request, sender, sendResponse) {
    console.log('Content script received message:', request.type);
    try {
      switch (request.type) {
        case 'NEW_SUBTITLE':
          this.showSubtitle(request.data);
          break;
          
        case 'INTERIM_SUBTITLE':
          if (this.settings.showInterim) {
            this.showSubtitle(request.data);
          }
          break;
          
        case 'TOGGLE_SUBTITLE_OVERLAY':
          this.toggleOverlay();
          break;
          
        case 'UPDATE_SUBTITLE_SETTINGS':
          this.updateSettings(request.settings);
          break;
          
        case 'EXPORT_SUBTITLES':
          this.exportSubtitles();
          break;
          
        case 'RESTORE_CAPTURE_STATE':
          this.isActive = request.isCapturing;
          if (this.isActive && this.overlayElement) {
            this.overlayElement.style.display = 'block';
          }
          break;
          
        case 'CAPTURE_STARTED':
          this.isActive = true;
          console.log('Audio capture started');
          break;
          
        case 'CAPTURE_STOPPED':
          this.isActive = false;
          console.log('Audio capture stopped');
          break;
          
        case 'CAPTURE_ERROR':
          this.isActive = false;
          console.error('Capture error:', request.error);
          // Show a less intrusive notification instead of alert
          this.showNotification(`Caption error: ${request.error}`, 'error');
          break;
          
        case 'TRANSCRIPTION_ERROR':
          console.error('Transcription error:', request.error);
          this.showNotification(`Transcription error: ${request.error}`, 'warning');
          break;
      }
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  showNotification(message, type = 'info') {
    // Create a less intrusive notification instead of using alert()
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ffaa00' : '#4444ff'};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10001;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Remove after 5 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 5000);
  }

  // Cleanup method
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }
    if (this.overlayElement && document.body.contains(this.overlayElement)) {
      document.body.removeChild(this.overlayElement);
    }
  }
}

// Initialize subtitle overlay with error handling
let subtitleOverlay;
try {
  subtitleOverlay = new SubtitleOverlay();
} catch (error) {
  console.error('Failed to initialize subtitle overlay:', error);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (subtitleOverlay) {
    subtitleOverlay.destroy();
  }
}, { passive: true });
