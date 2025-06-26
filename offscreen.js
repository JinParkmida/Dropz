// Offscreen document for persistent audio processing and speech recognition
class OffscreenAudioProcessor {
  constructor() {
    this.isCapturing = false;
    this.audioContext = null;
    this.stream = null;
    this.recognition = null;
    this.currentTabId = null;
    this.restartTimeout = null;
    this.settings = {
      translationService: 'google',
      language: 'ko-en',
      sensitivity: 0.7,
      continuous: true,
      interimResults: true,
      apiKey: ''
    };
    
    this.init();
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open
    });
    
    console.log('Offscreen audio processor initialized');
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case 'START_RECOGNITION':
          // Use the streamId-based method (correct approach)
          await this.startRecognition(request.streamId, request.tabId, request.settings);
          sendResponse({ success: true });
          break;
          
        case 'STOP_RECOGNITION':
          this.stopRecognition();
          sendResponse({ success: true });
          break;
          
        case 'UPDATE_SETTINGS':
          this.settings = { ...this.settings, ...request.settings };
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error in offscreen message handler:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async startRecognition(streamId, tabId, settings = {}) {
    try {
      this.currentTabId = tabId;
      this.settings = { ...this.settings, ...settings };
      
      // CRITICAL FIX: Use getUserMedia with chromeMediaSource to get tab audio
      // This is the correct way that doesn't trigger microphone permissions
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });

      if (!this.stream) {
        throw new Error('Failed to get media stream');
      }

      // CRITICAL: Create audio context and connect to destination to prevent muting
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      
      // Connect source directly to destination to maintain audio playback
      source.connect(this.audioContext.destination);

      // Apply audio processing for better speech recognition
      this.applyAudioProcessing(source, this.audioContext.destination);

      // Set up speech recognition
      this.setupSpeechRecognition();
      this.isCapturing = true;
      
      // Notify background script of success
      chrome.runtime.sendMessage({
        type: 'RECOGNITION_STARTED',
        tabId: this.currentTabId
      }).catch(error => {
        console.error('Failed to notify recognition started:', error);
      });

    } catch (error) {
      console.error('Recognition start failed:', error);
      
      chrome.runtime.sendMessage({
        type: 'RECOGNITION_ERROR',
        tabId: this.currentTabId,
        error: error.message
      }).catch(err => {
        console.error('Failed to send error message:', err);
      });
    }
  }

  applyAudioProcessing(source, destination) {
    try {
      // Create audio processing nodes for better speech recognition
      const gainNode = this.audioContext.createGain();
      const filterNode = this.audioContext.createBiquadFilter();
      
      // Configure noise reduction filter
      filterNode.type = 'highpass';
      filterNode.frequency.setValueAtTime(80, this.audioContext.currentTime);
      
      // Configure gain for voice enhancement
      gainNode.gain.setValueAtTime(1.5, this.audioContext.currentTime);
      
      // Connect processing chain: source -> filter -> gain -> destination
      source.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(destination);
    } catch (error) {
      console.error('Audio processing setup failed:', error);
      // Continue without audio processing if it fails
      source.connect(destination);
    }
  }

  setupSpeechRecognition() {
    // Check if Web Speech API is available
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Web Speech API not supported');
    }

    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    // Configure recognition settings
    this.recognition.continuous = this.settings.continuous;
    this.recognition.interimResults = this.settings.interimResults;
    this.recognition.lang = 'ko-KR'; // Korean language
    this.recognition.maxAlternatives = 1;

    // Handle recognition results
    this.recognition.onresult = (event) => {
      this.handleRecognitionResult(event);
    };

    // Handle recognition errors
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'no-speech' && this.isCapturing) {
        // Only restart for recoverable errors
        this.scheduleRestart();
      } else if (event.error === 'audio-capture') {
        console.warn('Audio capture error - not restarting');
      } else {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_ERROR',
          tabId: this.currentTabId,
          error: `Speech recognition error: ${event.error}`
        }).catch(err => {
          console.error('Failed to send transcription error:', err);
        });
      }
    };

    // Handle recognition end
    this.recognition.onend = () => {
      if (this.isCapturing) {
        // Restart recognition to maintain continuous capture
        this.scheduleRestart();
      }
    };

    // Start recognition with delay to prevent race conditions
    setTimeout(() => {
      if (this.isCapturing) {
        try {
          this.recognition.start();
        } catch (error) {
          console.error('Failed to start recognition:', error);
          throw error;
        }
      }
    }, 100);
  }

  scheduleRestart() {
    // Clear any existing restart timeout
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    // Schedule restart with a small delay to prevent race conditions
    this.restartTimeout = setTimeout(() => {
      if (this.isCapturing && this.recognition) {
        try {
          this.recognition.start();
        } catch (error) {
          console.error('Failed to restart recognition:', error);
          // If restart fails, try again after a longer delay
          if (this.isCapturing) {
            setTimeout(() => {
              if (this.isCapturing) {
                try {
                  this.recognition.start();
                } catch (e) {
                  console.error('Second restart attempt failed:', e);
                }
              }
            }, 1000);
          }
        }
      }
    }, 200);
  }

  handleRecognitionResult(event) {
    let finalTranscript = '';
    let interimTranscript = '';

    // Process recognition results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // Process final results
    if (finalTranscript.trim()) {
      this.processTranscription(finalTranscript.trim());
    }

    // Show interim results for better user experience
    if (interimTranscript.trim() && this.settings.interimResults) {
      chrome.runtime.sendMessage({
        type: 'INTERIM_SUBTITLE',
        tabId: this.currentTabId,
        data: {
          original: interimTranscript.trim(),
          translated: '...',
          timestamp: Date.now(),
          interim: true
        }
      }).catch(error => {
        console.error('Failed to send interim subtitle:', error);
      });
    }
  }

  async processTranscription(koreanText) {
    try {
      // Translate the transcribed Korean text
      const translation = await this.translateText(koreanText);
      
      // Send subtitle data to background script
      chrome.runtime.sendMessage({
        type: 'NEW_SUBTITLE',
        tabId: this.currentTabId,
        data: {
          original: koreanText,
          translated: translation,
          timestamp: Date.now(),
          interim: false
        }
      }).catch(error => {
        console.error('Failed to send subtitle:', error);
      });

    } catch (error) {
      console.error('Translation error:', error);
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_ERROR',
        tabId: this.currentTabId,
        error: error.message
      }).catch(err => {
        console.error('Failed to send transcription error:', err);
      });
    }
  }

  async translateText(text) {
    try {
      if (this.settings.translationService === 'google') {
        return await this.translateWithGoogle(text);
      } else if (this.settings.translationService === 'openai') {
        return await this.translateWithOpenAI(text);
      } else {
        return text;
      }
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    }
  }

  async translateWithGoogle(text) {
    try {
      const encodedText = encodeURIComponent(text);
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=${encodedText}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Google Translate request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        return data[0][0][0];
      } else {
        throw new Error('Invalid response format from Google Translate');
      }
    } catch (error) {
      console.error('Google Translate error:', error);
      throw error;
    }
  }

  async translateWithOpenAI(text) {
    if (!this.settings.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.settings.translationModel || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a professional Korean to English translator. Translate the following Korean text to natural, fluent English. Only return the translation, no explanations.'
            },
            {
              role: 'user',
              content: text
            }
          ],
          max_tokens: 200,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI translation error:', error);
      throw error;
    }
  }

  stopRecognition() {
    this.isCapturing = false;
    
    // Clear restart timeout
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    
    // Stop speech recognition
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      this.recognition = null;
    }
    
    // Close audio context to clean up resources
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
      this.audioContext = null;
    }
    
    // Stop media stream
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Error stopping media stream:', error);
      }
      this.stream = null;
    }

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'RECOGNITION_STOPPED',
      tabId: this.currentTabId
    }).catch(error => {
      console.error('Failed to notify recognition stopped:', error);
    });
  }
}

// Initialize the offscreen audio processor
new OffscreenAudioProcessor();