/**
 * ermis-classroom-sdk v1.0.0
 * Ermis Classroom SDK for virtual classroom and meeting integration
 * 
 * @author Ermis Team <dev@ermis.network>
 * @license MIT
 * @homepage https://github.com/ermis-network/classroom-sdk#readme
 */
/**
 * Base EventEmitter class for handling events across the SDK
 */
class EventEmitter {
  constructor() {
    this._events = new Map();
  }
  on(event, listener) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event).push(listener);
    return this;
  }
  off(event, listener) {
    if (!this._events.has(event)) return this;
    const listeners = this._events.get(event);
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
    if (listeners.length === 0) {
      this._events.delete(event);
    }
    return this;
  }
  emit(event, ...args) {
    if (!this._events.has(event)) return false;
    const listeners = this._events.get(event);
    listeners.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
    return true;
  }
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }
  removeAllListeners(event) {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
    return this;
  }
  listenerCount(event) {
    return this._events.has(event) ? this._events.get(event).length : 0;
  }
}
var EventEmitter$1 = EventEmitter;

/**
 * API Client for handling HTTP requests to Ermis Meeting API
 */
class ApiClient {
  constructor(config) {
    this.host = config.host || "daibo.ermis.network:9999";
    this.apiBaseUrl = config.apiUrl || `https://${this.host}/meeting`;
    this.jwtToken = null;
    this.userId = null;
  }

  /**
   * Set authentication token and user ID
   */
  setAuth(token, userId) {
    this.jwtToken = token;
    this.userId = userId;
  }

  /**
   * Generic API call method
   */
  async apiCall(endpoint, method = "GET", body = null) {
    if (!this.userId) {
      throw new Error("Please authenticate first");
    }
    if (!this.jwtToken) {
      throw new Error("JWT token not found");
    }
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${this.jwtToken}`,
        "Content-Type": "application/json"
      }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("API call failed:", error);
      throw error;
    }
  }

  /**
   * Get dummy token for authentication
   */
  async getDummyToken(userId) {
    const endpoint = "/get-token";
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sub: userId
      })
    };
    try {
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Token request failed:", error);
      throw error;
    }
  }

  /**
   * Create a new room
   */
  async createRoom(roomName, roomType = "main") {
    return await this.apiCall("/rooms", "POST", {
      room_name: roomName,
      room_type: roomType
    });
  }

  /**
   * List available rooms
   */
  async listRooms(page = 1, perPage = 20) {
    return await this.apiCall("/rooms/list", "POST", {
      list_query: {
        page,
        per_page: perPage,
        sort_by: "created_at",
        sort_order: "desc"
      },
      conditions: {
        is_active: true
      }
    });
  }

  /**
   * Get room details by ID
   */
  async getRoomById(roomId) {
    return await this.apiCall(`/rooms/${roomId}`);
  }

  /**
   * Join a room by room code
   */
  async joinRoom(roomCode, appName = "Ermis-Meeting") {
    return await this.apiCall("/rooms/join", "POST", {
      room_code: roomCode,
      app_name: appName
    });
  }

  /**
   * Create a sub room
   */
  async createSubRoom(parentRoomId, subRoomName, subRoomType = "breakout") {
    return await this.apiCall("/rooms", "POST", {
      room_name: subRoomName,
      room_type: subRoomType,
      parent_room_id: parentRoomId
    });
  }

  /**
   * Get sub rooms of a parent room
   */
  async getSubRooms(parentRoomId) {
    return await this.apiCall(`/rooms/${parentRoomId}/sub-rooms`);
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId, membershipId) {
    return await this.apiCall(`/rooms/${roomId}/members/${membershipId}`, "DELETE");
  }

  /**
   * Switch to sub room
   */
  async switchToSubRoom(roomId, subRoomCode) {
    return await this.apiCall("/rooms/switch", "POST", {
      room_id: roomId,
      sub_room_code: subRoomCode
    });
  }

  /**
   * Get room members
   */
  async getRoomMembers(roomId) {
    return await this.apiCall(`/rooms/${roomId}/members`);
  }

  /**
   * Update room settings
   */
  async updateRoom(roomId, updates) {
    return await this.apiCall(`/rooms/${roomId}`, "PATCH", updates);
  }

  /**
   * Delete/Close room
   */
  async deleteRoom(roomId) {
    return await this.apiCall(`/rooms/${roomId}`, "DELETE");
  }
}
var ApiClient$1 = ApiClient;

/**
 * Represents a participant in a meeting room
 */
class Participant extends EventEmitter$1 {
  constructor(config) {
    super();
    this.userId = config.userId;
    this.streamId = config.streamId;
    this.membershipId = config.membershipId;
    this.role = config.role || "participant";
    this.roomId = config.roomId;
    this.isLocal = config.isLocal || false;

    // Media state
    this.isAudioEnabled = true;
    this.isVideoEnabled = true;
    this.isPinned = false;

    // Media components
    this.publisher = null;
    this.subscriber = null;
    this.videoElement = null;
    this.tile = null;

    // Status
    this.connectionStatus = "disconnected"; // 'connecting', 'connected', 'disconnected', 'failed'
  }

  /**
   * Get display name with role
   */
  getDisplayName() {
    const roleText = this.role === "owner" ? " (Host)" : "";
    const localText = this.isLocal ? " (You)" : "";
    return `${this.userId}${roleText}${localText}`;
  }

  /**
   * Create video tile DOM element
   */
  createVideoTile() {
    const tile = document.createElement("div");
    tile.className = "video-tile";
    tile.setAttribute("data-user-id", this.userId);
    tile.setAttribute("data-stream-id", this.streamId);
    if (this.isLocal) {
      tile.innerHTML = this._getLocalTileHTML();
    } else {
      tile.innerHTML = this._getRemoteTileHTML();
    }
    this.tile = tile;
    this.videoElement = tile.querySelector("video");
    this._setupTileEvents();
    this.emit("tileCreated", {
      participant: this,
      tile
    });
    return tile;
  }

  /**
   * Get HTML for local participant tile
   */
  _getLocalTileHTML() {
    return `
      <video autoplay playsinline style="transform: scaleX(-1);"></video>
      <div class="user-label">${this.getDisplayName()}</div>
      <div class="status">Connecting...</div>
      <div class="controls">
        <button class="mic-btn" id="micBtn-${this.streamId}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
        <button class="cam-btn" id="camBtn-${this.streamId}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        </button>
        <button class="pin-btn" id="pinBtn-${this.streamId}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/>
          </svg>
        </button>
      </div>
    `;
  }

  /**
   * Get HTML for remote participant tile
   */
  _getRemoteTileHTML() {
    return `
      <video autoplay muted playsinline style="transform: scaleX(-1);"></video>
      <div class="user-label">${this.getDisplayName()}</div>
      <div class="status">Connecting...</div>
      <div class="subscriber-controls">
        <button class="audio-btn" id="audioBtn-${this.streamId}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        </button>
        <button class="pin-btn" id="pinBtn-${this.streamId}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/>
          </svg>
        </button>
      </div>
    `;
  }

  /**
   * Setup event listeners for tile controls
   */
  _setupTileEvents() {
    if (!this.tile) return;
    if (this.isLocal) {
      this._setupLocalControls();
    } else {
      this._setupRemoteControls();
    }

    // Pin button
    const pinBtn = this.tile.querySelector(`#pinBtn-${this.streamId}`);
    pinBtn?.addEventListener("click", e => {
      e.stopPropagation();
      this.togglePin();
    });
  }

  /**
   * Setup controls for local participant
   */
  _setupLocalControls() {
    const micBtn = this.tile.querySelector(`#micBtn-${this.streamId}`);
    const camBtn = this.tile.querySelector(`#camBtn-${this.streamId}`);
    micBtn?.addEventListener("click", async () => {
      await this.toggleMicrophone();
    });
    camBtn?.addEventListener("click", async () => {
      await this.toggleCamera();
    });
  }

  /**
   * Setup controls for remote participant
   */
  _setupRemoteControls() {
    const audioBtn = this.tile.querySelector(`#audioBtn-${this.streamId}`);
    audioBtn?.addEventListener("click", async e => {
      e.stopPropagation();
      await this.toggleRemoteAudio();
    });
  }

  /**
   * Toggle microphone (local only)
   */
  async toggleMicrophone() {
    if (!this.isLocal || !this.publisher) return;
    try {
      await this.publisher.toggleMic();
      this.isAudioEnabled = !this.isAudioEnabled;
      this._updateMicButton();
      this.emit("audioToggled", {
        participant: this,
        enabled: this.isAudioEnabled
      });
    } catch (error) {
      this.emit("error", {
        participant: this,
        error,
        action: "toggleMicrophone"
      });
    }
  }

  /**
   * Toggle camera (local only)
   */
  async toggleCamera() {
    if (!this.isLocal || !this.publisher) return;
    try {
      await this.publisher.toggleCamera();
      this.isVideoEnabled = !this.isVideoEnabled;
      this._updateCamButton();
      this.emit("videoToggled", {
        participant: this,
        enabled: this.isVideoEnabled
      });
    } catch (error) {
      this.emit("error", {
        participant: this,
        error,
        action: "toggleCamera"
      });
    }
  }

  /**
   * Toggle remote participant's audio
   */
  async toggleRemoteAudio() {
    if (this.isLocal || !this.subscriber) return;
    try {
      await this.subscriber.toggleAudio();
      this.isAudioEnabled = !this.isAudioEnabled;
      this._updateRemoteAudioButton();
      this.emit("remoteAudioToggled", {
        participant: this,
        enabled: this.isAudioEnabled
      });
    } catch (error) {
      this.emit("error", {
        participant: this,
        error,
        action: "toggleRemoteAudio"
      });
    }
  }

  /**
   * Toggle pin status
   */
  togglePin() {
    this.isPinned = !this.isPinned;
    this.emit("pinToggled", {
      participant: this,
      pinned: this.isPinned
    });
  }

  /**
   * Update microphone button appearance
   */
  _updateMicButton() {
    const micBtn = this.tile?.querySelector(`#micBtn-${this.streamId}`);
    if (!micBtn) return;
    micBtn.classList.toggle("muted", !this.isAudioEnabled);
    micBtn.title = this.isAudioEnabled ? "Mute microphone" : "Unmute microphone";
    if (!this.isAudioEnabled) {
      micBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28z"/>
          <path d="M14.98 11.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99z"/>
          <path d="M4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c.57-.08 1.12-.23 1.64-.46l2.36 2.36L21 19.73 4.27 3z"/>
        </svg>
      `;
    } else {
      micBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      `;
    }
  }

  /**
   * Update camera button appearance
   */
  _updateCamButton() {
    const camBtn = this.tile?.querySelector(`#camBtn-${this.streamId}`);
    if (!camBtn) return;
    camBtn.classList.toggle("disabled", !this.isVideoEnabled);
    camBtn.title = this.isVideoEnabled ? "Turn off camera" : "Turn on camera";
    if (!this.isVideoEnabled) {
      camBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5z"/>
          <path d="M3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
        </svg>
      `;
    } else {
      camBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
        </svg>
      `;
    }
  }

  /**
   * Update remote audio button appearance
   */
  _updateRemoteAudioButton() {
    const audioBtn = this.tile?.querySelector(`#audioBtn-${this.streamId}`);
    if (!audioBtn) return;
    audioBtn.classList.toggle("muted", !this.isAudioEnabled);
    audioBtn.title = this.isAudioEnabled ? "Mute audio" : "Unmute audio";
    if (!this.isAudioEnabled) {
      audioBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63z"/>
          <path d="M19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/>
          <path d="M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3z"/>
          <path d="M12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
      `;
    } else {
      audioBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      `;
    }
  }

  /**
   * Update connection status
   */
  setConnectionStatus(status) {
    this.connectionStatus = status;
    this.emit("statusChanged", {
      participant: this,
      status
    });
    if (this.tile) {
      const statusDiv = this.tile.querySelector(".status");
      if (statusDiv) {
        statusDiv.textContent = this._getStatusText(status);
        statusDiv.className = `status ${status}`;
      }
    }
  }

  /**
   * Get status text for display
   */
  _getStatusText(status) {
    switch (status) {
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Connected";
      case "disconnected":
        return "Disconnected";
      case "failed":
        return "Connection Failed";
      default:
        return status;
    }
  }

  /**
   * Set publisher instance
   */
  setPublisher(publisher) {
    this.publisher = publisher;
    if (publisher) {
      this.setConnectionStatus("connected");
    }
  }

  /**
   * Set subscriber instance
   */
  setSubscriber(subscriber) {
    this.subscriber = subscriber;
    if (subscriber) {
      this.setConnectionStatus("connected");
    }
  }

  /**
   * Cleanup participant resources
   */
  cleanup() {
    // Stop media streams
    if (this.publisher) {
      this.publisher.stop();
      this.publisher = null;
    }
    if (this.subscriber) {
      this.subscriber.stop();
      this.subscriber = null;
    }

    // Remove DOM elements
    if (this.tile && this.tile.parentNode) {
      this.tile.parentNode.removeChild(this.tile);
    }
    this.videoElement = null;
    this.tile = null;
    this.setConnectionStatus("disconnected");
    this.removeAllListeners();
    this.emit("cleanup", {
      participant: this
    });
  }

  /**
   * Get participant info
   */
  getInfo() {
    return {
      userId: this.userId,
      streamId: this.streamId,
      membershipId: this.membershipId,
      role: this.role,
      isLocal: this.isLocal,
      isAudioEnabled: this.isAudioEnabled,
      isVideoEnabled: this.isVideoEnabled,
      isPinned: this.isPinned,
      connectionStatus: this.connectionStatus
    };
  }
}
var Participant$1 = Participant;

/**
 * WebRTC Publisher Class
 * Handles video/audio streaming via WebTransport
 */
class Publisher {
  constructor(options = {}) {
    // Validate required options
    if (!options.publishUrl) {
      throw new Error("publishUrl is required");
    }
    if (!options.videoElement) {
      throw new Error("videoElement is required");
    }

    // Configuration
    this.publishUrl = options.publishUrl;
    this.streamType = options.streamType || "camera"; // 'camera' or 'display'
    this.videoElement = options.videoElement;
    this.streamId = options.streamId || "test_stream";

    // Video configuration
    this.currentConfig = {
      // codec: "hev1.1.0.L90.b0",
      codec: "avc1.640c34",
      // codec: "avc1.42E01E",
      width: options.width || 1280,
      height: options.height || 720,
      framerate: options.framerate || 30,
      bitrate: options.bitrate || 1_500_000
    };

    // Audio configuration
    this.kSampleRate = 48000;
    this.opusBaseTime = 0;
    this.opusSamplesSent = 0;
    this.opusSamplesPerChunk = 960; // 20ms at 48kHz
    this.opusChunkCount = 0;

    // State variables
    this.stream = null;
    this.audioProcessor = null;
    this.videoProcessor = null;
    this.webTransport = null;
    this.webtransportWriter = null;
    this.webtransportReader = null;
    this.isChannelOpen = false;
    this.mediaConfigSent = false;
    this.videoMetadataReady = false;
    this.audioConfig = null;
    this.videoConfig = null;
    this.videoDescription = null;
    this.sequenceNumber = 0;
    this.isPublishing = false;
    this.cameraEnabled = true;
    this.micEnabled = true;

    // Callbacks
    this.onStatusUpdate = options.onStatusUpdate || ((message, isError) => console.log(message));
    this.onStreamStart = options.onStreamStart || (() => {});
    this.onStreamStop = options.onStreamStop || (() => {});

    // Initialize modules
    this.wasmInitialized = false;
    this.wasmInitializing = false;
    this.wasmInitPromise = null;
    this.initAudioRecorder = null;
    this.WasmEncoder = null;
    this.onServerEvent = options.onServerEvent || (event => {});

    // Video encoder
    this.videoEncoder = new VideoEncoder({
      output: this.handleVideoChunk.bind(this),
      error: e => this.onStatusUpdate(`Encoder error: ${e.message}`, true)
    });
  }
  async init() {
    await this.loadAllDependencies();
    this.onStatusUpdate("Publisher initialized successfully");
  }
  async loadAllDependencies() {
    try {
      if (!document.querySelector('script[src="../polyfills/MSTP_polyfill.js"]')) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "../polyfills/MSTP_polyfill.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load MSTP polyfill"));
          document.head.appendChild(script);
        });
        console.log("Polyfill loaded successfully");
      }
      if (!this.wasmInitialized) {
        if (this.wasmInitializing && this.wasmInitPromise) {
          await this.wasmInitPromise;
        } else {
          this.wasmInitializing = true;
          const {
            default: init,
            WasmEncoder
          } = await import('./raptorq_wasm-478134f9.js');
          this.WasmEncoder = WasmEncoder;
          this.wasmInitPromise = init("../raptorQ/raptorq_wasm_bg.wasm").then(() => {
            this.wasmInitialized = true;
            this.wasmInitializing = false;
            console.log("WASM encoder module loaded successfully");
          }).catch(err => {
            this.wasmInitializing = false;
            console.error("Failed to load WASM encoder module:", err);
            throw new Error("Failed to load WASM encoder module");
          });
          await this.wasmInitPromise;
        }
      }
      const opusModule = await import(`/opus_decoder/opusDecoder.js?t=${Date.now()}`);
      this.initAudioRecorder = opusModule.initAudioRecorder;
      console.log("Opus decoder module loaded successfully");
      this.onStatusUpdate("All dependencies loaded successfully");
    } catch (error) {
      this.onStatusUpdate(`Dependency loading error: ${error.message}`, true);
      throw error;
    }
  }
  async startPublishing() {
    if (this.isPublishing) {
      this.onStatusUpdate("Already publishing", true);
      return;
    }
    await this.init();

    // Setup WebTransport connection
    await this.setupConnection();
    try {
      // Get media stream based on type
      await this.getMediaStream();
      this.isPublishing = true;
      // Start streaming
      await this.startStreaming();
      this.onStreamStart();
      this.onStatusUpdate("Publishing started successfully");
    } catch (error) {
      this.onStatusUpdate(`Failed to start publishing: ${error.message}`, true);
      throw error;
    }
  }

  // Toggle camera
  toggleCamera() {
    if (this.cameraEnabled) {
      this.turnOffCamera();
    } else {
      this.turnOnCamera();
    }
  }

  // Toggle mic
  toggleMic() {
    if (this.micEnabled) {
      this.turnOffMic();
    } else {
      this.turnOnMic();
    }
  }

  // Turn off camera (stop encoding video frames)
  turnOffCamera() {
    this.cameraEnabled = false;
    this.videoElement && (this.videoElement.srcObject = null);
    this.onStatusUpdate("Camera turned off");
  }

  // Turn on camera (resume encoding video frames)
  turnOnCamera() {
    this.cameraEnabled = true;
    if (this.stream && this.stream.getVideoTracks().length > 0 && this.videoElement) {
      const videoOnlyStream = new MediaStream();
      videoOnlyStream.addTrack(this.stream.getVideoTracks()[0]);
      this.videoElement.srcObject = videoOnlyStream;
    }
    this.onStatusUpdate("Camera turned on");
  }

  // Turn off mic (stop encoding audio chunks)
  turnOffMic() {
    this.micEnabled = false;
    this.onStatusUpdate("Mic turned off");
  }

  // Turn on mic (resume encoding audio chunks)
  turnOnMic() {
    this.micEnabled = true;
    this.onStatusUpdate("Mic turned on");
  }
  async getMediaStream() {
    if (this.streamType === "camera") {
      const constraints = {
        audio: {
          sampleRate: this.kSampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        },
        video: {
          width: {
            ideal: this.currentConfig.width
          },
          height: {
            ideal: this.currentConfig.height
          },
          frameRate: {
            ideal: this.currentConfig.framerate
          }
        }
      };
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    } else if (this.streamType === "display") {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      // Handle user stopping screen share via browser UI
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.stop();
        };
      }
    }
    const videoOnlyStream = new MediaStream();
    const videoTracks = this.stream.getVideoTracks();
    if (videoTracks.length > 0) {
      videoOnlyStream.addTrack(videoTracks[0]);
    }
    this.videoElement.srcObject = videoOnlyStream;

    // this.videoElement.srcObject = this.stream;
    this.onStatusUpdate(`${this.streamType} stream obtained`);
  }
  async setupConnection() {
    this.webTransport = new WebTransport(this.publishUrl);
    await this.webTransport.ready;
    console.log("WebTransport connected to server");
    const stream = await this.webTransport.createBidirectionalStream();
    const readable = stream.readable;
    const writable = stream.writable;
    this.webtransportWriter = writable.getWriter();
    this.webtransportReader = readable.getReader();
    console.log("WebTransport bidirectional stream established");
    this.onStatusUpdate("WebTransport connection established");
    setInterval(() => {
      const ping = new TextEncoder().encode("ping");
      if (this.isChannelOpen && this.webtransportWriter) {
        this.sendOverWebTransportStream(ping);
      }
    }, 500);
    (async () => {
      try {
        while (true) {
          const {
            value,
            done
          } = await this.webtransportReader.read();
          if (done) {
            console.log("🔌 Bi-directional stream closed by server");
            break;
          }
          if (value) {
            const msg = new TextDecoder().decode(value);
            if (msg === "pong") {
              continue; // Ignore pong responses
            }
            let msgJson;
            try {
              msgJson = JSON.parse(msg);
              console.log("📩 Message from server:", msgJson);
            } catch (e) {
              msgJson = null;
            }
            if (msgJson) {
              console.log("Emitting server event:", msgJson);
              this.onServerEvent(msgJson);
            }
          }
        }
      } catch (err) {
        console.error("❌ Error reading from bidi stream:", err);
      }
    })();
    this.isChannelOpen = true;
  }
  async startStreaming() {
    // Start video capture
    await this.startVideoCapture();

    // Start audio streaming
    this.audioProcessor = await this.startOpusAudioStreaming();
  }
  async startVideoCapture() {
    if (!this.stream) {
      throw new Error("No media stream available");
    }
    const triggerWorker = new Worker("polyfills/triggerWorker.js");
    triggerWorker.postMessage({
      frameRate: this.currentConfig.framerate
    });
    const track = this.stream.getVideoTracks()[0];
    this.videoProcessor = new MediaStreamTrackProcessor(track, triggerWorker, true);
    const reader = this.videoProcessor.readable.getReader();

    // Configure video encoder
    this.videoEncoder.configure({
      codec: this.currentConfig.codec,
      width: this.currentConfig.width,
      height: this.currentConfig.height,
      bitrate: this.currentConfig.bitrate,
      framerate: this.currentConfig.framerate,
      latencyMode: "realtime",
      hardwareAcceleration: "prefer-hardware"
      // hevc: { format: "annexb", maxBFrames: 0 },/
    });
    let frameCounter = 0;

    // Process video frames
    (async () => {
      try {
        while (this.isPublishing) {
          const result = await reader.read();
          if (result.done) break;
          const frame = result.value;
          if (!window.videoBaseTimestamp) {
            window.videoBaseTimestamp = frame.timestamp;
          }
          if (!this.cameraEnabled) {
            frame.close();
            continue;
          }
          if (this.videoEncoder.encodeQueueSize > 2) {
            frame.close();
          } else {
            frameCounter++;
            const keyFrame = frameCounter % 30 === 0; // Key frame every ~1 seconds
            this.videoEncoder.encode(frame, {
              keyFrame
            });
            frame.close();
          }
        }
      } catch (error) {
        this.onStatusUpdate(`Video processing error: ${error.message}`, true);
      }
    })();
  }
  async startOpusAudioStreaming() {
    if (!this.stream) {
      throw new Error("No media stream available");
    }
    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error("No audio track found in stream");
    }
    const audioRecorderOptions = {
      encoderApplication: 2051,
      encoderComplexity: 0,
      encoderFrameSize: 20,
      timeSlice: 100
    };
    const audioRecorder = await this.initAudioRecorder(audioTrack, audioRecorderOptions);
    audioRecorder.ondataavailable = this.handleOpusAudioChunk.bind(this);
    await audioRecorder.start({
      timeSlice: audioRecorderOptions.timeSlice
    });
    return audioRecorder;
  }
  handleVideoChunk(chunk, metadata) {
    if (metadata && metadata.decoderConfig && !this.videoMetadataReady) {
      this.videoDescription = metadata.decoderConfig.description;
      this.videoConfig = {
        codec: metadata.decoderConfig.codec,
        codedWidth: metadata.decoderConfig.codedWidth,
        codedHeight: metadata.decoderConfig.codedHeight,
        frameRate: this.currentConfig.framerate,
        description: metadata.decoderConfig.description
      };
      this.trySendMediaConfig();
      this.videoMetadataReady = true;
    }
    const chunkData = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(chunkData);
    const type = chunk.type === "key" ? "video-key" : "video-delta";
    if (!this.mediaConfigSent) {
      return;
    }
    const packet = this.createPacketWithHeader(chunkData, chunk.timestamp, type);
    this.sendOverWebTransportStream(packet);
    this.sequenceNumber++;
  }
  handleOpusAudioChunk(typedArray) {
    if (!this.micEnabled) return;
    if (!this.isChannelOpen || !typedArray || typedArray.byteLength === 0) return;
    try {
      const dataArray = new Uint8Array(typedArray);

      // Check for OGG header signature
      if (dataArray.length >= 4 && dataArray[0] === 79 &&
      // "O"
      dataArray[1] === 103 &&
      // "g"
      dataArray[2] === 103 &&
      // "g"
      dataArray[3] === 83 // "S"
      ) {
        if (!this.audioConfig) {
          const description = this.createPacketWithHeader(dataArray, performance.now() * 1000, "audio");
          this.audioConfig = {
            codec: "opus",
            sampleRate: 48000,
            numberOfChannels: 1,
            description
          };
          this.trySendMediaConfig();
        }

        // Initialize base time on first chunk
        if (this.opusBaseTime === 0 && window.videoBaseTimestamp) {
          this.opusBaseTime = window.videoBaseTimestamp;
          window.audioStartPerfTime = performance.now();
          this.opusSamplesSent = 0;
          this.opusChunkCount = 0;
        } else if (this.opusBaseTime === 0 && !window.videoBaseTimestamp) {
          this.opusBaseTime = performance.now() * 1000;
          this.opusSamplesSent = 0;
          this.opusChunkCount = 0;
        }
        const timestamp = this.opusBaseTime + Math.floor(this.opusSamplesSent * 1000000 / this.kSampleRate);
        if (this.mediaConfigSent) {
          const packet = this.createPacketWithHeader(dataArray, timestamp, "audio");
          this.sendOverWebTransportStream(packet);
        }
      }
    } catch (error) {
      console.error("Failed to send audio data:", error);
    }
  }
  async sendOverWebTransportStream(frameBytes) {
    try {
      const len = frameBytes.length;
      const out = new Uint8Array(4 + len);
      const view = new DataView(out.buffer);
      view.setUint32(0, len, false); // big-endian
      out.set(frameBytes, 4);
      this.webtransportWriter.write(out);
    } catch (error) {
      this.webtransportWriter.close();
      // console.error("Failed to send data over WebTransport stream:", error);
      return;
      // this.webTransport.close();
    }
  }
  createPacketWithHeader(data, timestamp, type) {
    let adjustedTimestamp = timestamp;
    if (window.videoBaseTimestamp) {
      adjustedTimestamp = timestamp - window.videoBaseTimestamp;
    }
    let safeTimestamp = Math.floor(adjustedTimestamp / 1000);
    if (safeTimestamp < 0) safeTimestamp = 0;
    const HEADER_SIZE = 5;
    const MAX_TS = 0xffffffff;
    const MIN_TS = 0;
    if (safeTimestamp > MAX_TS) safeTimestamp = MAX_TS;
    if (safeTimestamp < MIN_TS) safeTimestamp = MIN_TS;
    const packet = new Uint8Array(HEADER_SIZE + (data instanceof ArrayBuffer ? data.byteLength : data.length));
    let frameType = 2;
    if (type === "video-key") frameType = 0;else if (type === "video-delta") frameType = 1;else if (type === "audio") frameType = 2;else if (type === "config") frameType = 3;else frameType = 4; // unknown

    packet[4] = frameType;
    const view = new DataView(packet.buffer, 0, 4);
    view.setUint32(0, safeTimestamp, false);
    packet.set(data instanceof ArrayBuffer ? new Uint8Array(data) : data, HEADER_SIZE);
    return packet;
  }
  uint8ArrayToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000; // ~32KB
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
  trySendMediaConfig() {
    if (!this.mediaConfigSent && this.audioConfig && this.videoConfig) {
      const aConfigBase64 = this.uint8ArrayToBase64(new Uint8Array(this.audioConfig.description));
      const vConfigUint8 = new Uint8Array(this.videoConfig.description);
      const vConfigBase64 = this.uint8ArrayToBase64(vConfigUint8);
      const config = {
        type: "DecoderConfigs",
        audioConfig: {
          sampleRate: this.audioConfig.sampleRate,
          numberOfChannels: this.audioConfig.numberOfChannels,
          codec: this.audioConfig.codec,
          description: aConfigBase64 || null
        },
        videoConfig: {
          codec: this.videoConfig.codec,
          codedWidth: this.videoConfig.codedWidth,
          codedHeight: this.videoConfig.codedHeight,
          frameRate: this.videoConfig.frameRate,
          description: vConfigBase64 || null
        }
      };
      const packet = new TextEncoder().encode(JSON.stringify(config));
      this.sendOverWebTransportStream(packet);
      this.mediaConfigSent = true;
      this.onStatusUpdate("Media configuration sent");
    }
  }
  async stop() {
    if (!this.isPublishing) {
      return;
    }
    try {
      this.isPublishing = false;

      // Close encoders
      if (this.videoEncoder && this.videoEncoder.state !== "closed") {
        await this.videoEncoder.flush();
        this.videoEncoder.close();
      }

      // Stop audio processor
      if (this.audioProcessor && typeof this.audioProcessor.stop === "function") {
        await this.audioProcessor.stop();
        this.audioProcessor = null;
      }

      // Close WebTransport
      if (this.webtransportWriter) {
        await this.webtransportWriter.close();
        this.webtransportWriter = null;
      }
      if (this.webTransport) {
        this.webTransport.close();
        this.webTransport = null;
      }

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      // Reset video element
      this.videoElement.srcObject = null;

      // Reset state
      this.isChannelOpen = false;
      this.mediaConfigSent = false;
      this.videoMetadataReady = false;
      this.audioConfig = null;
      this.videoConfig = null;
      this.sequenceNumber = 0;
      this.opusBaseTime = 0;
      this.opusSamplesSent = 0;
      this.opusChunkCount = 0;

      // Clear global variables
      window.videoBaseTimestamp = null;
      window.audioStartPerfTime = null;
      this.onStreamStop();
      this.onStatusUpdate("Publishing stopped");
    } catch (error) {
      this.onStatusUpdate(`Error stopping publishing: ${error.message}`, true);
      throw error;
    }
  }

  // Getters for state
  get isActive() {
    return this.isPublishing;
  }
  get streamInfo() {
    return {
      streamType: this.streamType,
      config: this.currentConfig,
      sequenceNumber: this.sequenceNumber,
      mediaConfigSent: this.mediaConfigSent
    };
  }
}

/**
 * Enhanced Subscriber class for receiving media streams
 * Refactored from EnhancedSubscriber with better structure
 */
class Subscriber extends EventEmitter$1 {
  constructor(config) {
    super();

    // Configuration
    this.streamId = config.streamId || "";
    this.roomId = config.roomId || "";
    this.host = config.host || "stream-gate.bandia.vn";
    this.videoElement = config.videoElement;
    this.isOwnStream = config.isOwnStream || false;

    // Media configuration
    this.mediaWorkerUrl = config.mediaWorkerUrl || "workers/media-worker.js";
    this.audioWorkletUrl = config.audioWorkletUrl || "workers/audio-worklet1.js";
    this.mstgPolyfillUrl = config.mstgPolyfillUrl || "polyfills/MSTG_polyfill.js";

    // State
    this.isStarted = false;
    this.isAudioEnabled = true;
    this.connectionStatus = "disconnected"; // 'disconnected', 'connecting', 'connected', 'failed'

    // Media components
    this.worker = null;
    this.audioWorkletNode = null;
    this.videoGenerator = null;
    this.videoWriter = null;
    this.mediaStream = null;

    // Unique subscriber ID
    this.subscriberId = `subscriber_${this.streamId}_${Date.now()}`;

    // Audio mixer reference (will be set externally)
    this.audioMixer = null;
  }

  /**
   * Start the subscriber
   */
  async start() {
    if (this.isStarted) {
      throw new Error("Subscriber already started");
    }
    try {
      console.log("Starting subscriber:", this.subscriberId);
      this.emit("starting", {
        subscriber: this
      });
      this._updateConnectionStatus("connecting");
      const channel = new MessageChannel();
      await this._loadPolyfill();
      await this._initWorker(channel.port2);
      await this._initAudioSystem(channel.port1);
      this._initVideoSystem();
      this.isStarted = true;
      this._updateConnectionStatus("connected");
      this.emit("started", {
        subscriber: this
      });
    } catch (error) {
      this._updateConnectionStatus("failed");
      this.emit("error", {
        subscriber: this,
        error,
        action: "start"
      });
      throw error;
    }
  }

  /**
   * Stop the subscriber
   */
  stop() {
    if (!this.isStarted) {
      return;
    }
    try {
      this.emit("stopping", {
        subscriber: this
      });

      // Remove from audio mixer
      if (this.audioMixer) {
        this.audioMixer.removeSubscriber(this.subscriberId);
      }

      // Terminate worker
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      // Close video components
      this._cleanupVideoSystem();

      // Clear video element
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }

      // Clear references
      this.audioWorkletNode = null;
      this.mediaStream = null;
      this.isStarted = false;
      this._updateConnectionStatus("disconnected");
      this.emit("stopped", {
        subscriber: this
      });
    } catch (error) {
      this.emit("error", {
        subscriber: this,
        error,
        action: "stop"
      });
    }
  }

  /**
   * Toggle audio on/off
   */
  async toggleAudio() {
    if (!this.isStarted || !this.worker) {
      throw new Error("Subscriber not started");
    }
    try {
      this.worker.postMessage({
        type: "toggle-audio"
      });
      this.isAudioEnabled = !this.isAudioEnabled;
      this.emit("audioToggled", {
        subscriber: this,
        enabled: this.isAudioEnabled
      });
      return this.isAudioEnabled;
    } catch (error) {
      this.emit("error", {
        subscriber: this,
        error,
        action: "toggleAudio"
      });
      throw error;
    }
  }

  /**
   * Set audio mixer reference
   */
  setAudioMixer(audioMixer) {
    this.audioMixer = audioMixer;
  }

  /**
   * Get subscriber info
   */
  getInfo() {
    return {
      subscriberId: this.subscriberId,
      streamId: this.streamId,
      roomId: this.roomId,
      host: this.host,
      isOwnStream: this.isOwnStream,
      isStarted: this.isStarted,
      isAudioEnabled: this.isAudioEnabled,
      connectionStatus: this.connectionStatus
    };
  }

  /**
   * Load MediaStreamTrackGenerator polyfill if needed
   */
  async _loadPolyfill() {
    if (!window.MediaStreamTrackGenerator) {
      try {
        await import(this.mstgPolyfillUrl);
      } catch (error) {
        console.warn("Failed to load MSTG polyfill:", error);
      }
    }
  }

  /**
   * Initialize media worker
   */
  async _initWorker(channelPort) {
    try {
      this.worker = new Worker(`${this.mediaWorkerUrl}?t=${Date.now()}`, {
        type: "module"
      });
      this.worker.onmessage = e => this._handleWorkerMessage(e);
      this.worker.onerror = error => {
        this.emit("error", {
          subscriber: this,
          error: new Error(`Media Worker error: ${error.message}`),
          action: "workerError"
        });
      };
      const mediaUrl = `wss://${this.host}/meeting/${this.roomId}/${this.streamId}`;
      console.log("try to init worker with url:", mediaUrl);
      this.worker.postMessage({
        type: "init",
        data: {
          mediaUrl
        },
        port: channelPort
      }, [channelPort]);
    } catch (error) {
      throw new Error(`Worker initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize audio system with mixer
   */
  async _initAudioSystem(channelPort) {
    try {
      // Skip audio setup for own stream to prevent echo
      if (this.isOwnStream) {
        this.emit("audioSkipped", {
          subscriber: this,
          reason: "Own stream - preventing echo"
        });
        return;
      }

      // Audio mixer should be set externally before starting
      if (this.audioMixer) {
        console.warn("Adding subscriber to audio mixer in new subscriber:", this.subscriberId);
        this.audioWorkletNode = await this.audioMixer.addSubscriber(this.subscriberId, this.audioWorkletUrl, this.isOwnStream, channelPort);
        if (this.audioWorkletNode) {
          this.audioWorkletNode.port.onmessage = event => {
            const {
              type,
              bufferMs,
              isPlaying,
              newBufferSize
            } = event.data;
            this.emit("audioStatus", {
              subscriber: this,
              type,
              bufferMs,
              isPlaying,
              newBufferSize
            });
          };
        }
      }
      this.emit("audioInitialized", {
        subscriber: this
      });
    } catch (error) {
      throw new Error(`Audio system initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize video system
   */
  _initVideoSystem() {
    try {
      if (typeof MediaStreamTrackGenerator === "function") {
        this.videoGenerator = new MediaStreamTrackGenerator({
          kind: "video"
        });
      } else {
        throw new Error("MediaStreamTrackGenerator not supported in this browser");
      }
      this.videoWriter = this.videoGenerator.writable;

      // Create MediaStream with video track only
      this.mediaStream = new MediaStream([this.videoGenerator]);

      // Set video element source
      if (this.videoElement) {
        this.videoElement.srcObject = this.mediaStream;
      }
      this.emit("videoInitialized", {
        subscriber: this
      });
    } catch (error) {
      throw new Error(`Video system initialization failed: ${error.message}`);
    }
  }

  /**
   * Cleanup video system
   */
  _cleanupVideoSystem() {
    try {
      // Close video writer
      if (this.videoWriter) {
        try {
          const writer = this.videoWriter.getWriter();
          writer.releaseLock();
        } catch (e) {
          // Writer might already be released
        }
        this.videoWriter = null;
      }

      // Stop video generator
      if (this.videoGenerator) {
        try {
          if (this.videoGenerator.stop) {
            this.videoGenerator.stop();
          }
        } catch (e) {
          // Generator might already be stopped
        }
        this.videoGenerator = null;
      }
    } catch (error) {
      console.warn("Error cleaning video system:", error);
    }
  }

  /**
   * Handle messages from media worker
   */
  _handleWorkerMessage(e) {
    const {
      type,
      frame,
      message,
      channelData,
      sampleRate,
      numberOfChannels,
      timeStamp,
      subscriberId,
      audioEnabled
    } = e.data;
    switch (type) {
      case "videoData":
        this._handleVideoData(frame);
        break;
      case "status":
        this.emit("status", {
          subscriber: this,
          message,
          isError: false
        });
        break;
      case "error":
        this.emit("status", {
          subscriber: this,
          message,
          isError: true
        });
        this.emit("error", {
          subscriber: this,
          error: new Error(message),
          action: "workerMessage"
        });
        break;
      case "audio-toggled":
        this.emit("audioToggled", {
          subscriber: this,
          enabled: audioEnabled
        });
        break;
      case "skipping":
        this.emit("frameSkipped", {
          subscriber: this
        });
        break;
      case "resuming":
        this.emit("frameResumed", {
          subscriber: this
        });
        break;
      default:
        console.log(`Unknown worker message type: ${type}`, e.data);
    }
  }

  /**
   * Handle video data from worker
   */
  async _handleVideoData(frame) {
    if (this.videoWriter && frame) {
      try {
        const writer = this.videoWriter.getWriter();
        await writer.write(frame);
        writer.releaseLock();
        this.emit("videoFrameProcessed", {
          subscriber: this
        });
      } catch (error) {
        this.emit("error", {
          subscriber: this,
          error: new Error(`Video write error: ${error.message}`),
          action: "videoWrite"
        });
      }
    }
  }

  /**
   * Update connection status
   */
  _updateConnectionStatus(status) {
    if (this.connectionStatus === status) return;
    const previousStatus = this.connectionStatus;
    this.connectionStatus = status;
    this.emit("connectionStatusChanged", {
      subscriber: this,
      status,
      previousStatus
    });
  }
}
var Subscriber$1 = Subscriber;

/**
 * AudioMixer Class for combining multiple subscriber audio streams
 * Provides centralized audio mixing and playback management
 */
class AudioMixer {
  constructor(config = {}) {
    this.audioContext = null;
    this.mixerNode = null;
    this.outputDestination = null;
    this.subscriberNodes = new Map(); // subscriberId -> AudioWorkletNode
    this.isInitialized = false;
    this.outputAudioElement = null;

    // Configuration
    this.masterVolume = config.masterVolume || 0.8;
    this.sampleRate = config.sampleRate || 48000;
    this.bufferSize = config.bufferSize || 256;
    this.enableEchoCancellation = config.enableEchoCancellation !== false;
    this.debug = config.debug || false;
  }

  /**
   * Initialize the audio mixer
   */
  async initialize() {
    if (this.isInitialized) {
      this._debug("AudioMixer already initialized");
      return;
    }
    try {
      // Create shared AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate,
        latencyHint: "interactive"
      });

      // Resume context if suspended (required by some browsers)
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Create mixer node (GainNode to combine audio)
      this.mixerNode = this.audioContext.createGain();
      this.mixerNode.gain.value = this.masterVolume;

      // Create output destination
      this.outputDestination = this.audioContext.createMediaStreamDestination();
      this.mixerNode.connect(this.outputDestination);

      // Create hidden audio element for mixed audio playback
      this.outputAudioElement = document.createElement("audio");
      this.outputAudioElement.autoplay = true;
      this.outputAudioElement.style.display = "none";
      this.outputAudioElement.setAttribute("playsinline", "");

      // Disable echo cancellation on output element
      if (this.enableEchoCancellation) {
        this.outputAudioElement.setAttribute("webkitAudioContext", "true");
      }
      document.body.appendChild(this.outputAudioElement);
      this.isInitialized = true;
      this._debug("AudioMixer initialized successfully");

      // Setup error handlers
      this._setupErrorHandlers();
    } catch (error) {
      console.error("Failed to initialize AudioMixer:", error);
      throw error;
    }
  }

  /**
   * Add a subscriber's audio stream to the mixer
   */
  async addSubscriber(subscriberId, audioWorkletUrl, isOwnAudio = false, channelWorkletPort) {
    console.warn(`Adding subscriber ${subscriberId} to audio mixer`);
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Skip adding own audio to prevent echo/feedback
    if (isOwnAudio) {
      this._debug(`Skipping own audio for subscriber ${subscriberId} to prevent echo`);
      return null;
    }

    // Check if subscriber already exists
    if (this.subscriberNodes.has(subscriberId)) {
      this._debug(`Subscriber ${subscriberId} already exists in mixer`);
      return this.subscriberNodes.get(subscriberId);
    }
    try {
      // Load audio worklet if not already loaded
      await this._loadAudioWorklet(audioWorkletUrl);

      // Create AudioWorkletNode for this subscriber
      const workletNode = new AudioWorkletNode(this.audioContext, "jitter-resistant-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      // Connect the port if provided
      if (channelWorkletPort) {
        workletNode.port.postMessage({
          type: "connectWorker",
          port: channelWorkletPort
        }, [channelWorkletPort]);
      }

      // Create gain node for individual volume control
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 1.0;

      // Connect: workletNode -> gainNode -> mixerNode
      workletNode.connect(gainNode);
      gainNode.connect(this.mixerNode);

      // Store reference with gain node
      this.subscriberNodes.set(subscriberId, {
        workletNode,
        gainNode,
        isActive: true,
        addedAt: Date.now()
      });

      // Update audio element source with mixed stream
      this._updateOutputAudio();

      // Setup message handler
      this._setupWorkletMessageHandler(subscriberId, workletNode);
      this._debug(`Added subscriber ${subscriberId} to audio mixer`);
      return workletNode;
    } catch (error) {
      console.error(`Failed to add subscriber ${subscriberId} to mixer:`, error);
      throw error;
    }
  }

  /**
   * Remove a subscriber from the mixer
   */
  removeSubscriber(subscriberId) {
    const subscriberData = this.subscriberNodes.get(subscriberId);
    if (!subscriberData) {
      this._debug(`Subscriber ${subscriberId} not found in mixer`);
      return false;
    }
    try {
      const {
        workletNode,
        gainNode
      } = subscriberData;

      // Disconnect nodes
      workletNode.disconnect();
      gainNode.disconnect();

      // Remove from map
      this.subscriberNodes.delete(subscriberId);

      // Update audio element if no more subscribers
      this._updateOutputAudio();
      this._debug(`Removed subscriber ${subscriberId} from audio mixer`);
      return true;
    } catch (error) {
      console.error(`Failed to remove subscriber ${subscriberId}:`, error);
      return false;
    }
  }

  /**
   * Set volume for a specific subscriber
   */
  setSubscriberVolume(subscriberId, volume) {
    const subscriberData = this.subscriberNodes.get(subscriberId);
    if (!subscriberData) {
      this._debug(`Subscriber ${subscriberId} not found for volume adjustment`);
      return false;
    }
    try {
      const normalizedVolume = Math.max(0, Math.min(1, volume));
      subscriberData.gainNode.gain.value = normalizedVolume;
      this._debug(`Set volume for subscriber ${subscriberId}: ${normalizedVolume}`);
      return true;
    } catch (error) {
      console.error(`Failed to set volume for subscriber ${subscriberId}:`, error);
      return false;
    }
  }

  /**
   * Mute/unmute a specific subscriber
   */
  setSubscriberMuted(subscriberId, muted) {
    return this.setSubscriberVolume(subscriberId, muted ? 0 : 1);
  }

  /**
   * Set master volume for all mixed audio
   */
  setMasterVolume(volume) {
    if (!this.mixerNode) return false;
    try {
      const normalizedVolume = Math.max(0, Math.min(1, volume));
      this.mixerNode.gain.value = normalizedVolume;
      this.masterVolume = normalizedVolume;
      this._debug(`Set master volume: ${normalizedVolume}`);
      return true;
    } catch (error) {
      console.error("Failed to set master volume:", error);
      return false;
    }
  }

  /**
   * Get mixed audio output stream
   */
  getOutputMediaStream() {
    if (!this.outputDestination) {
      this._debug("Output destination not initialized");
      return null;
    }
    return this.outputDestination.stream;
  }

  /**
   * Get current mixer statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      subscriberCount: this.subscriberNodes.size,
      masterVolume: this.masterVolume,
      audioContextState: this.audioContext?.state || "not-initialized",
      sampleRate: this.audioContext?.sampleRate || 0,
      subscribers: Array.from(this.subscriberNodes.entries()).map(([id, data]) => ({
        id,
        volume: data.gainNode.gain.value,
        isActive: data.isActive,
        addedAt: data.addedAt
      }))
    };
  }

  /**
   * Get list of subscriber IDs
   */
  getSubscriberIds() {
    return Array.from(this.subscriberNodes.keys());
  }

  /**
   * Check if subscriber exists in mixer
   */
  hasSubscriber(subscriberId) {
    return this.subscriberNodes.has(subscriberId);
  }

  /**
   * Suspend audio context (for battery saving)
   */
  async suspend() {
    if (this.audioContext && this.audioContext.state === "running") {
      await this.audioContext.suspend();
      this._debug("Audio context suspended");
    }
  }

  /**
   * Resume audio context
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
      this._debug("Audio context resumed");
    }
  }

  /**
   * Cleanup mixer resources
   */
  async cleanup() {
    this._debug("Starting AudioMixer cleanup");
    try {
      // Remove audio element
      if (this.outputAudioElement) {
        this.outputAudioElement.srcObject = null;
        if (this.outputAudioElement.parentNode) {
          this.outputAudioElement.parentNode.removeChild(this.outputAudioElement);
        }
        this.outputAudioElement = null;
      }

      // Disconnect all subscribers
      for (const [subscriberId, subscriberData] of this.subscriberNodes) {
        try {
          const {
            workletNode,
            gainNode
          } = subscriberData;
          workletNode.disconnect();
          gainNode.disconnect();
        } catch (error) {
          console.error(`Error disconnecting subscriber ${subscriberId}:`, error);
        }
      }
      this.subscriberNodes.clear();

      // Disconnect mixer components
      if (this.mixerNode) {
        this.mixerNode.disconnect();
        this.mixerNode = null;
      }
      if (this.outputDestination) {
        this.outputDestination = null;
      }

      // Close audio context
      if (this.audioContext && this.audioContext.state !== "closed") {
        await this.audioContext.close();
      }

      // Reset state
      this.audioContext = null;
      this.isInitialized = false;
      this._debug("AudioMixer cleanup completed");
    } catch (error) {
      console.error("Error during AudioMixer cleanup:", error);
    }
  }

  /**
   * Load audio worklet module
   */
  async _loadAudioWorklet(audioWorkletUrl) {
    console.warn("Loading audio worklet from:", audioWorkletUrl);
    try {
      await this.audioContext.audioWorklet.addModule(audioWorkletUrl);
      this._debug("Audio worklet loaded:", audioWorkletUrl);
    } catch (error) {
      // Worklet might already be loaded
      if (!error.message.includes("already been loaded")) {
        this._debug("Audio worklet load warning:", error.message);
      }
    }
  }

  /**
   * Update output audio element
   */
  _updateOutputAudio() {
    if (!this.outputAudioElement || !this.outputDestination) return;
    try {
      if (this.subscriberNodes.size > 0) {
        this.outputAudioElement.srcObject = this.outputDestination.stream;
      } else {
        this.outputAudioElement.srcObject = null;
      }
    } catch (error) {
      console.error("Failed to update output audio:", error);
    }
  }

  /**
   * Setup message handler for worklet node
   */
  _setupWorkletMessageHandler(subscriberId, workletNode) {
    workletNode.port.onmessage = event => {
      const {
        type,
        bufferMs,
        isPlaying,
        newBufferSize,
        error
      } = event.data;
      switch (type) {
        case "bufferStatus":
          this._debug(`Subscriber ${subscriberId} buffer: ${bufferMs}ms, playing: ${isPlaying}`);
          break;
        case "bufferSizeChanged":
          this._debug(`Subscriber ${subscriberId} buffer size changed: ${newBufferSize}`);
          break;
        case "error":
          console.error(`Subscriber ${subscriberId} worklet error:`, error);
          break;
        default:
          this._debug(`Subscriber ${subscriberId} worklet message:`, event.data);
      }
    };
    workletNode.port.onerror = error => {
      console.error(`Subscriber ${subscriberId} worklet port error:`, error);
    };
  }

  /**
   * Setup error handlers for audio context
   */
  _setupErrorHandlers() {
    if (!this.audioContext) return;
    this.audioContext.onstatechange = () => {
      this._debug(`Audio context state changed: ${this.audioContext.state}`);
      if (this.audioContext.state === "interrupted") {
        console.warn("Audio context was interrupted");
      }
    };

    // Listen for audio context suspend/resume events
    document.addEventListener("visibilitychange", async () => {
      if (document.hidden) ; else {
        // Page visible - resume context if needed
        await this.resume();
      }
    });
  }

  /**
   * Debug logging
   */
  _debug(...args) {
    if (this.debug) {
      console.log("[AudioMixer]", ...args);
    }
  }

  /**
   * Sleep utility for delays
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
var AudioMixer$1 = AudioMixer;

/**
 * Represents a meeting room
 */
class Room extends EventEmitter$1 {
  constructor(config) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.code = config.code;
    this.type = config.type || "main"; // 'main', 'breakout'
    this.parentRoomId = config.parentRoomId || null;
    this.ownerId = config.ownerId;
    this.isActive = false;

    // Configuration
    this.apiClient = config.apiClient;
    this.mediaConfig = config.mediaConfig;

    // Participants management
    this.participants = new Map(); // userId -> Participant
    this.localParticipant = null;

    // Sub rooms (for main rooms only)
    this.subRooms = new Map(); // subRoomId -> Room

    // Media management
    this.audioMixer = null;
    this.pinnedParticipant = null;

    // Connection info
    this.membershipId = null;
    this.streamId = null;

    // UI containers
    this.mainVideoArea = null;
    this.sidebarArea = null;
  }

  /**
   * Join this room
   */
  async join(userId) {
    if (this.isActive) {
      throw new Error("Already joined this room");
    }
    try {
      this.emit("joining", {
        room: this
      });
      console.log("Joining room with code", this.code);
      // Join via API
      const joinResponse = await this.apiClient.joinRoom(this.code);

      // Store connection info
      this.id = joinResponse.room_id;
      this.membershipId = joinResponse.id;
      this.streamId = joinResponse.stream_id;

      // Get room details and members
      const roomDetails = await this.apiClient.getRoomById(joinResponse.room_id);
      console.log("Joined room, details:", roomDetails);

      // Update room info
      this._updateFromApiData(roomDetails.room);

      // Setup participants
      await this._setupParticipants(roomDetails.participants, userId);
      if (this.mainVideoArea && this.sidebarArea) {
        this.renderParticipantTiles();
      }

      // Setup media connections
      await this._setupMediaConnections();
      this.isActive = true;
      this.emit("joined", {
        room: this,
        participants: this.participants
      });
      return {
        room: this,
        localParticipant: this.localParticipant,
        participants: Array.from(this.participants.values())
      };
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "join"
      });
      throw error;
    }
  }

  /**
   * Leave this room
   */
  async leave() {
    if (!this.isActive) {
      return;
    }
    try {
      this.emit("leaving", {
        room: this
      });

      // Cleanup media connections
      await this._cleanupMediaConnections();

      // Cleanup participants
      this._cleanupParticipants();

      // Leave via API
      if (this.membershipId) {
        await this.apiClient.leaveRoom(this.id, this.membershipId);
      }
      this.isActive = false;
      this.emit("left", {
        room: this
      });
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "leave"
      });
      throw error;
    }
  }

  /**
   * Create a sub room (main room only)
   */
  async createSubRoom(config) {
    if (this.type !== "main") {
      throw new Error("Only main rooms can create sub rooms");
    }
    try {
      this.emit("creatingSubRoom", {
        room: this,
        config
      });

      // Create sub room via API
      const subRoomData = await this.apiClient.createSubRoom(this.id, config.name, config.type || "breakout");

      // Create sub room instance
      const subRoom = new Room({
        id: subRoomData.id,
        name: subRoomData.room_name,
        code: subRoomData.room_code,
        type: config.type || "breakout",
        parentRoomId: this.id,
        ownerId: subRoomData.user_id,
        apiClient: this.apiClient,
        mediaConfig: this.mediaConfig
      });

      // Store sub room
      this.subRooms.set(subRoom.id, subRoom);
      this.emit("subRoomCreated", {
        room: this,
        subRoom
      });
      return subRoom;
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "createSubRoom"
      });
      throw error;
    }
  }

  /**
   * Get all sub rooms
   */
  async getSubRooms() {
    if (this.type !== "main") {
      return [];
    }
    try {
      const subRoomsData = await this.apiClient.getSubRooms(this.id);

      // Update local sub rooms map
      for (const subRoomData of subRoomsData) {
        if (!this.subRooms.has(subRoomData.id)) {
          const subRoom = new Room({
            id: subRoomData.id,
            name: subRoomData.room_name,
            code: subRoomData.room_code,
            type: subRoomData.room_type,
            parentRoomId: this.id,
            ownerId: subRoomData.user_id,
            apiClient: this.apiClient,
            mediaConfig: this.mediaConfig
          });
          this.subRooms.set(subRoom.id, subRoom);
        }
      }
      return Array.from(this.subRooms.values());
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "getSubRooms"
      });
      throw error;
    }
  }

  /**
   * Switch to a sub room
   */
  async switchToSubRoom(subRoomCode) {
    try {
      this.emit("switchingToSubRoom", {
        room: this,
        subRoomCode
      });

      // Switch via API
      const switchResponse = await this.apiClient.switchToSubRoom(this.id, subRoomCode);

      // Cleanup current media connections but keep participants
      await this._cleanupMediaConnections();

      // Update connection info for new sub room
      this.membershipId = switchResponse.id;
      this.streamId = switchResponse.stream_id;

      // Setup media connections for sub room
      await this._setupMediaConnections();
      this.emit("switchedToSubRoom", {
        room: this,
        subRoomCode,
        response: switchResponse
      });
      return switchResponse;
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "switchToSubRoom"
      });
      throw error;
    }
  }

  /**
   * Return to main room from sub room
   */
  async returnToMainRoom() {
    if (!this.parentRoomId) {
      throw new Error("This is not a sub room");
    }
    try {
      this.emit("returningToMainRoom", {
        room: this
      });

      // Leave current sub room
      await this.leave();

      // The parent should handle rejoining main room
      this.emit("returnedToMainRoom", {
        room: this
      });
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "returnToMainRoom"
      });
      throw error;
    }
  }

  /**
   * Add a participant to the room
   */
  addParticipant(memberData, userId) {
    const isLocal = memberData.user_id === userId;
    const participant = new Participant$1({
      userId: memberData.user_id,
      streamId: memberData.stream_id,
      membershipId: memberData.id,
      role: memberData.role,
      roomId: this.id,
      isLocal
    });

    // Setup participant events
    this._setupParticipantEvents(participant);
    this.participants.set(participant.userId, participant);
    if (isLocal) {
      this.localParticipant = participant;
    }
    this.emit("participantAdded", {
      room: this,
      participant
    });
    return participant;
  }

  /**
   * Remove a participant from the room
   */
  removeParticipant(userId) {
    const participant = this.participants.get(userId);
    if (!participant) return null;

    // Cleanup participant
    participant.cleanup();

    // Remove from maps
    this.participants.delete(userId);
    if (this.localParticipant?.userId === userId) {
      this.localParticipant = null;
    }
    if (this.pinnedParticipant?.userId === userId) {
      this.pinnedParticipant = null;
    }
    this.emit("participantRemoved", {
      room: this,
      participant
    });
    return participant;
  }

  /**
   * Get a participant by user ID
   */
  getParticipant(userId) {
    return this.participants.get(userId);
  }

  /**
   * Get all participants
   */
  getParticipants() {
    return Array.from(this.participants.values());
  }

  /**
   * Pin a participant's video
   */
  // pinParticipant(userId) {
  //   const participant = this.participants.get(userId);
  //   if (!participant) return false;

  //   // Unpin current participant
  //   if (this.pinnedParticipant) {
  //     this.pinnedParticipant.isPinned = false;
  //   }

  //   // Pin new participant
  //   participant.isPinned = true;
  //   this.pinnedParticipant = participant;

  //   this.emit("participantPinned", { room: this, participant });

  //   return true;
  // }

  pinParticipant(userId) {
    const participant = this.participants.get(userId);
    if (!participant) return false;

    // Unpin current participant và move về sidebar
    if (this.pinnedParticipant && this.pinnedParticipant !== participant) {
      this.pinnedParticipant.isPinned = false;
      this._moveParticipantTile(this.pinnedParticipant);
    }

    // Pin new participant và move lên main
    participant.isPinned = true;
    this.pinnedParticipant = participant;
    this._moveParticipantTile(participant);
    this.emit("participantPinned", {
      room: this,
      participant
    });
    return true;
  }

  /**
   * Unpin currently pinned participant
   */
  // unpinParticipant() {
  //   if (!this.pinnedParticipant) return false;

  //   this.pinnedParticipant.isPinned = false;
  //   const unpinnedParticipant = this.pinnedParticipant;
  //   this.pinnedParticipant = null;

  //   this.emit("participantUnpinned", {
  //     room: this,
  //     participant: unpinnedParticipant,
  //   });

  //   return true;
  // }

  unpinParticipant() {
    if (!this.pinnedParticipant) return false;
    this.pinnedParticipant.isPinned = false;
    const unpinnedParticipant = this.pinnedParticipant;

    // Move về sidebar
    this._moveParticipantTile(unpinnedParticipant);
    this.pinnedParticipant = null;

    // Auto-pin local participant nếu có
    if (this.localParticipant) {
      this.pinParticipant(this.localParticipant.userId);
    }
    this.emit("participantUnpinned", {
      room: this,
      participant: unpinnedParticipant
    });
    return true;
  }

  /**
   * Set UI containers for video tiles
   */
  setUIContainers(mainVideoArea, sidebarArea) {
    this.mainVideoArea = mainVideoArea;
    this.sidebarArea = sidebarArea;
  }

  /**
   * Render participant video tiles
   */

  renderParticipantTiles() {
    if (!this.mainVideoArea || !this.sidebarArea) {
      throw new Error("UI containers not set");
    }

    // Clear existing tiles
    this.mainVideoArea.innerHTML = "";
    this.sidebarArea.innerHTML = "";
    console.warn("Rendering participant tiles..., participants:", this.participants);

    // Render each participant's tile
    for (const participant of this.participants.values()) {
      // Tạo tile nếu chưa có
      let tile = participant.tile;
      if (!tile) {
        tile = participant.createVideoTile();
      }
      if (participant.isPinned) {
        this.mainVideoArea.appendChild(tile);
      } else {
        this.sidebarArea.appendChild(tile);
      }
    }

    // Auto-pin local participant if no one is pinned
    if (!this.pinnedParticipant && this.localParticipant) {
      this.pinParticipant(this.localParticipant.userId);
      const localTile = this.localParticipant.tile;
      if (localTile && !this.mainVideoArea.contains(localTile)) {
        this.mainVideoArea.appendChild(localTile);
      }
    }
  }

  /**
   * Get room info
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      type: this.type,
      parentRoomId: this.parentRoomId,
      ownerId: this.ownerId,
      isActive: this.isActive,
      participantCount: this.participants.size,
      subRoomCount: this.subRooms.size,
      pinnedParticipant: this.pinnedParticipant?.userId || null
    };
  }

  /**
   * Setup participants from API data
   */
  async _setupParticipants(participantsData, userId) {
    for (const participantData of participantsData) {
      this.addParticipant(participantData, userId);
    }
  }

  /**
   * Setup media connections for all participants
   */
  async _setupMediaConnections() {
    // Initialize audio mixer
    if (!this.audioMixer) {
      this.audioMixer = new AudioMixer$1();
      await this.audioMixer.initialize();
    }

    // Setup publisher for local participant
    if (this.localParticipant) {
      await this._setupLocalPublisher();
    }

    // Setup subscribers for remote participants
    for (const participant of this.participants.values()) {
      if (!participant.isLocal) {
        await this._setupRemoteSubscriber(participant);
      }
    }
  }

  /**
   * Setup publisher for local participant
   */
  async _setupLocalPublisher() {
    if (!this.localParticipant || !this.streamId) return;

    // this.localParticipant.createVideoTile();
    if (!this.localParticipant.tile) {
      const tile = this.localParticipant.createVideoTile();

      // Append to main video area if set
      if (this.mainVideoArea) {
        this.mainVideoArea.innerHTML = ""; // Clear placeholder
        this.mainVideoArea.appendChild(tile);
      }
    }
    const videoElement = this.localParticipant.videoElement;
    if (!videoElement) {
      throw new Error("Video element not found for local participant");
    }
    const publishUrl = `${this.mediaConfig.webtpUrl}/${this.id}/${this.streamId}`;
    console.log("trying to connect webtransport to", publishUrl);
    const publisher = new Publisher({
      publishUrl,
      streamType: "camera",
      videoElement: this.localParticipant.videoElement,
      streamId: "camera_stream",
      width: 1280,
      height: 720,
      framerate: 30,
      bitrate: 1_500_000,
      onStatusUpdate: (msg, isError) => {
        this.localParticipant.setConnectionStatus(isError ? "failed" : "connected");
      },
      onServerEvent: async event => {
        await this._handleServerEvent(event);
      }
    });
    await publisher.startPublishing();
    this.localParticipant.setPublisher(publisher);
  }

  /**
   * Setup subscriber for remote participant
   */
  async _setupRemoteSubscriber(participant) {
    const subscriber = new Subscriber$1({
      streamId: participant.streamId,
      roomId: this.id,
      host: this.mediaConfig.host,
      videoElement: participant.videoElement,
      onStatus: (msg, isError) => {
        participant.setConnectionStatus(isError ? "failed" : "connected");
      },
      audioWorkletUrl: "workers/audio-worklet1.js",
      mstgPolyfillUrl: "polyfills/MSTG_polyfill.js"
    });
    // Add to audio mixer
    if (this.audioMixer) {
      subscriber.setAudioMixer(this.audioMixer);
    }
    await subscriber.start();
    participant.setSubscriber(subscriber);
  }

  /**
   * Handle server events from publisher
   */
  async _handleServerEvent(event) {
    console.log("Received server event:", event);
    // if (event.type === "join") {
    //   const joinedParticipant = event.participant;
    //   if (joinedParticipant.user_id === this.localParticipant?.userId) return;

    //   const participant = this.addParticipant(
    //     {
    //       user_id: joinedParticipant.user_id,
    //       stream_id: joinedParticipant.stream_id,
    //       id: joinedParticipant.membership_id,
    //       role: joinedParticipant.role,
    //     },
    //     this.localParticipant?.userId
    //   );

    //   this.renderParticipantTiles();
    //   await this._setupRemoteSubscriber(participant);
    // }

    // if (event.type === "leave") {
    //   this.removeParticipant(event.participant.user_id);
    //   this.renderParticipantTiles();
    // }
    if (event.type === "join") {
      const joinedParticipant = event.participant;
      if (joinedParticipant.user_id === this.localParticipant?.userId) return;
      const participant = this.addParticipant({
        user_id: joinedParticipant.user_id,
        stream_id: joinedParticipant.stream_id,
        id: joinedParticipant.membership_id,
        role: joinedParticipant.role
      }, this.localParticipant?.userId);

      // Tạo tile và thêm vào UI ngay
      const tile = participant.createVideoTile();
      if (this.sidebarArea) {
        this.sidebarArea.appendChild(tile);
      }

      // Setup subscriber sau khi đã có tile và videoElement
      await this._setupRemoteSubscriber(participant);
    }
    if (event.type === "leave") {
      const participant = this.participants.get(event.participant.user_id);
      if (participant) {
        // Remove tile khỏi DOM trước
        if (participant.tile && participant.tile.parentNode) {
          participant.tile.parentNode.removeChild(participant.tile);
        }

        // Sau đó cleanup participant
        this.removeParticipant(event.participant.user_id);

        // Nếu người bị remove là pinned participant, auto-pin local
        if (!this.pinnedParticipant && this.localParticipant) {
          this.pinParticipant(this.localParticipant.userId);
          if (this.localParticipant.tile && this.mainVideoArea) {
            this.mainVideoArea.innerHTML = "";
            this.mainVideoArea.appendChild(this.localParticipant.tile);
          }
        }
      }
    }
  }

  /**
   * Setup event listeners for a participant
   */
  // _setupParticipantEvents(participant) {
  //   participant.on("pinToggled", ({ participant: p, pinned }) => {
  //     if (pinned) {
  //       this.pinParticipant(p.userId);
  //     } else if (this.pinnedParticipant === p) {
  //       this.unpinParticipant();
  //     }
  //     this.renderParticipantTiles();
  //   });

  //   participant.on("error", ({ participant: p, error, action }) => {
  //     this.emit("participantError", {
  //       room: this,
  //       participant: p,
  //       error,
  //       action,
  //     });
  //   });
  // }

  _setupParticipantEvents(participant) {
    participant.on("pinToggled", ({
      participant: p,
      pinned
    }) => {
      if (pinned) {
        this.pinParticipant(p.userId);
      } else if (this.pinnedParticipant === p) {
        this.unpinParticipant();
      }

      // Chỉ di chuyển tile của participant này
      this._moveParticipantTile(p);
    });
    participant.on("error", ({
      participant: p,
      error,
      action
    }) => {
      this.emit("participantError", {
        room: this,
        participant: p,
        error,
        action
      });
    });
  }
  _moveParticipantTile(participant) {
    if (!participant.tile) return;

    // Remove khỏi vị trí hiện tại
    if (participant.tile.parentNode) {
      participant.tile.parentNode.removeChild(participant.tile);
    }

    // Thêm vào vị trí mới
    if (participant.isPinned && this.mainVideoArea) {
      this.mainVideoArea.innerHTML = "";
      this.mainVideoArea.appendChild(participant.tile);
    } else if (!participant.isPinned && this.sidebarArea) {
      this.sidebarArea.appendChild(participant.tile);
    }
  }

  /**
   * Update room data from API response
   */
  _updateFromApiData(roomData) {
    this.name = roomData.room_name || this.name;
    this.ownerId = roomData.user_id || this.ownerId;
  }

  /**
   * Cleanup media connections
   */
  async _cleanupMediaConnections() {
    // Cleanup audio mixer
    if (this.audioMixer) {
      await this.audioMixer.cleanup();
      this.audioMixer = null;
    }

    // Cleanup all participants' media
    for (const participant of this.participants.values()) {
      if (participant.publisher) {
        participant.publisher.stop();
        participant.publisher = null;
      }
      if (participant.subscriber) {
        participant.subscriber.stop();
        participant.subscriber = null;
      }
    }
  }

  /**
   * Cleanup all participants
   */
  _cleanupParticipants() {
    for (const participant of this.participants.values()) {
      participant.cleanup();
    }
    this.participants.clear();
    this.localParticipant = null;
    this.pinnedParticipant = null;
  }

  /**
   * Cleanup room resources
   */
  async cleanup() {
    if (this.isActive) {
      await this.leave();
    }

    // Cleanup sub rooms
    for (const subRoom of this.subRooms.values()) {
      await subRoom.cleanup();
    }
    this.subRooms.clear();
    this.removeAllListeners();
  }
}
var Room$1 = Room;

/**
 * SubRoom extends Room with additional functionality for breakout rooms
 */
class SubRoom extends Room$1 {
  constructor(config) {
    super({
      ...config,
      type: config.type || "breakout"
    });
    this.parentRoom = config.parentRoom; // Reference to parent Room instance
    this.maxParticipants = config.maxParticipants || 10;
    this.autoReturn = config.autoReturn || false; // Auto return to main room when empty
    this.duration = config.duration || null; // Duration in minutes, null = unlimited
    this.startTime = null;

    // Sub room specific state
    this.isTemporary = config.isTemporary || true;
    this.allowSelfAssign = config.allowSelfAssign || true;
    this._setupSubRoomEvents();
  }

  /**
   * Join the sub room from main room
   */
  async joinFromMain(userId) {
    if (!this.parentRoom) {
      throw new Error("No parent room reference");
    }
    try {
      this.emit("joiningFromMain", {
        subRoom: this,
        userId
      });

      // Pause main room media without leaving
      await this.parentRoom._pauseMediaConnections();

      // Join this sub room
      const joinResult = await this.join(userId);

      // Start duration timer if set
      if (this.duration && !this.startTime) {
        this.startTime = Date.now();
        this._startDurationTimer();
      }
      this.emit("joinedFromMain", {
        subRoom: this,
        userId,
        joinResult
      });
      return joinResult;
    } catch (error) {
      // Resume main room media on error
      if (this.parentRoom) {
        await this.parentRoom._resumeMediaConnections();
      }
      this.emit("error", {
        subRoom: this,
        error,
        action: "joinFromMain"
      });
      throw error;
    }
  }

  /**
   * Return to main room
   */
  async returnToMainRoom() {
    if (!this.parentRoom) {
      throw new Error("No parent room reference");
    }
    try {
      this.emit("returningToMain", {
        subRoom: this
      });

      // Leave sub room
      await this.leave();

      // Resume main room media
      await this.parentRoom._resumeMediaConnections();
      this.emit("returnedToMain", {
        subRoom: this
      });

      // Check if should cleanup empty room
      if (this.participants.size === 0 && this.autoReturn) {
        await this.cleanup();
      }
      return this.parentRoom;
    } catch (error) {
      this.emit("error", {
        subRoom: this,
        error,
        action: "returnToMainRoom"
      });
      throw error;
    }
  }

  /**
   * Switch to another sub room directly
   */
  async switchToSubRoom(targetSubRoom) {
    if (!this.parentRoom) {
      throw new Error("No parent room reference");
    }
    try {
      this.emit("switchingToSubRoom", {
        fromSubRoom: this,
        toSubRoom: targetSubRoom
      });

      // Leave current sub room
      await this.leave();

      // Join target sub room
      const joinResult = await targetSubRoom.joinFromMain(this.localParticipant?.userId);
      this.emit("switchedToSubRoom", {
        fromSubRoom: this,
        toSubRoom: targetSubRoom
      });
      return joinResult;
    } catch (error) {
      this.emit("error", {
        subRoom: this,
        error,
        action: "switchToSubRoom"
      });
      throw error;
    }
  }

  /**
   * Invite participant to this sub room
   */
  async inviteParticipant(userId) {
    try {
      // Send invitation via API (implementation depends on API support)
      const result = await this.apiClient.inviteToSubRoom(this.id, userId);
      this.emit("participantInvited", {
        subRoom: this,
        userId,
        result
      });
      return result;
    } catch (error) {
      this.emit("error", {
        subRoom: this,
        error,
        action: "inviteParticipant"
      });
      throw error;
    }
  }

  /**
   * Assign participant to this sub room (host action)
   */
  async assignParticipant(userId) {
    try {
      // Force assignment via API
      const result = await this.apiClient.assignToSubRoom(this.id, userId);
      this.emit("participantAssigned", {
        subRoom: this,
        userId,
        result
      });
      return result;
    } catch (error) {
      this.emit("error", {
        subRoom: this,
        error,
        action: "assignParticipant"
      });
      throw error;
    }
  }

  /**
   * Broadcast message to all participants
   */
  async broadcastMessage(message, type = "info") {
    try {
      const result = await this.apiClient.broadcastToSubRoom(this.id, message, type);
      this.emit("messageBroadcast", {
        subRoom: this,
        message,
        type,
        result
      });
      return result;
    } catch (error) {
      this.emit("error", {
        subRoom: this,
        error,
        action: "broadcastMessage"
      });
      throw error;
    }
  }

  /**
   * Get remaining time in minutes
   */
  getRemainingTime() {
    if (!this.duration || !this.startTime) {
      return null;
    }
    const elapsed = (Date.now() - this.startTime) / (1000 * 60); // in minutes
    const remaining = Math.max(0, this.duration - elapsed);
    return Math.ceil(remaining);
  }

  /**
   * Extend sub room duration
   */
  extendDuration(additionalMinutes) {
    if (!this.duration) {
      this.duration = additionalMinutes;
      this.startTime = Date.now();
    } else {
      this.duration += additionalMinutes;
    }
    this.emit("durationExtended", {
      subRoom: this,
      additionalMinutes,
      newDuration: this.duration
    });

    // Restart timer if needed
    if (this.startTime) {
      this._startDurationTimer();
    }
  }

  /**
   * Set participant limit
   */
  setMaxParticipants(limit) {
    this.maxParticipants = limit;
    this.emit("maxParticipantsChanged", {
      subRoom: this,
      maxParticipants: limit
    });

    // If over limit, may need to handle overflow
    if (this.participants.size > limit) {
      this.emit("participantLimitExceeded", {
        subRoom: this,
        current: this.participants.size,
        limit
      });
    }
  }

  /**
   * Check if sub room is full
   */
  isFull() {
    return this.participants.size >= this.maxParticipants;
  }

  /**
   * Check if sub room is empty
   */
  isEmpty() {
    return this.participants.size === 0;
  }

  /**
   * Check if sub room has expired
   */
  hasExpired() {
    if (!this.duration || !this.startTime) {
      return false;
    }
    const elapsed = (Date.now() - this.startTime) / (1000 * 60);
    return elapsed >= this.duration;
  }

  /**
   * Get sub room statistics
   */
  getStats() {
    return {
      ...this.getInfo(),
      maxParticipants: this.maxParticipants,
      duration: this.duration,
      remainingTime: this.getRemainingTime(),
      startTime: this.startTime,
      isFull: this.isFull(),
      isEmpty: this.isEmpty(),
      hasExpired: this.hasExpired(),
      isTemporary: this.isTemporary,
      allowSelfAssign: this.allowSelfAssign,
      autoReturn: this.autoReturn
    };
  }

  /**
   * Setup sub room specific events
   */
  _setupSubRoomEvents() {
    // Handle participant left
    this.on("participantRemoved", ({
      room,
      participant
    }) => {
      // Auto return to main room if empty and configured to do so
      if (this.isEmpty() && this.autoReturn && this.parentRoom) {
        setTimeout(() => {
          if (this.isEmpty()) {
            // Double check after delay
            this.cleanup();
          }
        }, 5000); // 5 second delay
      }
    });

    // Handle room expiry warnings
    if (this.duration) {
      // Warn 5 minutes before expiry
      const warningTime = Math.max(1, this.duration - 5);
      setTimeout(() => {
        if (this.isActive && !this.hasExpired()) {
          this.emit("expiryWarning", {
            subRoom: this,
            remainingMinutes: 5
          });
        }
      }, warningTime * 60 * 1000);
    }
  }

  /**
   * Start duration timer for automatic closure
   */
  _startDurationTimer() {
    if (this._durationTimer) {
      clearTimeout(this._durationTimer);
    }
    if (!this.duration) return;
    const remainingMs = this.getRemainingTime() * 60 * 1000;
    if (remainingMs <= 0) {
      this._handleExpiry();
      return;
    }
    this._durationTimer = setTimeout(() => {
      this._handleExpiry();
    }, remainingMs);
  }

  /**
   * Handle sub room expiry
   */
  async _handleExpiry() {
    this.emit("expired", {
      subRoom: this
    });

    // Notify all participants
    await this.broadcastMessage("Sub room session has expired. Returning to main room.", "warning");

    // Return all participants to main room
    const participants = Array.from(this.participants.values());
    for (const participant of participants) {
      if (participant.isLocal) {
        await this.returnToMainRoom();
      }
    }

    // Cleanup sub room
    await this.cleanup();
  }

  /**
   * Override cleanup to clear timers
   */
  async cleanup() {
    // Clear duration timer
    if (this._durationTimer) {
      clearTimeout(this._durationTimer);
      this._durationTimer = null;
    }

    // Remove from parent room's sub rooms map
    if (this.parentRoom) {
      this.parentRoom.subRooms.delete(this.id);
    }

    // Call parent cleanup
    await super.cleanup();
    this.emit("cleanedUp", {
      subRoom: this
    });
  }

  /**
   * Serialize sub room state for persistence or transfer
   */
  serialize() {
    return {
      ...this.getStats(),
      participantIds: Array.from(this.participants.keys()),
      parentRoomId: this.parentRoom?.id || this.parentRoomId,
      createdAt: this.startTime || Date.now()
    };
  }

  /**
   * Create sub room from serialized data
   */
  static fromSerializedData(data, parentRoom, apiClient, mediaConfig) {
    return new SubRoom({
      id: data.id,
      name: data.name,
      code: data.code,
      type: data.type,
      parentRoom,
      parentRoomId: data.parentRoomId,
      ownerId: data.ownerId,
      maxParticipants: data.maxParticipants,
      duration: data.duration,
      autoReturn: data.autoReturn,
      isTemporary: data.isTemporary,
      allowSelfAssign: data.allowSelfAssign,
      apiClient,
      mediaConfig
    });
  }
}
var SubRoom$1 = SubRoom;

/**
 * Main Ermis Classroom client
 */
class ErmisClient extends EventEmitter$1 {
  constructor(config = {}) {
    super();

    // Configuration
    this.config = {
      host: config.host || "daibo.ermis.network:9999",
      apiUrl: config.apiUrl || `https://${config.host || "daibo.ermis.network:9999"}/meeting`,
      webtpUrl: config.webtpUrl || "https://daibo.ermis.network:4455/meeting/wt",
      autoSaveCredentials: config.autoSaveCredentials !== false,
      reconnectAttempts: config.reconnectAttempts || 3,
      reconnectDelay: config.reconnectDelay || 2000,
      debug: config.debug || false
    };

    // API client
    this.apiClient = new ApiClient$1({
      host: this.config.host,
      apiUrl: this.config.apiUrl
    });

    // State management
    this.state = {
      user: null,
      isAuthenticated: false,
      currentRoom: null,
      rooms: new Map(),
      // roomId -> Room
      connectionStatus: "disconnected" // 'disconnected', 'connecting', 'connected', 'failed'
    };

    // Storage interface (can be overridden for different environments)
    this.storage = config.storage || {
      getItem: key => localStorage?.getItem(key),
      setItem: (key, value) => localStorage?.setItem(key, value),
      removeItem: key => localStorage?.removeItem(key)
    };

    // Media configuration
    this.mediaConfig = {
      host: this.config.host,
      webtpUrl: this.config.webtpUrl,
      defaultVideoConfig: {
        width: 1280,
        height: 720,
        framerate: 30,
        bitrate: 1_500_000
      },
      defaultAudioConfig: {
        sampleRate: 48000,
        channels: 2
      }
    };
    this._setupEventHandlers();
    this._attemptAutoLogin();
  }

  /**
   * Authenticate user
   */
  async authenticate(userId) {
    if (this.state.isAuthenticated && this.state.user?.id === userId) {
      return this.state.user;
    }
    try {
      this.emit("authenticating", {
        userId
      });
      this._setConnectionStatus("connecting");

      // Validate email format if it looks like email
      if (userId.includes("@")) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userId)) {
          throw new Error("Invalid email format");
        }
      }

      // Get authentication token
      const tokenResponse = await this.apiClient.getDummyToken(userId);
      //   const tokenResponse = await this.apiClient.refreshToken(userId);

      // Set authentication in API client
      this.apiClient.setAuth(tokenResponse.access_token, userId);

      // Update state
      this.state.user = {
        id: userId,
        token: tokenResponse.access_token,
        authenticatedAt: Date.now()
      };
      this.state.isAuthenticated = true;

      // Save credentials if enabled
      if (this.config.autoSaveCredentials) {
        this._saveCredentials();
      }
      this._setConnectionStatus("connected");
      this.emit("authenticated", {
        user: this.state.user
      });
      this._debug("User authenticated successfully:", userId);
      return this.state.user;
    } catch (error) {
      this._setConnectionStatus("failed");
      this.emit("authenticationFailed", {
        userId,
        error
      });
      this._debug("Authentication failed:", error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout() {
    if (!this.state.isAuthenticated) {
      return;
    }
    try {
      this.emit("loggingOut", {
        user: this.state.user
      });

      // Leave current room if any
      if (this.state.currentRoom) {
        await this.state.currentRoom.leave();
      }

      // Clear credentials
      this._clearCredentials();

      // Reset state
      this.state.user = null;
      this.state.isAuthenticated = false;
      this.state.currentRoom = null;
      this.state.rooms.clear();
      this._setConnectionStatus("disconnected");
      this.emit("loggedOut");
      this._debug("User logged out successfully");
    } catch (error) {
      this.emit("error", {
        error,
        action: "logout"
      });
      throw error;
    }
  }

  /**
   * Create a new room
   */
  async createRoom(config) {
    this._ensureAuthenticated();
    try {
      this.emit("creatingRoom", {
        config
      });
      const roomData = await this.apiClient.createRoom(config.name, config.type);
      const room = new Room$1({
        id: roomData.id,
        name: roomData.room_name,
        code: roomData.room_code,
        type: config.type || "main",
        ownerId: roomData.user_id,
        apiClient: this.apiClient,
        mediaConfig: this.mediaConfig
      });
      this._setupRoomEvents(room);
      this.state.rooms.set(room.id, room);
      this.emit("roomCreated", {
        room
      });
      this._debug("Room created:", room.getInfo());

      // Auto-join if specified
      if (config.autoJoin !== false) {
        await this.joinRoom(room.code);
      }
      return room;
    } catch (error) {
      this.emit("error", {
        error,
        action: "createRoom"
      });
      throw error;
    }
  }

  /**
   * Join a room by code
   */
  async joinRoom(roomCode) {
    this._ensureAuthenticated();
    try {
      this.emit("joiningRoom", {
        roomCode
      });

      // Leave current room if any
      if (this.state.currentRoom) {
        await this.state.currentRoom.leave();
      }

      // Try to find existing room instance first
      let room = Array.from(this.state.rooms.values()).find(r => r.code === roomCode);
      if (!room) {
        // Create new room instance
        room = new Room$1({
          code: roomCode,
          apiClient: this.apiClient,
          mediaConfig: this.mediaConfig
        });
        this._setupRoomEvents(room);
      }

      // Join the room
      const joinResult = await room.join(this.state.user.id);

      // Update state
      this.state.currentRoom = room;
      this.state.rooms.set(room.id, room);
      this.emit("roomJoined", {
        room,
        joinResult
      });
      this._debug("Joined room:", room.getInfo());
      return joinResult;
    } catch (error) {
      this.emit("error", {
        error,
        action: "joinRoom"
      });
      throw error;
    }
  }

  /**
   * Leave current room
   */
  async leaveRoom() {
    if (!this.state.currentRoom) {
      return;
    }
    try {
      const room = this.state.currentRoom;
      this.emit("leavingRoom", {
        room
      });
      await room.leave();
      this.state.currentRoom = null;
      this.emit("roomLeft", {
        room
      });
      this._debug("Left room:", room.getInfo());
    } catch (error) {
      this.emit("error", {
        error,
        action: "leaveRoom"
      });
      throw error;
    }
  }

  /**
   * Get available rooms
   */
  async getRooms(options = {}) {
    this._ensureAuthenticated();
    try {
      const response = await this.apiClient.listRooms(options.page || 1, options.perPage || 20);
      this.emit("roomsLoaded", {
        rooms: response.data || []
      });
      return response.data || [];
    } catch (error) {
      this.emit("error", {
        error,
        action: "getRooms"
      });
      throw error;
    }
  }

  /**
   * Get current room
   */
  getCurrentRoom() {
    return this.state.currentRoom;
  }

  /**
   * Get room by ID
   */
  getRoom(roomId) {
    return this.state.rooms.get(roomId);
  }

  /**
   * Create sub room in current room
   */
  async createSubRoom(config) {
    if (!this.state.currentRoom) {
      throw new Error("Must be in a main room to create sub rooms");
    }
    if (this.state.currentRoom.type !== "main") {
      throw new Error("Can only create sub rooms from main rooms");
    }
    try {
      this.emit("creatingSubRoom", {
        config,
        parentRoom: this.state.currentRoom
      });
      const subRoom = await this.state.currentRoom.createSubRoom(config);
      this.emit("subRoomCreated", {
        subRoom,
        parentRoom: this.state.currentRoom
      });
      this._debug("Sub room created:", subRoom.getInfo());
      return subRoom;
    } catch (error) {
      this.emit("error", {
        error,
        action: "createSubRoom"
      });
      throw error;
    }
  }

  /**
   * Join a sub room
   */
  async joinSubRoom(subRoomCode) {
    if (!this.state.currentRoom) {
      throw new Error("Must be in a main room to join sub rooms");
    }
    try {
      this.emit("joiningSubRoom", {
        subRoomCode,
        parentRoom: this.state.currentRoom
      });

      // Find sub room
      const subRooms = await this.state.currentRoom.getSubRooms();
      const subRoom = subRooms.find(sr => sr.code === subRoomCode);
      if (!subRoom) {
        throw new Error(`Sub room with code ${subRoomCode} not found`);
      }

      // Join sub room
      const joinResult = await subRoom.joinFromMain(this.state.user.id);
      this.emit("subRoomJoined", {
        subRoom,
        parentRoom: this.state.currentRoom
      });
      this._debug("Joined sub room:", subRoom.getInfo());
      return joinResult;
    } catch (error) {
      this.emit("error", {
        error,
        action: "joinSubRoom"
      });
      throw error;
    }
  }

  /**
   * Return to main room from sub room
   */
  async returnToMainRoom() {
    if (!this.state.currentRoom || this.state.currentRoom.type !== "breakout") {
      throw new Error("Must be in a sub room to return to main room");
    }
    try {
      this.emit("returningToMainRoom", {
        subRoom: this.state.currentRoom
      });
      const subRoom = this.state.currentRoom;
      const mainRoom = await subRoom.returnToMainRoom();
      this.state.currentRoom = mainRoom;
      this.emit("returnedToMainRoom", {
        mainRoom,
        previousSubRoom: subRoom
      });
      this._debug("Returned to main room from sub room");
      return mainRoom;
    } catch (error) {
      this.emit("error", {
        error,
        action: "returnToMainRoom"
      });
      throw error;
    }
  }

  /**
   * Switch between sub rooms
   */
  async switchSubRoom(targetSubRoomCode) {
    if (!this.state.currentRoom || this.state.currentRoom.type !== "breakout") {
      throw new Error("Must be in a sub room to switch to another sub room");
    }
    try {
      this.emit("switchingSubRoom", {
        fromSubRoom: this.state.currentRoom,
        targetSubRoomCode
      });
      const currentSubRoom = this.state.currentRoom;
      const parentRoom = currentSubRoom.parentRoom;

      // Find target sub room
      const subRooms = await parentRoom.getSubRooms();
      const targetSubRoom = subRooms.find(sr => sr.code === targetSubRoomCode);
      if (!targetSubRoom) {
        throw new Error(`Sub room with code ${targetSubRoomCode} not found`);
      }

      // Switch to target sub room
      const joinResult = await currentSubRoom.switchToSubRoom(targetSubRoom);
      this.state.currentRoom = targetSubRoom;
      this.emit("subRoomSwitched", {
        fromSubRoom: currentSubRoom,
        toSubRoom: targetSubRoom
      });
      this._debug("Switched sub rooms:", {
        from: currentSubRoom.getInfo(),
        to: targetSubRoom.getInfo()
      });
      return joinResult;
    } catch (error) {
      this.emit("error", {
        error,
        action: "switchSubRoom"
      });
      throw error;
    }
  }

  /**
   * Set UI containers for video rendering
   */
  setUIContainers(mainVideoArea, sidebarArea) {
    console.warn("[ErmisCLient] Setting UI containers:", {
      mainVideoArea,
      sidebarArea
    });
    this.mediaConfig.mainVideoArea = mainVideoArea;
    this.mediaConfig.sidebarArea = sidebarArea;

    // Apply to current room if any
    if (this.state.currentRoom) {
      console.log("Applying UI containers to current room");
      this.state.currentRoom.setUIContainers(mainVideoArea, sidebarArea);
    }
  }

  /**
   * Get client state
   */
  getState() {
    return {
      user: this.state.user,
      isAuthenticated: this.state.isAuthenticated,
      currentRoom: this.state.currentRoom?.getInfo() || null,
      connectionStatus: this.state.connectionStatus,
      roomCount: this.state.rooms.size
    };
  }

  /**
   * Get client configuration
   */
  getConfig() {
    return {
      ...this.config
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };

    // Update API client if needed
    if (newConfig.host || newConfig.apiUrl) {
      this.apiClient = new ApiClient$1({
        host: this.config.host,
        apiUrl: this.config.apiUrl
      });
      if (this.state.isAuthenticated) {
        this.apiClient.setAuth(this.state.user.token, this.state.user.id);
      }
    }
    this.emit("configUpdated", {
      config: this.config
    });
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.config.debug = true;
    this._debug("Debug mode enabled");
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.config.debug = false;
  }

  /**
   * Cleanup client resources
   */
  async cleanup() {
    try {
      // Leave current room
      if (this.state.currentRoom) {
        await this.state.currentRoom.leave();
      }

      // Cleanup all rooms
      for (const room of this.state.rooms.values()) {
        await room.cleanup();
      }

      // Clear state
      this.state.rooms.clear();
      this.state.currentRoom = null;

      // Remove all listeners
      this.removeAllListeners();
      this._debug("Client cleanup completed");
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }

  /**
   * Setup event handlers for rooms
   */
  _setupRoomEvents(room) {
    // Forward room events to client
    const eventsToForward = ["joined", "left", "participantAdded", "participantRemoved", "participantPinned", "participantUnpinned", "subRoomCreated", "error"];
    eventsToForward.forEach(event => {
      room.on(event, data => {
        this.emit(`room${event.charAt(0).toUpperCase() + event.slice(1)}`, data);
      });
    });

    // Set UI containers if available
    if (this.mediaConfig.mainVideoArea && this.mediaConfig.sidebarArea) {
      room.setUIContainers(this.mediaConfig.mainVideoArea, this.mediaConfig.sidebarArea);
    }
  }

  /**
   * Setup initial event handlers
   */
  _setupEventHandlers() {
    // Handle authentication token refresh
    this.on("authenticated", () => {
      // Could implement token refresh logic here
    });

    // Handle connection status changes
    this.on("connectionStatusChanged", ({
      status
    }) => {
      if (status === "failed" && this.config.reconnectAttempts > 0) {
        this._attemptReconnect();
      }
    });
  }

  /**
   * Attempt automatic login with saved credentials
   */
  async _attemptAutoLogin() {
    if (!this.config.autoSaveCredentials) {
      return;
    }
    try {
      const savedUserId = this.storage.getItem("ermis_user_id");
      const savedToken = this.storage.getItem("ermis_token");
      if (savedUserId && savedToken) {
        this.apiClient.setAuth(savedToken, savedUserId);

        // Verify token is still valid by making a test call
        await this.apiClient.listRooms(1, 1);
        this.state.user = {
          id: savedUserId,
          token: savedToken,
          authenticatedAt: Date.now()
        };
        this.state.isAuthenticated = true;
        this._setConnectionStatus("connected");
        this.emit("autoLoginSuccess", {
          userId: savedUserId
        });
        this._debug("Auto-login successful:", savedUserId);
      }
    } catch (error) {
      // Token might be expired, clear saved credentials
      this._clearCredentials();
      this._debug("Auto-login failed:", error.message);
    }
  }

  /**
   * Attempt to reconnect
   */
  async _attemptReconnect() {
    let attempts = 0;
    while (attempts < this.config.reconnectAttempts) {
      try {
        attempts++;
        this._debug(`Reconnection attempt ${attempts}/${this.config.reconnectAttempts}`);
        await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelay));
        if (this.state.user) {
          await this.authenticate(this.state.user.id);
          this._debug("Reconnection successful");
          return;
        }
      } catch (error) {
        this._debug(`Reconnection attempt ${attempts} failed:`, error.message);
      }
    }
    this.emit("reconnectionFailed");
    this._debug("All reconnection attempts failed");
  }

  /**
   * Save user credentials
   */
  _saveCredentials() {
    if (!this.state.user) return;
    try {
      this.storage.setItem("ermis_user_id", this.state.user.id);
      this.storage.setItem("ermis_token", this.state.user.token);
      this._debug("Credentials saved");
    } catch (error) {
      this._debug("Failed to save credentials:", error);
    }
  }

  /**
   * Clear saved credentials
   */
  _clearCredentials() {
    try {
      this.storage.removeItem("ermis_user_id");
      this.storage.removeItem("ermis_token");
      this._debug("Credentials cleared");
    } catch (error) {
      this._debug("Failed to clear credentials:", error);
    }
  }

  /**
   * Set connection status
   */
  _setConnectionStatus(status) {
    if (this.state.connectionStatus !== status) {
      this.state.connectionStatus = status;
      this.emit("connectionStatusChanged", {
        status
      });
      this._debug("Connection status changed:", status);
    }
  }

  /**
   * Ensure user is authenticated
   */
  _ensureAuthenticated() {
    if (!this.state.isAuthenticated) {
      throw new Error("User must be authenticated first");
    }
  }

  /**
   * Debug logging
   */
  _debug(...args) {
    if (this.config.debug) {
      console.log("[ErmisClient]", ...args);
    }
  }
}
var ErmisClient$1 = ErmisClient;

/**
 * Ermis Classroom SDK
 * Main entry point for the SDK
 */


/**
 * SDK Version
 */
const VERSION = "1.0.0";

/**
 * Main SDK Class - Similar to LiveKit pattern
 */
class ErmisClassroom {
  /**
   * Create a new Ermis Classroom client
   * @param {Object} config - Configuration options
   * @returns {ErmisClient} - New client instance
   */
  static create(config = {}) {
    return new ErmisClient$1(config);
  }

  /**
   * Connect and authenticate user
   * @param {string} serverUrl - Server URL
   * @param {string} userId - User identifier
   * @param {Object} options - Connection options
   * @returns {Promise<ErmisClient>} - Connected client
   */
  static async connect(serverUrl, userId, options = {}) {
    const config = {
      host: serverUrl.replace(/^https?:\/\//, ""),
      ...options
    };
    const client = new ErmisClient$1(config);
    await client.authenticate(userId);
    return client;
  }

  /**
   * Get SDK version
   */
  static get version() {
    return VERSION;
  }

  /**
   * Get available events
   */
  static get events() {
    return {
      // Client events
      CLIENT_AUTHENTICATED: "authenticated",
      CLIENT_AUTHENTICATION_FAILED: "authenticationFailed",
      CLIENT_LOGGED_OUT: "loggedOut",
      CLIENT_CONNECTION_STATUS_CHANGED: "connectionStatusChanged",
      // Room events
      ROOM_CREATED: "roomCreated",
      ROOM_JOINED: "roomJoined",
      ROOM_LEFT: "roomLeft",
      // Participant events
      PARTICIPANT_ADDED: "participantAdded",
      PARTICIPANT_REMOVED: "participantRemoved",
      PARTICIPANT_PINNED: "participantPinned",
      PARTICIPANT_UNPINNED: "participantUnpinned",
      PARTICIPANT_AUDIO_TOGGLED: "audioToggled",
      PARTICIPANT_VIDEO_TOGGLED: "videoToggled",
      // Sub room events
      SUB_ROOM_CREATED: "subRoomCreated",
      SUB_ROOM_JOINED: "subRoomJoined",
      SUB_ROOM_LEFT: "subRoomLeft",
      SUB_ROOM_SWITCHED: "subRoomSwitched",
      // Error events
      ERROR: "error"
    };
  }

  /**
   * Media device utilities
   */
  static get MediaDevices() {
    return {
      /**
       * Get available media devices
       */
      async getDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) {
          throw new Error("Media devices not supported");
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
          cameras: devices.filter(d => d.kind === "videoinput"),
          microphones: devices.filter(d => d.kind === "audioinput"),
          speakers: devices.filter(d => d.kind === "audiooutput")
        };
      },
      /**
       * Get user media with constraints
       */
      async getUserMedia(constraints = {
        video: true,
        audio: true
      }) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia not supported");
        }
        return await navigator.mediaDevices.getUserMedia(constraints);
      },
      /**
       * Check for media permissions
       */
      async checkPermissions() {
        const permissions = {};
        if (navigator.permissions) {
          try {
            permissions.camera = await navigator.permissions.query({
              name: "camera"
            });
            permissions.microphone = await navigator.permissions.query({
              name: "microphone"
            });
          } catch (error) {
            console.warn("Permission check failed:", error);
          }
        }
        return permissions;
      }
    };
  }

  /**
   * Room types constants
   */
  static get RoomTypes() {
    return {
      MAIN: "main",
      BREAKOUT: "breakout",
      PRESENTATION: "presentation",
      DISCUSSION: "discussion"
    };
  }

  /**
   * Connection status constants
   */
  static get ConnectionStatus() {
    return {
      DISCONNECTED: "disconnected",
      CONNECTING: "connecting",
      CONNECTED: "connected",
      FAILED: "failed"
    };
  }

  /**
   * Participant roles constants
   */
  static get ParticipantRoles() {
    return {
      OWNER: "owner",
      MODERATOR: "moderator",
      PARTICIPANT: "participant",
      OBSERVER: "observer"
    };
  }
}

/**
 * Usage Examples:
 *
 * // Basic usage
 * import ErmisClassroom from 'ermis-classroom-sdk';
 *
 * const client = ErmisClassroom.create({
 *   host: 'your-server.com:9999',
 *   debug: true
 * });
 *
 * await client.authenticate('teacher@school.com');
 *
 * // Create and join room
 * const room = await client.createRoom({
 *   name: 'Physics Class',
 *   type: ErmisClassroom.RoomTypes.MAIN
 * });
 *
 * // Listen to events
 * client.on(ErmisClassroom.events.PARTICIPANT_ADDED, ({ participant }) => {
 *   console.log('New participant:', participant.userId);
 * });
 *
 * // Create breakout room
 * const breakoutRoom = await client.createSubRoom({
 *   name: 'Group 1',
 *   type: ErmisClassroom.RoomTypes.BREAKOUT,
 *   maxParticipants: 5
 * });
 *
 * // Join breakout room
 * await client.joinSubRoom(breakoutRoom.code);
 *
 * // Return to main room
 * await client.returnToMainRoom();
 *
 * // Alternative connect method
 * const client2 = await ErmisClassroom.connect(
 *   'https://your-server.com:9999',
 *   'student@school.com',
 *   { autoSaveCredentials: true }
 * );
 */

/**
 * Advanced Usage Examples:
 *
 * // Custom storage implementation
 * import ErmisClassroom from 'ermis-classroom-sdk';
 *
 * const customStorage = {
 *   getItem: (key) => sessionStorage.getItem(key),
 *   setItem: (key, value) => sessionStorage.setItem(key, value),
 *   removeItem: (key) => sessionStorage.removeItem(key)
 * };
 *
 * const client = ErmisClassroom.create({
 *   host: 'server.com:9999',
 *   storage: customStorage,
 *   reconnectAttempts: 5,
 *   reconnectDelay: 3000
 * });
 *
 * // Media device management
 * const devices = await ErmisClassroom.MediaDevices.getDevices();
 * console.log('Available cameras:', devices.cameras);
 *
 * // Permission checking
 * const permissions = await ErmisClassroom.MediaDevices.checkPermissions();
 * if (permissions.camera?.state !== 'granted') {
 *   // Request camera permission
 *   await ErmisClassroom.MediaDevices.getUserMedia({ video: true });
 * }
 *
 * // Room management
 * const rooms = await client.getRooms();
 * const mainRoom = rooms.find(r => r.room_type === ErmisClassroom.RoomTypes.MAIN);
 *
 * if (mainRoom) {
 *   await client.joinRoom(mainRoom.room_code);
 * }
 *
 * // Participant management
 * client.on(ErmisClassroom.events.PARTICIPANT_ADDED, ({ participant }) => {
 *   participant.on('audioToggled', ({ enabled }) => {
 *     console.log(`${participant.userId} ${enabled ? 'unmuted' : 'muted'}`);
 *   });
 *
 *   participant.on('pinToggled', ({ pinned }) => {
 *     if (pinned) {
 *       console.log(`${participant.userId} is now pinned`);
 *     }
 *   });
 * });
 *
 * // UI Integration
 * const mainVideoArea = document.getElementById('main-video');
 * const sidebarArea = document.getElementById('sidebar-videos');
 *
 * client.setUIContainers(mainVideoArea, sidebarArea);
 *
 * // Auto-render when room is joined
 * client.on(ErmisClassroom.events.ROOM_JOINED, ({ room }) => {
 *   room.renderParticipantTiles();
 * });
 *
 * // Cleanup on page unload
 * window.addEventListener('beforeunload', () => {
 *   client.cleanup();
 * });
 */

export { ApiClient$1 as ApiClient, ErmisClient$1 as ErmisClient, EventEmitter$1 as EventEmitter, Participant$1 as Participant, Room$1 as Room, SubRoom$1 as SubRoom, VERSION, ErmisClassroom as default };
//# sourceMappingURL=index.js.map
