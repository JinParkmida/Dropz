// Background service worker - manages offscreen document and message routing
class BackgroundController {
  constructor() {
    this.isCapturing = false;
    this.currentTabId = null;
    this.offscreenDocumentCreated = false;
    this.captureState = new Map(); // Track capture state per tab
    this.activeStreams = new Set(); // Track active streams to prevent conflicts
    this.settings = {
      translationService: 'google',
      language: 'ko-en',
      sensitivity: 0.7,
      continuous: true,
      interimResults: true,
      apiKey: ''
    };
    
    this.initializeSettings();
    this.setupMessageHandlers();
  }

  async initializeSettings() {
    try {
      const stored = await chrome.storage.sync.get(['settings']);
      if (stored.settings) {
        this.settings = { ...this.settings, ...stored.settings };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupMessageHandlers() {
    // Handle messages from popup and content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle extension icon click
    chrome.action.onClicked.addListener((tab) => {
      this.toggleCaptureForTab(tab.id);
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.captureState.delete(tabId);
      this.activeStreams.delete(tabId);
      if (this.currentTabId === tabId) {
        this.currentTabId = null;
        this.isCapturing = false;
      }
    });
  }

  async sendMessageToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      // Silently fail if content script is not loaded
      console.log('Content script not available for tab:', tabId);
    }
  }

  async toggleCaptureForTab(tabId) {
    const isCurrentlyCapturing = this.captureState.get(tabId) || false;
    
    if (isCurrentlyCapturing) {
      await this.stopCaptureForTab(tabId);
    } else {
      await this.startCaptureForTab(tabId);
    }
  }

  async startCaptureForTab(tabId) {
    if (!tabId) {
      console.error('No tab ID provided');
      return;
    }

    if (this.activeStreams.has(tabId)) {
      console.log('Tab already has active stream:', tabId);
      this.sendMessageToTab(tabId, {
        type: 'CAPTURE_ERROR',
        error: 'Tab is already being captured'
      });
      return;
    }

    try {
      this.currentTabId = tabId;

      // Create offscreen document if it doesn't exist
      if (!this.offscreenDocumentCreated) {
        await this.createOffscreenDocument();
      }

      // Use chrome.tabCapture.getMediaStreamId() to get streamId
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId
      });

      if (!streamId) {
        throw new Error('Failed to get media stream ID');
      }

      // Send the streamId to offscreen document for proper audio capture
      this.sendMessageToOffscreen({
        type: 'START_RECOGNITION',
        streamId: streamId,
        tabId: tabId,
        settings: this.settings
      });

      this.activeStreams.add(tabId);
      this.captureState.set(tabId, true);
    } catch (error) {
      console.error('Failed to start capture for tab:', error);
      this.captureState.set(tabId, false);
      this.activeStreams.delete(tabId);
      this.sendMessageToTab(tabId, {
        type: 'CAPTURE_ERROR',
        error: error.message
      });
    }
  }

  async stopCaptureForTab(tabId) {
    try {
      this.captureState.set(tabId, false);
      this.activeStreams.delete(tabId);
      if (this.currentTabId === tabId) {
        await this.stopCapture();
      }
    } catch (error) {
      console.error('Failed to stop capture for tab:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      const tabId = sender.tab?.id || request.tabId;

      switch (request.type) {
        case 'START_CAPTURE':
          const targetTabId = request.tabId || tabId;
          if (targetTabId) {
            await this.startCaptureForTab(targetTabId);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No tab ID available' });
          }
          break;
          
        case 'STOP_CAPTURE':
          const stopTabId = request.tabId || tabId;
          if (stopTabId) {
            await this.stopCaptureForTab(stopTabId);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No tab ID available' });
          }
          break;
          
        case 'UPDATE_SETTINGS':
          this.settings = { ...this.settings, ...request.settings };
          await chrome.storage.sync.set({ settings: this.settings });
          
          // Update offscreen document settings if it exists
          if (this.offscreenDocumentCreated) {
            this.sendMessageToOffscreen({
              type: 'UPDATE_SETTINGS',
              settings: this.settings
            });
          }
          
          sendResponse({ success: true });
          break;
          
        case 'GET_STATUS':
          const currentTabId = request.tabId || tabId;
          const isTabCapturing = this.captureState.get(currentTabId) || false;
          
          sendResponse({ 
            isCapturing: isTabCapturing,
            hasApiKey: !!this.settings.apiKey,
            supportsSpeechRecognition: true,
            tabId: currentTabId
          });
          break;

        case 'GET_CURRENT_TAB':
          sendResponse({ tabId: tabId });
          break;

        // Messages from offscreen document
        case 'RECOGNITION_STARTED':
          this.isCapturing = true;
          if (request.tabId) {
            this.captureState.set(request.tabId, true);
            this.sendMessageToTab(request.tabId, {
              type: 'CAPTURE_STARTED',
              status: 'success'
            });
          }
          sendResponse({ success: true });
          break;

        case 'RECOGNITION_STOPPED':
          this.isCapturing = false;
          if (request.tabId) {
            this.captureState.set(request.tabId, false);
            this.activeStreams.delete(request.tabId);
            this.sendMessageToTab(request.tabId, {
              type: 'CAPTURE_STOPPED'
            });
          }
          sendResponse({ success: true });
          break;

        case 'RECOGNITION_ERROR':
          this.isCapturing = false;
          if (request.tabId) {
            this.captureState.set(request.tabId, false);
            this.activeStreams.delete(request.tabId);
            this.sendMessageToTab(request.tabId, {
              type: 'CAPTURE_ERROR',
              error: request.error
            });
          }
          sendResponse({ success: true });
          break;

        case 'MIC_PERMISSION_DENIED':
          this.isCapturing = false;
          if (request.tabId) {
            this.captureState.set(request.tabId, false);
            this.activeStreams.delete(request.tabId);
            this.sendMessageToTab(request.tabId, {
              type: 'MIC_PERMISSION_DENIED',
              error: request.error
            });
          }
          sendResponse({ success: true });
          break;

        case 'NEW_SUBTITLE':
          if (request.tabId) {
            this.sendMessageToTab(request.tabId, {
              type: 'NEW_SUBTITLE',
              data: request.data
            });
          }
          sendResponse({ success: true });
          break;

        case 'INTERIM_SUBTITLE':
          if (request.tabId) {
            this.sendMessageToTab(request.tabId, {
              type: 'INTERIM_SUBTITLE',
              data: request.data
            });
          }
          sendResponse({ success: true });
          break;

        case 'TRANSCRIPTION_ERROR':
          if (request.tabId) {
            this.sendMessageToTab(request.tabId, {
              type: 'TRANSCRIPTION_ERROR',
              error: request.error
            });
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async sendMessageToOffscreen(message) {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error('Failed to send message to offscreen:', error);
    }
  }


  async stopCapture() {
    if (this.offscreenDocumentCreated) {
      this.sendMessageToOffscreen({
        type: 'STOP_RECOGNITION'
      });
    }
    
    this.isCapturing = false;
    if (this.currentTabId) {
      this.activeStreams.delete(this.currentTabId);
    }
    this.currentTabId = null;
  }

  async createOffscreenDocument() {
    try {
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });

      if (existingContexts.length > 0) {
        this.offscreenDocumentCreated = true;
        return;
      }

      // Create offscreen document
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Processing tab audio for speech recognition'
      });

      this.offscreenDocumentCreated = true;
      console.log('Offscreen document created');

    } catch (error) {
      console.error('Failed to create offscreen document:', error);
      throw error;
    }
  }

  async closeOffscreenDocument() {
    try {
      if (this.offscreenDocumentCreated) {
        await chrome.offscreen.closeDocument();
        this.offscreenDocumentCreated = false;
        console.log('Offscreen document closed');
      }
    } catch (error) {
      console.error('Failed to close offscreen document:', error);
    }
  }
}

// Initialize background controller
const backgroundController = new BackgroundController();

// Clean up offscreen document when extension is disabled/unloaded
if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    backgroundController.closeOffscreenDocument();
  });
}