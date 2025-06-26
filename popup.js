// Popup script for extension controls
class PopupController {
  constructor() {
    this.isCapturing = false;
    this.supportsSpeechRecognition = false;
    this.currentTabId = null;
    this.settings = {
      translationService: 'google',
      fontSize: 16,
      position: 'bottom',
      showOriginal: false,
      autoHide: true,
      apiKey: ''
    };
    
    this.init();
  }

  async init() {
    // Get current tab
    await this.getCurrentTab();
    
    // Load settings
    await this.loadSettings();
    
    // Initialize UI
    this.initializeUI();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Check current status
    this.checkStatus();
    
    // Check browser compatibility
    this.checkBrowserCompatibility();

    // Listen for permission errors from background or content scripts
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'MIC_PERMISSION_DENIED') {
        this.showError('Microphone access is required to use captions. Please allow access and try again.');
      }
    });

    // Update UI based on settings
    this.updateUI();
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTabId = tab?.id;
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  }

  async loadSettings() {
    const stored = await chrome.storage.sync.get(['settings', 'subtitleSettings']);
    
    if (stored.settings) {
      this.settings = { ...this.settings, ...stored.settings };
    }
    
    if (stored.subtitleSettings) {
      this.settings = { ...this.settings, ...stored.subtitleSettings };
    }
  }

  initializeUI() {
    // Set form values
    document.getElementById('apiKey').value = this.settings.apiKey || '';
    document.getElementById('translationService').value = this.settings.translationService || 'google';
    document.getElementById('fontSize').value = this.settings.fontSize || 16;
    document.getElementById('fontSizeValue').textContent = `${this.settings.fontSize || 16}px`;
    document.getElementById('position').value = this.settings.position || 'bottom';
    document.getElementById('showOriginal').checked = this.settings.showOriginal || false;
    document.getElementById('autoHide').checked = this.settings.autoHide !== false;
    
    // Update preview
    this.updatePreview();
  }

  setupEventListeners() {
    // Toggle button
    document.getElementById('toggleButton').addEventListener('click', () => {
      this.toggleCapture();
    });

    // Export button
    document.getElementById('exportButton').addEventListener('click', () => {
      this.exportSubtitles();
    });

    // Settings button
    document.getElementById('settingsButton').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // API settings
    document.getElementById('saveApiSettings').addEventListener('click', () => {
      this.saveApiSettings();
    });

    // Toggle API key visibility
    document.getElementById('toggleApiKey').addEventListener('click', () => {
      this.toggleApiKeyVisibility();
    });

    // Font size slider
    document.getElementById('fontSize').addEventListener('input', (e) => {
      document.getElementById('fontSizeValue').textContent = `${e.target.value}px`;
      this.updateSetting('fontSize', parseInt(e.target.value));
    });

    // Position selector
    document.getElementById('position').addEventListener('change', (e) => {
      this.updateSetting('position', e.target.value);
    });

    // Show original checkbox - FIXED
    document.getElementById('showOriginal').addEventListener('change', (e) => {
      console.log('Show original changed:', e.target.checked);
      this.updateSetting('showOriginal', e.target.checked);
      this.updatePreview(); // Update preview immediately
    });

    // Auto-hide checkbox - FIXED
    document.getElementById('autoHide').addEventListener('change', (e) => {
      console.log('Auto hide changed:', e.target.checked);
      this.updateSetting('autoHide', e.target.checked);
    });

    // Translation service
    document.getElementById('translationService').addEventListener('change', (e) => {
      this.updateSetting('translationService', e.target.value);
      this.updateTranslationStatus();
    });

    // Help and feedback links
    document.getElementById('helpLink').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/your-repo/korean-subtitle-extension/wiki' });
    });

    document.getElementById('feedbackLink').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://github.com/your-repo/korean-subtitle-extension/issues' });
    });

    document.getElementById('showPremiumLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.togglePremiumSettings();
    });
  }

  async checkStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_STATUS',
        tabId: this.currentTabId 
      });
      
      this.isCapturing = response.isCapturing;
      this.supportsSpeechRecognition = response.supportsSpeechRecognition;
      this.updateStatusUI();
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  }

  checkBrowserCompatibility() {
    const browserStatus = document.getElementById('browserStatus');
    
    // The actual check will be done in the offscreen document
    // For now, assume Chrome supports it
    if (navigator.userAgent.includes('Chrome')) {
      browserStatus.textContent = '✓ Supported';
      browserStatus.style.color = '#38a169';
      this.supportsSpeechRecognition = true;
    } else {
      browserStatus.textContent = '⚠ Limited Support';
      browserStatus.style.color = '#f56500';
      this.supportsSpeechRecognition = false;
    }
  }

  updateStatusUI() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    const toggleButton = document.getElementById('toggleButton');
    const exportButton = document.getElementById('exportButton');

    if (this.isCapturing) {
      statusDot.classList.add('active');
      statusText.textContent = 'Active';
      toggleButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
        </svg>
        <span>Stop Capturing</span>
      `;
      toggleButton.classList.add('active');
      exportButton.disabled = false;
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = 'Inactive';
      toggleButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <polygon points="10,8 16,12 10,16" fill="currentColor"/>
        </svg>
        <span>Start Capturing</span>
      `;
      toggleButton.classList.remove('active');
    }

    // Enable/disable toggle button based on browser support
    toggleButton.disabled = !this.supportsSpeechRecognition;
    
    if (!this.supportsSpeechRecognition) {
      toggleButton.title = 'Web Speech API not supported in this browser';
    } else {
      toggleButton.title = '';
    }
  }

  updateTranslationStatus() {
    const translationStatus = document.getElementById('translationStatus');
    const service = document.getElementById('translationService').value;
    
    if (service === 'google') {
      translationStatus.textContent = 'Google Translate (Free)';
      translationStatus.className = 'status-free';
    } else if (service === 'openai') {
      translationStatus.textContent = 'OpenAI GPT (Premium)';
      translationStatus.className = 'status-premium';
    }
  }

  async toggleCapture() {
    try {
      if (this.isCapturing) {
        await chrome.runtime.sendMessage({ 
          type: 'STOP_CAPTURE',
          tabId: this.currentTabId 
        });
        this.isCapturing = false;
      } else {
        await chrome.runtime.sendMessage({ 
          type: 'START_CAPTURE',
          tabId: this.currentTabId 
        });
        this.isCapturing = true;
      }
      
      this.updateStatusUI();
    } catch (error) {
      console.error('Failed to toggle capture:', error);
      this.showError('Failed to toggle capture. Please try again.');
    }
  }

  async exportSubtitles() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'EXPORT_SUBTITLES' });
    } catch (error) {
      console.error('Failed to export subtitles:', error);
      this.showError('Failed to export subtitles. Please try again.');
    }
  }

  async saveApiSettings() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const translationService = document.getElementById('translationService').value;

    // API key is optional now
    this.settings.apiKey = apiKey;
    this.settings.translationService = translationService;

    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: {
          apiKey: apiKey,
          translationService: translationService
        }
      });

      this.updateTranslationStatus();
      this.showSuccess('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save API settings:', error);
      this.showError('Failed to save settings. Please try again.');
    }
  }

  toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('apiKey');
    const toggleButton = document.getElementById('toggleApiKey');
    
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C7 20 2.73 16.39 1 12A18.45 18.45 0 0 1 5.06 5.06M9.9 4.24A9.12 9.12 0 0 1 12 4C17 4 21.27 7.61 23 12A18.5 18.5 0 0 1 19.42 16.42" stroke="currentColor" stroke-width="2"/>
          <path d="M1 1L23 23" stroke="currentColor" stroke-width="2"/>
          <path d="M10.35 10.35A4 4 0 0 0 14.65 14.65" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
    } else {
      apiKeyInput.type = 'password';
      toggleButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 12S5 4 12 4S23 12 23 12S19 20 12 20S1 12 1 12Z" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
    }
  }

  togglePremiumSettings() {
    const apiConfig = document.getElementById('apiConfig');
    const link = document.getElementById('showPremiumLink');
    
    if (apiConfig.style.display === 'none') {
      apiConfig.style.display = 'block';
      link.textContent = 'Hide Premium Features';
    } else {
      apiConfig.style.display = 'none';
      link.textContent = 'Premium Features';
    }
  }

  async updateSetting(key, value) {
    console.log(`Updating setting ${key} to:`, value);
    this.settings[key] = value;
    
    // Update preview immediately
    this.updatePreview();
    
    // Save settings to storage
    try {
      await chrome.storage.sync.set({ subtitleSettings: this.settings });
      console.log('Settings saved to storage');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
    
    // Send to content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_SUBTITLE_SETTINGS',
        settings: this.settings
      });
      console.log('Settings sent to content script');
    } catch (error) {
      // Content script may not be loaded
      console.log('Content script not available');
    }
  }

  updatePreview() {
    const previewBox = document.querySelector('.preview-box');
    const originalText = document.querySelector('.preview-subtitle .original-text');
    const translatedText = document.querySelector('.preview-subtitle .translated-text');
    
    if (!originalText || !translatedText) return;
    
    // Update font size
    translatedText.style.fontSize = `${this.settings.fontSize}px`;
    originalText.style.fontSize = `${Math.max(12, this.settings.fontSize - 2)}px`;
    
    // Show/hide original text based on setting
    console.log('Updating preview - showOriginal:', this.settings.showOriginal);
    originalText.style.display = this.settings.showOriginal ? 'block' : 'none';
    
    // Update position (visual indication)
    if (previewBox) {
      previewBox.style.textAlign = this.settings.position === 'top' ? 'left' : 
                                    this.settings.position === 'middle' ? 'center' : 'right';
    }
  }

  updateUI() {
    // Update translation status
    this.updateTranslationStatus();
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      left: 10px;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      z-index: 1000;
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      ${type === 'error' ? 'background: #fed7d7; color: #c53030; border: 1px solid #feb2b2;' : 
                           'background: #c6f6d5; color: #2f855a; border: 1px solid #9ae6b4;'}
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});