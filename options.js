// Options page script
class OptionsController {
  constructor() {
    this.settings = {
      // Translation settings
      translationProvider: 'google',
      translationModel: 'gpt-3.5-turbo',
      openaiApiKey: '',
      continuousRecognition: true,
      interimResults: true,
      
      // Display settings
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: '600',
      fontColor: '#ffffff',
      backgroundColor: '#000000',
      backgroundOpacity: 80,
      borderRadius: 4,
      position: 'bottom',
      horizontalAlign: 'center',
      marginOffset: 20,
      showOriginal: false,
      autoHide: true,
      autoHideDuration: 3,
      showInterimResults: true,
      
      // Performance settings
      sensitivity: 0.7,
      noiseReduction: true,
      voiceEnhancement: true,
      maxAlternatives: 1,
      cacheTranslations: true,
      maxCacheSize: 100
    };
    
    this.stats = {
      totalTranslations: 0,
      totalMinutes: 0,
      apiCalls: 0,
      cacheHits: 0
    };
    
    this.init();
  }

  async init() {
    // Load settings and stats
    await this.loadSettings();
    await this.loadStats();
    
    // Initialize UI
    this.initializeUI();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Update displays
    this.updateAllDisplays();
    
    // Update preview
    this.updatePreview();
    
    // Check browser compatibility
    this.checkBrowserCompatibility();
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

  async loadStats() {
    const stored = await chrome.storage.local.get(['stats']);
    if (stored.stats) {
      this.stats = { ...this.stats, ...stored.stats };
    }
  }

  initializeUI() {
    // Set all form values from settings
    Object.keys(this.settings).forEach(key => {
      const element = document.getElementById(key) || document.getElementById(key.replace(/([A-Z])/g, $1 => $1.toLowerCase()));
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = this.settings[key];
        } else if (element.type === 'color') {
          element.value = this.settings[key];
        } else {
          element.value = this.settings[key];
        }
      }
    });
    
    // Update stats display
    Object.keys(this.stats).forEach(key => {
      const element = document.getElementById(key);
      if (element) {
        element.textContent = this.formatStatValue(key, this.stats[key]);
      }
    });
    
    // Set last updated date
    document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString();
    
    // Show/hide OpenAI settings based on provider
    this.toggleOpenAISettings();
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Form inputs
    this.setupFormListeners();
    
    // Range input displays
    this.setupRangeDisplays();
    
    // Action buttons
    this.setupActionButtons();
    
    // Translation provider change
    document.getElementById('translationProvider').addEventListener('change', () => {
      this.toggleOpenAISettings();
    });
  }

  setupFormListeners() {
    // Translation settings
    ['translationProvider', 'translationModel', 'openaiApiKey', 
     'continuousRecognition', 'interimResults'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', (e) => {
          const value = element.type === 'checkbox' ? e.target.checked : e.target.value;
          this.updateSetting(id, value);
        });
      }
    });

    // Display settings
    ['fontFamily', 'displayFontSize', 'fontWeight', 'fontColor', 'backgroundColor',
     'backgroundOpacity', 'borderRadius', 'displayPosition', 'horizontalAlign',
     'marginOffset', 'displayShowOriginal', 'displayAutoHide', 'autoHideDuration',
     'showInterimResults'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        const eventType = element.type === 'range' ? 'input' : 'change';
        element.addEventListener(eventType, (e) => {
          const settingKey = id.replace('display', '').replace(/^./, str => str.toLowerCase());
          const value = element.type === 'checkbox' ? e.target.checked : 
                       element.type === 'range' ? parseFloat(e.target.value) : e.target.value;
          this.updateSetting(settingKey, value);
          this.updatePreview();
        });
      }
    });

    // Performance settings
    ['sensitivity', 'noiseReduction', 'voiceEnhancement', 'maxAlternatives',
     'cacheTranslations', 'maxCacheSize'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        const eventType = element.type === 'range' ? 'input' : 'change';
        element.addEventListener(eventType, (e) => {
          const value = element.type === 'checkbox' ? e.target.checked :
                       element.type === 'range' ? parseFloat(e.target.value) : e.target.value;
          this.updateSetting(id, value);
        });
      }
    });
  }

  setupRangeDisplays() {
    const rangeDisplays = [
      { input: 'displayFontSize', display: 'fontSizeDisplay', suffix: 'px' },
      { input: 'backgroundOpacity', display: 'opacityDisplay', suffix: '%' },
      { input: 'borderRadius', display: 'radiusDisplay', suffix: 'px' },
      { input: 'marginOffset', display: 'marginDisplay', suffix: 'px' },
      { input: 'autoHideDuration', display: 'durationDisplay', suffix: 's' },
      { input: 'sensitivity', display: 'sensitivityDisplay', suffix: '' },
      { input: 'maxAlternatives', display: 'alternativesDisplay', suffix: '' },
      { input: 'maxCacheSize', display: 'cacheDisplay', suffix: 'MB' }
    ];

    rangeDisplays.forEach(({ input, display, suffix }) => {
      const inputElement = document.getElementById(input);
      const displayElement = document.getElementById(display);
      
      if (inputElement && displayElement) {
        inputElement.addEventListener('input', () => {
          displayElement.textContent = inputElement.value + suffix;
        });
      }
    });
  }

  setupActionButtons() {
    // Save settings
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveAllSettings();
    });

    // Reset to defaults
    document.getElementById('resetToDefaults').addEventListener('click', () => {
      this.resetToDefaults();
    });

    // Export/Import settings
    document.getElementById('exportSettings').addEventListener('click', () => {
      this.exportSettings();
    });

    document.getElementById('importSettings').addEventListener('click', () => {
      document.getElementById('settingsFileInput').click();
    });

    document.getElementById('settingsFileInput').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });

    // Reset all settings
    document.getElementById('resetSettings').addEventListener('click', () => {
      this.resetAllSettings();
    });

    // Support buttons
    document.getElementById('reportIssue').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/your-repo/korean-subtitle-extension/issues/new' });
    });

    document.getElementById('requestFeature').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/your-repo/korean-subtitle-extension/issues/new?template=feature_request.md' });
    });

    document.getElementById('viewDocs').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/your-repo/korean-subtitle-extension/wiki' });
    });
  }

  toggleOpenAISettings() {
    const provider = document.getElementById('translationProvider').value;
    const openaiSettings = document.getElementById('openaiSettings');
    
    if (provider === 'openai') {
      openaiSettings.style.display = 'block';
    } else {
      openaiSettings.style.display = 'none';
    }
  }

  switchTab(tabName) {
    // Update nav buttons
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    this.debouncedSave();
  }

  debouncedSave = this.debounce(() => {
    this.saveAllSettings();
  }, 1000);

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  async saveAllSettings() {
    try {
      // Split settings into appropriate storage areas
      const apiSettings = {
        translationService: this.settings.translationProvider,
        translationModel: this.settings.translationModel,
        apiKey: this.settings.openaiApiKey,
        sensitivity: this.settings.sensitivity,
        continuous: this.settings.continuousRecognition,
        interimResults: this.settings.interimResults
      };

      const displaySettings = {
        fontSize: this.settings.fontSize,
        fontFamily: this.settings.fontFamily,
        fontWeight: this.settings.fontWeight,
        fontColor: this.settings.fontColor,
        backgroundColor: this.settings.backgroundColor,
        backgroundOpacity: this.settings.backgroundOpacity,
        borderRadius: this.settings.borderRadius,
        position: this.settings.position,
        horizontalAlign: this.settings.horizontalAlign,
        marginOffset: this.settings.marginOffset,
        showOriginal: this.settings.showOriginal,
        autoHide: this.settings.autoHide,
        autoHideDuration: this.settings.autoHideDuration,
        showInterim: this.settings.showInterimResults
      };

      // Save to storage
      await chrome.storage.sync.set({
        settings: apiSettings,
        subtitleSettings: displaySettings
      });

      // Update background script
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: apiSettings
      });

      this.showSaveStatus('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showSaveStatus('Failed to save settings', 'error');
    }
  }

  async resetToDefaults() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    // Reset to default values
    this.settings = {
      translationProvider: 'google',
      translationModel: 'gpt-3.5-turbo',
      openaiApiKey: '',
      continuousRecognition: true,
      interimResults: true,
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: '600',
      fontColor: '#ffffff',
      backgroundColor: '#000000',
      backgroundOpacity: 80,
      borderRadius: 4,
      position: 'bottom',
      horizontalAlign: 'center',
      marginOffset: 20,
      showOriginal: false,
      autoHide: true,
      autoHideDuration: 3,
      showInterimResults: true,
      sensitivity: 0.7,
      noiseReduction: true,
      voiceEnhancement: true,
      maxAlternatives: 1,
      cacheTranslations: true,
      maxCacheSize: 100
    };

    this.initializeUI();
    this.updateAllDisplays();
    this.updatePreview();
    await this.saveAllSettings();
  }

  exportSettings() {
    const settingsData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      settings: this.settings
    };

    const blob = new Blob([JSON.stringify(settingsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `korean-subtitle-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importSettings(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.settings) {
        this.settings = { ...this.settings, ...data.settings };
        this.initializeUI();
        this.updateAllDisplays();
        this.updatePreview();
        await this.saveAllSettings();
        this.showSaveStatus('Settings imported successfully!', 'success');
      } else {
        throw new Error('Invalid settings file format');
      }
    } catch (error) {
      console.error('Failed to import settings:', error);
      this.showSaveStatus('Failed to import settings', 'error');
    }
  }

  async resetAllSettings() {
    if (!confirm('This will permanently delete all settings and data. Are you sure?')) {
      return;
    }

    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      // Reset stats
      this.stats = {
        totalTranslations: 0,
        totalMinutes: 0,
        apiCalls: 0,
        cacheHits: 0
      };
      
      await this.resetToDefaults();
      this.showSaveStatus('All settings reset successfully!', 'success');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showSaveStatus('Failed to reset settings', 'error');
    }
  }

  updateAllDisplays() {
    // Update all range displays
    const displays = [
      { id: 'displayFontSize', display: 'fontSizeDisplay', suffix: 'px' },
      { id: 'backgroundOpacity', display: 'opacityDisplay', suffix: '%' },
      { id: 'borderRadius', display: 'radiusDisplay', suffix: 'px' },
      { id: 'marginOffset', display: 'marginDisplay', suffix: 'px' },
      { id: 'autoHideDuration', display: 'durationDisplay', suffix: 's' },
      { id: 'sensitivity', display: 'sensitivityDisplay', suffix: '' },
      { id: 'maxAlternatives', display: 'alternativesDisplay', suffix: '' },
      { id: 'maxCacheSize', display: 'cacheDisplay', suffix: 'MB' }
    ];

    displays.forEach(({ id, display, suffix }) => {
      const input = document.getElementById(id);
      const displayElement = document.getElementById(display);
      if (input && displayElement) {
        displayElement.textContent = input.value + suffix;
      }
    });
  }

  updatePreview() {
    const preview = document.getElementById('previewSubtitle');
    if (!preview) return;

    const originalText = preview.querySelector('.original-text');
    const translatedText = preview.querySelector('.translated-text');

    // Apply current settings
    preview.style.fontFamily = this.settings.fontFamily;
    preview.style.color = this.settings.fontColor;
    preview.style.backgroundColor = this.hexToRgba(this.settings.backgroundColor, this.settings.backgroundOpacity / 100);
    preview.style.borderRadius = `${this.settings.borderRadius}px`;
    preview.style.fontWeight = this.settings.fontWeight;

    translatedText.style.fontSize = `${this.settings.fontSize}px`;
    originalText.style.fontSize = `${Math.max(12, this.settings.fontSize - 2)}px`;
    
    // Show/hide original text
    originalText.style.display = this.settings.showOriginal ? 'block' : 'none';

    // Position (simulate with alignment)
    const container = preview.parentElement;
    container.style.justifyContent = this.settings.horizontalAlign === 'left' ? 'flex-start' :
                                    this.settings.horizontalAlign === 'right' ? 'flex-end' : 'center';
    
    // Position vertically
    container.style.alignItems = this.settings.position === 'top' ? 'flex-start' :
                                this.settings.position === 'middle' ? 'center' : 'flex-end';
  }

  checkBrowserCompatibility() {
    // Check Web Speech API
    const speechApiStatus = document.getElementById('speechApiStatus');
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      speechApiStatus.textContent = '✓ Supported';
      speechApiStatus.style.color = '#38a169';
    } else {
      speechApiStatus.textContent = '✗ Not Supported';
      speechApiStatus.style.color = '#e53e3e';
    }

    // Check Audio Context
    const audioContextStatus = document.getElementById('audioContextStatus');
    if ('AudioContext' in window || 'webkitAudioContext' in window) {
      audioContextStatus.textContent = '✓ Supported';
      audioContextStatus.style.color = '#38a169';
    } else {
      audioContextStatus.textContent = '✗ Not Supported';
      audioContextStatus.style.color = '#e53e3e';
    }

    // Check Media Stream
    const mediaStreamStatus = document.getElementById('mediaStreamStatus');
    if ('MediaStream' in window && 'getUserMedia' in navigator.mediaDevices) {
      mediaStreamStatus.textContent = '✓ Supported';
      mediaStreamStatus.style.color = '#38a169';
    } else {
      mediaStreamStatus.textContent = '✗ Not Supported';
      mediaStreamStatus.style.color = '#e53e3e';
    }
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  formatStatValue(key, value) {
    switch (key) {
      case 'totalMinutes':
        return Math.round(value);
      case 'totalTranslations':
      case 'apiCalls':
      case 'cacheHits':
        return value.toLocaleString();
      default:
        return value;
    }
  }

  showSaveStatus(message, type) {
    const statusElement = document.getElementById('saveStatus');
    statusElement.textContent = message;
    statusElement.className = `save-status ${type}`;
    
    setTimeout(() => {
      statusElement.style.opacity = '0';
    }, 3000);
  }
}

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});