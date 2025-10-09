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

    // Screen share state
    this.isScreenSharing = config.isScreenSharing || false;
    this.screenTile = null;
    this.screenVideoElement = null;
    this.screenSubscriber = null;
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

        <button class="screen-share-btn" id="screenShareBtn-${this.streamId}">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
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
   * Create screen share tile
   */
  createScreenShareTile() {
    const tile = document.createElement("div");
    tile.className = "video-tile screen-share-tile";
    tile.setAttribute("data-user-id", this.userId);
    tile.setAttribute("data-stream-id", `${this.streamId}_screen`);
    tile.innerHTML = `
    <video autoplay playsinline></video>
    <div class="user-label">${this.getDisplayName()} - Screen Share</div>
    <div class="screen-controls">
      <button class="stop-share-btn" id="stopShareBtn-${this.streamId}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
        Stop Sharing
      </button>
    </div>
  `;
    this.screenTile = tile;
    this.screenVideoElement = tile.querySelector("video");

    // Setup stop button
    const stopBtn = tile.querySelector(`#stopShareBtn-${this.streamId}`);
    stopBtn?.addEventListener("click", () => {
      this.emit("stopScreenShare", {
        participant: this
      });
    });
    this.emit("screenTileCreated", {
      participant: this,
      tile
    });
    return tile;
  }

  /**
   * Remove screen share tile
   */
  removeScreenShareTile() {
    if (this.screenTile && this.screenTile.parentNode) {
      this.screenTile.parentNode.removeChild(this.screenTile);
    }
    this.screenTile = null;
    this.screenVideoElement = null;
    this.isScreenSharing = false;
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
    if (!this.isLocal) {
      if (this.isPinned) {
        this.subscriber?.switchBitrate("360p");
        console.warn("Unpin participant, switch to low quality");
      } else {
        this.subscriber?.switchBitrate("720p");
        console.warn("Pin participant, switch to high quality");
      }
    }
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
   * Set screen share subscriber
   */
  // setScreenSubscriber(subscriber) {
  //   this.screenSubscriber = subscriber;
  //   if (subscriber) {
  //     this.isScreenSharing = true;
  //     this.emit("screenShareStarted", { participant: this });
  //   } else {
  //     this.isScreenSharing = false;
  //     this.emit("screenShareStopped", { participant: this });
  //   }
  // }

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

    // Cleanup screen share
    this.removeScreenShareTile();

    // Stop screen subscriber
    if (this.screenSubscriber) {
      this.screenSubscriber.stop();
      this.screenSubscriber = null;
    }
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
    this.roomId = options.roomId || "test_room";
    this.useWebRTC = options.useWebRTC || false;

    // Video configuration
    this.currentConfig = {
      codec: "avc1.640c34",
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
    this.webRtc = null;
    this.isChannelOpen = false;
    this.sequenceNumber = 0;
    this.isPublishing = false;
    this.cameraEnabled = true;
    this.micEnabled = true;
    this.hasCamera = options.hasCamera !== undefined ? options.hasCamera : true;
    this.hasMic = options.hasMic !== undefined ? options.hasMic : true;

    // Callbacks
    this.onStatusUpdate = options.onStatusUpdate || ((message, isError) => console.log(message));
    this.onStreamStart = options.onStreamStart || (() => {});
    this.onStreamStop = options.onStreamStop || (() => {});
    this.onServerEvent = options.onServerEvent || (event => {});

    // Initialize modules
    this.wasmInitialized = false;
    this.wasmInitializing = false;
    this.wasmInitPromise = null;
    this.initAudioRecorder = null;
    this.WasmEncoder = null;

    // Stream management
    this.publishStreams = new Map(); // key: channelName, value: {writer, reader, configSent, config}
    this.videoEncoders = new Map();
    // this.fecEncoders = new Map();
    this.eventStream = null; // Dedicated event stream

    this.webRtcServerUrl = options.webRtcServerUrl || "daibo.ermis.network:9991";

    // this.subStreams = [
    //   {
    //     name: "meeting_control",
    //     channelName: "meeting_control",
    //   },
    //   {
    //     name: "microphone",
    //     channelName: "mic_48k",
    //   },
    //   {
    //     name: "low",
    //     width: 640,
    //     height: 360,
    //     bitrate: 400_000,
    //     framerate: 30,
    //     channelName: "cam_360p",
    //   },
    //   {
    //     name: "high",
    //     width: 1280,
    //     height: 720,
    //     bitrate: 800_000,
    //     framerate: 30,
    //     channelName: "cam_720p",
    //   },
    //   {
    //     name: "screen",
    //     width: 1920,
    //     height: 1080,
    //     bitrate: 2_000_000,
    //     framerate: 30,
    //     channelName: "screen_share_1080p",
    //   },
    // ];
    this.subStreams = [{
      name: "meeting_control",
      channelName: CHANNEL_NAME.MEETING_CONTROL
    }, {
      name: "microphone",
      channelName: CHANNEL_NAME.MICROPHONE
    }, {
      name: "low",
      width: 640,
      height: 360,
      bitrate: 400_000,
      framerate: 30,
      channelName: CHANNEL_NAME.CAMERA_360P
    }, {
      name: "high",
      width: 1280,
      height: 720,
      bitrate: 800_000,
      framerate: 30,
      channelName: CHANNEL_NAME.CAMERA_720P
    }, {
      name: "screen",
      width: 1920,
      height: 1080,
      bitrate: 2_000_000,
      framerate: 30,
      channelName: CHANNEL_NAME.SCREEN_SHARE_1080P
    }];
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
    this.onStatusUpdate(`${this.streamType} stream obtained`);
  }
  initVideoEncoders() {
    this.subStreams.forEach(subStream => {
      if (!subStream.channelName.startsWith(CHANNEL_NAME.MICROPHONE) && !subStream.channelName.startsWith(CHANNEL_NAME.MEETING_CONTROL)) {
        console.log(`Setting up encoder for ${subStream.name}`);
        const encoder = new VideoEncoder({
          output: (chunk, metadata) => this.handleVideoChunk(chunk, metadata, subStream.name, subStream.channelName),
          error: e => this.onStatusUpdate(`Encoder ${subStream.name} error: ${e.message}`, true)
        });
        this.videoEncoders.set(subStream.name, {
          encoder,
          channelName: subStream.channelName,
          config: {
            codec: this.currentConfig.codec,
            width: subStream.width,
            height: subStream.height,
            bitrate: subStream.bitrate,
            framerate: this.currentConfig.framerate,
            latencyMode: "realtime",
            hardwareAcceleration: "prefer-hardware"
          },
          metadataReady: false,
          videoDecoderConfig: null
        });

        // Initialize FEC encoder for this stream
        // if (this.useWebRTC) {
        //   this.fecEncoders.set(subStream.channelName, new this.WasmEncoder());
        // }
      }
    });
  }
  async setupConnection() {
    if (this.useWebRTC) {
      await this.setupWebRTCConnection();
    } else {
      await this.setupWebTransportConnection();
    }
  }
  async setupWebTransportConnection() {
    this.webTransport = new WebTransport(this.publishUrl);
    await this.webTransport.ready;
    console.log("WebTransport connected to server");
    await this.createEventStream();
    for (const subStream of this.subStreams) {
      if (!subStream.channelName.startsWith("screen")) {
        await this.createBidirectionalStream(subStream.channelName);
      }
    }
    await this.sendPublisherState();
    this.isChannelOpen = true;
    this.onStatusUpdate("WebTransport connection established with event stream and media streams");
  }
  async setupWebRTCConnection() {
    try {
      this.webRtc = new RTCPeerConnection();
      for (const subStream of this.subStreams) {
        if (!subStream.channelName.startsWith("screen")) {
          await this.createDataChannel(subStream.channelName);
        }
      }
      const offer = await this.webRtc.createOffer();
      await this.webRtc.setLocalDescription(offer);
      const response = await fetch(`https://${this.webRtcServerUrl}/meeting/sdp/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          offer,
          room_id: this.roomId,
          stream_id: this.streamId
        })
      });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      const answer = await response.json();
      await this.webRtc.setRemoteDescription(answer);
      this.isChannelOpen = true;
    } catch (error) {
      console.error("WebRTC setup error:", error);
    }
  }
  async createEventStream() {
    const stream = await this.webTransport.createBidirectionalStream();
    const readable = stream.readable;
    const writable = stream.writable;
    const writer = writable.getWriter();
    const reader = readable.getReader();
    this.eventStream = {
      writer,
      reader
    };
    console.log("WebTransport event stream established");
    const initData = new TextEncoder().encode("meeting_control");
    await this.sendOverEventStream(initData);

    // Setup reader cho event stream
    this.setupEventStreamReader(reader);
    this.setupPingWorker();
  }
  setupPingWorker() {
    const senderType = this.useWebRTC ? "webrtc" : "webtransport";
    const workerPing = new Worker("polyfills/intervalWorker.js");
    workerPing.postMessage({
      interval: 1000
    });
    let lastPingTime = Date.now();
    workerPing.onmessage = e => {
      const ping = new TextEncoder().encode("ping");
      if (senderType === "webrtc") {
        this.sendOverDataChannel("meeting_control", ping, FRAME_TYPE.PING);
        console.log("Ping sent over WebRTC DataChannel");
      } else if (senderType === "webtransport") {
        console.log("Ping sent over WebTransport event stream");
        this.sendOverEventStream(ping);
      }
      if (Date.now() - lastPingTime > 1200) {
        console.warn("Ping delay detected, connection may be unstable");
      }
      lastPingTime = Date.now();
    };
  }
  setupEventStreamReader(reader) {
    (async () => {
      try {
        while (true) {
          const {
            value,
            done
          } = await reader.read();
          if (done) {
            console.log("Event stream closed by server");
            break;
          }
          if (value) {
            const msg = new TextDecoder().decode(value);
            console.log("Received event from event:", msg);
            try {
              const event = JSON.parse(msg);
              this.onServerEvent(event);
            } catch (e) {
              console.log("Non-JSON event message:", msg);
            }
          }
        }
      } catch (err) {
        console.error("Error reading from event stream:", err);
      }
    })();
  }
  async sendOverEventStream(data) {
    if (!this.eventStream) {
      console.error("Event stream not available");
      return;
    }
    if (typeof data === "string") {
      console.warn("Sending over event stream:", data);
    }
    try {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const len = bytes.length;
      const out = new Uint8Array(4 + len);
      const view = new DataView(out.buffer);
      view.setUint32(0, len, false);
      out.set(bytes, 4);
      await this.eventStream.writer.write(out);
    } catch (error) {
      console.error("Failed to send over event stream:", error);
      throw error;
    }
  }
  async sendEvent(eventData) {
    const eventJson = JSON.stringify(eventData);
    await this.sendOverEventStream(eventJson);
  }
  async sendPublisherState() {
    const stateEvent = {
      type: "PublisherState",
      streamId: this.streamId,
      hasCamera: this.hasCamera,
      hasMic: this.hasMic,
      cameraEnabled: this.hasCamera ? this.cameraEnabled : false,
      micEnabled: this.hasMic ? this.micEnabled : false,
      streamType: this.streamType,
      // 'camera' or 'display'
      timestamp: Date.now()
    };
    if (this.useWebRTC) {
      const dataJson = JSON.stringify(stateEvent);
      const eventToSend = new TextEncoder().encode(dataJson);
      this.sendOverDataChannel(CHANNEL_NAME.MEETING_CONTROL, eventToSend, FRAME_TYPE.EVENT);
    } else {
      await this.sendEvent(stateEvent);
    }
    this.onStatusUpdate("Publisher state sent to server");
  }
  async createDataChannel(channelName) {
    const id = getDataChannelId(channelName);
    const dataChannel = this.webRtc.createDataChannel(channelName, {
      ordered: false,
      id,
      negotiated: true
    });
    dataChannel.binaryType = "arraybuffer";
    dataChannel.onopen = async () => {
      this.publishStreams.set(channelName, {
        id,
        dataChannel,
        dataChannelReady: true,
        configSent: false,
        config: null
      });
      if (channelName === CHANNEL_NAME.MEETING_CONTROL) {
        console.warn("datachannel state", dataChannel.readyState);
        this.sendPublisherState();
        this.setupPingWorker();
      }
      console.log(`WebRTC data channel (${channelName}) established`);
    };
  }
  async createBidirectionalStream(channelName) {
    const stream = await this.webTransport.createBidirectionalStream();
    const readable = stream.readable;
    const writable = stream.writable;
    const writer = writable.getWriter();
    const reader = readable.getReader();
    this.publishStreams.set(channelName, {
      writer,
      reader,
      configSent: false,
      config: null
    });
    console.log(`WebTransport bidirectional stream (${channelName}) established`);
    const initData = new TextEncoder().encode(channelName);
    await this.sendOverStream(channelName, initData);

    // this.setupStreamReader(channelName, reader);

    console.log(`Stream created: ${channelName}`);
  }
  async sendOverStream(channelName, frameBytes) {
    const streamData = this.publishStreams.get(channelName);
    if (!streamData) {
      console.error(`Stream ${channelName} not found`);
      return;
    }
    try {
      const len = frameBytes.length;
      const out = new Uint8Array(4 + len);
      const view = new DataView(out.buffer);
      view.setUint32(0, len, false);
      out.set(frameBytes, 4);
      await streamData.writer.write(out);
    } catch (error) {
      console.error(`Failed to send over stream ${channelName}:`, error);
      throw error;
    }
  }

  /**
   * Send data over WebRTC DataChannel with FEC encoding for keyframes
   * @param {Uint8Array} packet - Packet created by createPacketWithHeader of binary data
   * @param {number} sequenceNumber - Sequence number | required for ordering and FEC
   * @param {number} packetType - Frame type (0-8, 0xFF for ping, 0xFE for event)
   */
  async sendOverDataChannel(channelName, packet, frameType) {
    const dataChannel = this.publishStreams.get(channelName)?.dataChannel;
    const sequenceNumber = this.sequenceNumber;
    const dataChannelReady = this.publishStreams.get(channelName)?.dataChannelReady;
    if (!dataChannelReady || !dataChannel || dataChannel.readyState !== "open") {
      console.warn("DataChannel not ready");
      return;
    }
    try {
      const needFecEncode = frameType === 0 || frameType === 2 || frameType === 4 || frameType === 7 || frameType === FRAME_TYPE.CONFIG;
      packet.length > 1000;

      // define packetType , video : 0x00, audio 0x01, ping: 0xFF, event: 0xFE, config: 0xFD
      const packetType = getTransportPacketType(frameType);
      if (needFecEncode && packet.length > 100) {
        let fecPackets = 2;
        const MTU = 1024;
        const HEADER_SIZE = 20; // 4 + 1 + 1 + 14
        const chunkSize = MTU - HEADER_SIZE; // = 1004

        const encoder = new this.WasmEncoder(packet, chunkSize);
        const configBuf = encoder.getConfigBuffer();

        // parse config buffer
        // - 8 bytes: transfer_length (u64)
        // - 2 bytes: symbol_size (u16)
        // - 1 byte:  num_source_blocks (u8)
        // - 2 bytes: num_sub_blocks (u16)
        // - 1 byte:  symbol_alignment (u8)
        const view = new DataView(configBuf.buffer);
        const transferLength = view.getBigUint64(0, false);
        const symbolSize = view.getUint16(8, false);
        const sourceBlocks = view.getUint8(10);
        const subBlocks = view.getUint16(11, false);
        const alignment = view.getUint8(13);
        const packets = encoder.encode(fecPackets);
        const raptorQConfig = {
          transferLength,
          symbolSize,
          sourceBlocks,
          subBlocks,
          alignment
        };
        for (let i = 0; i < packets.length; i++) {
          const fecPacket = packets[i];
          const wrapper = this.createFecPacketWithHeader(fecPacket, sequenceNumber, packetType, raptorQConfig);
          dataChannel.send(wrapper);
        }
        return;
      }

      // No FEC encoding - send with regular wrapper

      const wrapper = this.createRegularPacketWithHeader(packet, sequenceNumber, packetType);
      dataChannel.send(wrapper);
    } catch (error) {
      console.error("Failed to send over DataChannel:", error);
    }
  }

  /**
   * Create regular packet with standard header (non-FEC)
   * @param {Uint8Array} packet - Raw packet data
   * @param {number} sequenceNumber - Sequence number for packet ordering
   * @param {number} packetType - Packet type (0x00: video, 0x01: audio, etc.)
   * @returns {Uint8Array} - Wrapped packet with standard header
   */
  createFecPacketWithHeader(packet, sequenceNumber, packetType, raptorQConfig) {
    const {
      transferLength,
      symbolSize,
      sourceBlocks,
      subBlocks,
      alignment
    } = raptorQConfig;

    // Create header: 4 bytes seq + 1 byte FEC marker + 1 byte packet type + 14 bytes RaptorQ header
    const header = new ArrayBuffer(4 + 1 + 1 + 14);
    const view = new DataView(header);

    // 4 bytes chunk id (sequence number)
    view.setUint32(0, sequenceNumber, false); // big-endian
    // 1 byte FEC marker
    view.setUint8(4, 0xff); // FEC marker
    // 1 byte packet type
    view.setUint8(5, packetType);
    // 14 bytes RaptorQ packet header
    view.setBigUint64(6, transferLength, false);
    view.setUint16(14, symbolSize, false);
    view.setUint8(16, sourceBlocks);
    view.setUint16(17, subBlocks, false);
    view.setUint8(19, alignment);

    // Combine header and packet data
    const wrapper = new Uint8Array(header.byteLength + packet.length);
    wrapper.set(new Uint8Array(header), 0);
    wrapper.set(packet, header.byteLength);
    return wrapper;
  }

  /**
   * Create regular packet with standard header (non-FEC)
   * @param {Uint8Array} packet - Raw packet data
   * @param {number} sequenceNumber - Sequence number for packet ordering
   * @param {number} packetType - Packet type (0x00: video, 0x01: audio, etc.)
   * @returns {Uint8Array} - Wrapped packet with standard header
   */
  createRegularPacketWithHeader(packet, sequenceNumber, packetType) {
    // Create wrapper: 4 bytes seq + 1 byte FEC flag + 1 byte packet type + data
    const wrapper = new Uint8Array(6 + packet.length);
    const view = new DataView(wrapper.buffer);

    // 4 bytes sequence number
    view.setUint32(0, sequenceNumber, false);
    // 1 byte FEC flag (0x00 = not FEC)
    view.setUint8(4, 0x00);
    // 1 byte packet type
    view.setUint8(5, packetType);
    // Copy packet data
    wrapper.set(packet, 6);
    return wrapper;
  }

  // ===== SCREEN SHARE FUNCTIONS =====

  async startShareScreen(stream) {
    if (!stream) {
      throw new Error("No stream provided for screen sharing");
    }

    // Store screen share stream
    this.screenStream = stream;
    this.isScreenSharing = true;
    const channelName = "screen_share_1080p";
    try {
      // Create WebTransport stream for screen share
      await this.createBidirectionalStream(channelName);
      const startEvent = {
        type: "start_share_screen",
        sender_stream_id: this.streamId
      };
      await this.sendEvent(startEvent);
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (!videoTrack) {
        throw new Error("No video track found in screen share stream");
      }

      // Setup screen share video encoder
      const screenConfig = this.subStreams.find(s => s.channelName === channelName);
      const screenEncoder = new VideoEncoder({
        output: (chunk, metadata) => this.handleScreenVideoChunk(chunk, metadata, channelName),
        error: e => this.onStatusUpdate(`Screen encoder error: ${e.message}`, true)
      });
      const encoderConfig = {
        codec: this.currentConfig.codec,
        width: screenConfig.width,
        height: screenConfig.height,
        bitrate: screenConfig.bitrate,
        framerate: screenConfig.framerate,
        latencyMode: "realtime",
        hardwareAcceleration: "prefer-hardware"
      };
      screenEncoder.configure(encoderConfig);
      this.screenVideoEncoder = {
        encoder: screenEncoder,
        config: encoderConfig,
        metadataReady: false,
        videoDecoderConfig: null
      };

      // Setup screen share audio if available
      if (audioTrack) {
        const audioRecorderOptions = {
          encoderApplication: 2051,
          encoderComplexity: 0,
          encoderFrameSize: 20,
          timeSlice: 100
        };
        this.screenAudioRecorder = await this.initAudioRecorder(audioTrack, audioRecorderOptions);
        this.screenAudioRecorder.ondataavailable = typedArray => this.handleScreenAudioChunk(typedArray, channelName);
        await this.screenAudioRecorder.start({
          timeSlice: audioRecorderOptions.timeSlice
        });
        this.screenAudioBaseTime = 0;
        this.screenAudioSamplesSent = 0;
      }

      // Start video processing
      const triggerWorker = new Worker("polyfills/triggerWorker.js");
      triggerWorker.postMessage({
        frameRate: screenConfig.framerate
      });
      this.screenVideoProcessor = new MediaStreamTrackProcessor(videoTrack, triggerWorker, true);
      const reader = this.screenVideoProcessor.readable.getReader();
      let frameCounter = 0;

      // Handle video track ending (user stops sharing)
      videoTrack.onended = () => {
        this.stopShareScreen();
      };

      // Process screen share video frames
      (async () => {
        try {
          while (this.isScreenSharing) {
            const result = await reader.read();
            if (result.done) break;
            const frame = result.value;
            if (!window.screenBaseTimestamp) {
              window.screenBaseTimestamp = frame.timestamp;
            }
            frameCounter++;
            const keyFrame = frameCounter % 30 === 0;
            if (this.screenVideoEncoder.encoder.encodeQueueSize <= 2) {
              this.screenVideoEncoder.encoder.encode(frame, {
                keyFrame
              });
            }
            frame.close();
          }
        } catch (error) {
          this.onStatusUpdate(`Screen share video error: ${error.message}`, true);
          console.error("Screen share video error:", error);
        }
      })();
      this.onStatusUpdate("Screen sharing started");
    } catch (error) {
      this.onStatusUpdate(`Failed to start screen share: ${error.message}`, true);
      this.stopShareScreen();
      throw error;
    }
  }
  async stopShareScreen() {
    if (!this.isScreenSharing) {
      return;
    }
    try {
      this.isScreenSharing = false;
      const channelName = "screen_share_1080p";

      // send stop event to server
      const stopEvent = {
        type: "stop_share_screen",
        sender_stream_id: this.streamId
      };
      await this.sendEvent(stopEvent);

      // Stop and close video encoder
      if (this.screenVideoEncoder && this.screenVideoEncoder.encoder) {
        if (this.screenVideoEncoder.encoder.state !== "closed") {
          await this.screenVideoEncoder.encoder.flush();
          this.screenVideoEncoder.encoder.close();
        }
        this.screenVideoEncoder = null;
      }

      // Stop audio recorder
      if (this.screenAudioRecorder && typeof this.screenAudioRecorder.stop === "function") {
        await this.screenAudioRecorder.stop();
        this.screenAudioRecorder = null;
      }

      // Close screen share stream
      const streamData = this.publishStreams.get(channelName);
      if (streamData && streamData.writer) {
        await streamData.writer.close();
        this.publishStreams.delete(channelName);
      }

      // Stop all tracks in screen stream
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
      }

      // Reset state
      this.screenAudioBaseTime = 0;
      this.screenAudioSamplesSent = 0;
      this.screenAudioConfig = null;
      window.screenBaseTimestamp = null;
      this.onStatusUpdate("Screen sharing stopped");
    } catch (error) {
      this.onStatusUpdate(`Error stopping screen share: ${error.message}`, true);
      throw error;
    }
  }

  // ===== HELPER FUNCTIONS FOR SCREEN SHARE =====

  handleScreenVideoChunk(chunk, metadata, channelName) {
    if (!this.screenVideoEncoder) return;
    const streamData = this.publishStreams.get(channelName);
    if (!streamData) return;

    // Handle metadata and send decoder configs
    if (metadata && metadata.decoderConfig && !this.screenVideoEncoder.metadataReady) {
      this.screenVideoEncoder.videoDecoderConfig = {
        codec: metadata.decoderConfig.codec,
        codedWidth: metadata.decoderConfig.codedWidth,
        codedHeight: metadata.decoderConfig.codedHeight,
        frameRate: this.screenVideoEncoder.config.framerate,
        description: metadata.decoderConfig.description
      };
      this.screenVideoEncoder.metadataReady = true;
      console.log("Screen video config ready:", this.screenVideoEncoder.videoDecoderConfig);

      // Check if we have audio config ready and send combined configs
      this.sendScreenDecoderConfigs(channelName);
    }
    if (!streamData.configSent) return;
    const chunkData = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(chunkData);
    const frameType = chunk.type === "key" ? 4 : 5; // screen_share_1080p key/delta

    const packet = this.createPacketWithHeader(chunkData, chunk.timestamp, frameType);
    if (this.useWebRTC) {
      this.sequenceNumber++;
      this.sendOverDataChannel(channelName, packet, frameType);
    } else {
      this.sendOverStream(channelName, packet);
    }
  }
  handleScreenAudioChunk(typedArray, channelName) {
    if (!this.isScreenSharing || !typedArray || typedArray.byteLength === 0) return;
    const streamData = this.publishStreams.get(channelName);
    if (!streamData) return;
    try {
      const dataArray = new Uint8Array(typedArray);

      // Check for Opus header "OggS"
      if (dataArray.length >= 4 && dataArray[0] === 79 && dataArray[1] === 103 && dataArray[2] === 103 && dataArray[3] === 83) {
        if (!this.screenAudioConfig) {
          const description = this.createPacketWithHeader(dataArray, performance.now() * 1000, FRAME_TYPE.AUDIO);
          this.screenAudioConfig = {
            codec: "opus",
            sampleRate: 48000,
            numberOfChannels: 2,
            // Screen share audio is typically stereo
            description: description
          };
          console.log("Screen audio config ready:", this.screenAudioConfig);

          // Check if we have video config ready and send combined configs
          this.sendScreenDecoderConfigs(channelName);
        }

        // Initialize timing
        if (this.screenAudioBaseTime === 0 && window.screenBaseTimestamp) {
          this.screenAudioBaseTime = window.screenBaseTimestamp;
          this.screenAudioSamplesSent = 0;
        } else if (this.screenAudioBaseTime === 0 && !window.screenBaseTimestamp) {
          this.screenAudioBaseTime = performance.now() * 1000;
          this.screenAudioSamplesSent = 0;
        }
        const timestamp = this.screenAudioBaseTime + Math.floor(this.screenAudioSamplesSent * 1000000 / 48000);
        if (streamData.configSent) {
          const packet = this.createPacketWithHeader(dataArray, timestamp, FRAME_TYPE.AUDIO);
          if (this.useWebRTC) {
            // audio chunk dont need fec and sequence number
            this.sendOverDataChannel(channelName, packet, FRAME_TYPE.AUDIO);
          } else {
            this.sendOverStream(channelName, packet);
          }
        }
        this.screenAudioSamplesSent += 960; // 20ms at 48kHz
      }
    } catch (error) {
      console.error("Failed to send screen audio data:", error);
    }
  }
  async sendScreenDecoderConfigs(channelName) {
    const streamData = this.publishStreams.get(channelName);
    if (!streamData || streamData.configSent) return;

    // Wait until both video and audio configs are ready (if audio exists)
    const hasAudio = this.screenAudioRecorder !== null;
    const videoReady = this.screenVideoEncoder && this.screenVideoEncoder.metadataReady;
    const audioReady = !hasAudio || this.screenAudioConfig;
    if (!videoReady || !audioReady) {
      console.log("Waiting for configs... videoReady:", videoReady, "audioReady:", audioReady);
      return; // Wait for both configs
    }
    try {
      const vConfigUint8 = new Uint8Array(this.screenVideoEncoder.videoDecoderConfig.description);
      const vConfigBase64 = this.uint8ArrayToBase64(vConfigUint8);
      const config = {
        type: "DecoderConfigs",
        channelName: channelName,
        videoConfig: {
          codec: this.screenVideoEncoder.videoDecoderConfig.codec,
          codedWidth: this.screenVideoEncoder.videoDecoderConfig.codedWidth,
          codedHeight: this.screenVideoEncoder.videoDecoderConfig.codedHeight,
          frameRate: this.screenVideoEncoder.videoDecoderConfig.frameRate,
          description: vConfigBase64
        }
      };

      // Add audio config if available
      if (this.screenAudioConfig) {
        const aConfigBase64 = this.uint8ArrayToBase64(new Uint8Array(this.screenAudioConfig.description));
        config.audioConfig = {
          codec: this.screenAudioConfig.codec,
          sampleRate: this.screenAudioConfig.sampleRate,
          numberOfChannels: this.screenAudioConfig.numberOfChannels,
          description: aConfigBase64
        };
      }
      console.log("Sending screen share decoder configs:", config);
      const packet = new TextEncoder().encode(JSON.stringify(config));
      if (this.useWebRTC) {
        await this.sendOverDataChannel(channelName, packet, FRAME_TYPE.CONFIG);
      } else {
        await this.sendOverStream(channelName, packet);
      }
      streamData.configSent = true;
      this.onStatusUpdate(`Screen share configs sent for: ${channelName}`);
    } catch (error) {
      console.error(`Failed to send screen share configs:`, error);
    }
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
    this.initVideoEncoders();
    this.videoEncoders.forEach(encoderObj => {
      encoderObj.encoder.configure(encoderObj.config);
    });
    const triggerWorker = new Worker("polyfills/triggerWorker.js");
    triggerWorker.postMessage({
      frameRate: this.currentConfig.framerate
    });
    const track = this.stream.getVideoTracks()[0];
    this.videoProcessor = new MediaStreamTrackProcessor(track, triggerWorker, true);
    const reader = this.videoProcessor.readable.getReader();
    let frameCounter = 0;
    const cameraEncoders = Array.from(this.videoEncoders.entries()).filter(([_, obj]) => obj.channelName.startsWith("cam"));

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
            console.log("Camera disabled, skipping frame");
            frame.close();
            continue;
          }
          frameCounter++;
          const keyFrame = frameCounter % 30 === 0;
          for (let i = 0; i < cameraEncoders.length; i++) {
            const [quality, encoderObj] = cameraEncoders[i];
            const isLastEncoder = i === cameraEncoders.length - 1;
            if (encoderObj.encoder.encodeQueueSize <= 2) {
              const frameToEncode = isLastEncoder ? frame : new VideoFrame(frame);
              encoderObj.encoder.encode(frameToEncode, {
                keyFrame
              });
              frameToEncode.close();
            }
          }
        }
      } catch (error) {
        this.onStatusUpdate(`Video processing error: ${error.message}`, true);
        console.error("Video capture error:", error);
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
    audioRecorder.ondataavailable = typedArray => this.handleOpusAudioChunk(typedArray, CHANNEL_NAME.MICROPHONE);
    await audioRecorder.start({
      timeSlice: audioRecorderOptions.timeSlice
    });
    console.log("this publish streams", this.publishStreams);
    return audioRecorder;
  }
  handleVideoChunk(chunk, metadata, quality, channelName) {
    const encoderObj = this.videoEncoders.get(quality);
    if (!encoderObj) return;
    const streamData = this.publishStreams.get(channelName);
    if (!streamData) return;
    if (metadata && metadata.decoderConfig && !encoderObj.metadataReady) {
      encoderObj.videoDecoderConfig = {
        codec: metadata.decoderConfig.codec,
        codedWidth: metadata.decoderConfig.codedWidth,
        codedHeight: metadata.decoderConfig.codedHeight,
        frameRate: this.currentConfig.framerate,
        description: metadata.decoderConfig.description
      };
      encoderObj.metadataReady = true;
      console.warn("Video config ready for", channelName, encoderObj.videoDecoderConfig);
      this.sendStreamConfig(channelName, encoderObj.videoDecoderConfig, "video");
    }
    if (!streamData.configSent) return;
    const chunkData = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(chunkData);
    const frameType = getFrameType(channelName, chunk.type);
    const packet = this.createPacketWithHeader(chunkData, chunk.timestamp, frameType);
    if (this.useWebRTC) {
      this.sendOverDataChannel(channelName, packet, frameType);
      this.sequenceNumber++;
      return;
    } else {
      this.sendOverStream(channelName, packet);
    }
  }
  handleOpusAudioChunk(typedArray, channelName) {
    if (!this.micEnabled) return;
    if (!this.isChannelOpen || !typedArray || typedArray.byteLength === 0) return;
    const streamData = this.publishStreams.get(channelName);
    if (!streamData) return;
    try {
      const dataArray = new Uint8Array(typedArray);
      // Check for Opus header "OggS"
      if (dataArray.length >= 4 && dataArray[0] === 79 && dataArray[1] === 103 && dataArray[2] === 103 && dataArray[3] === 83) {
        if (!streamData.configSent && !streamData.config) {
          const description = this.createPacketWithHeader(dataArray, performance.now() * 1000, FRAME_TYPE.AUDIO);
          const audioConfig = {
            codec: "opus",
            sampleRate: 48000,
            numberOfChannels: 1,
            description: description
          };
          streamData.config = audioConfig;
          console.warn("Send mic_48k config", audioConfig);
          this.sendStreamConfig(channelName, audioConfig, "audio");
        }

        // Initialize timing
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
        if (streamData.configSent) {
          const packet = this.createPacketWithHeader(dataArray, timestamp, FRAME_TYPE.AUDIO);
          if (this.useWebRTC) {
            // audio chunk dont need fec and sequence number
            this.sendOverDataChannel(channelName, packet, FRAME_TYPE.AUDIO);
          } else {
            this.sendOverStream(channelName, packet);
          }
        }
      }
    } catch (error) {
      console.error("Failed to send audio data:", error);
    }
  }
  async sendStreamConfig(channelName, config, mediaType) {
    const streamData = this.publishStreams.get(channelName);
    if (!streamData || streamData.configSent) return;
    try {
      let configPacket;
      if (mediaType === "video") {
        const vConfigUint8 = new Uint8Array(config.description);
        const vConfigBase64 = this.uint8ArrayToBase64(vConfigUint8);
        configPacket = {
          type: "StreamConfig",
          channelName: channelName,
          mediaType: "video",
          config: {
            codec: config.codec,
            codedWidth: config.codedWidth,
            codedHeight: config.codedHeight,
            frameRate: config.frameRate,
            quality: config.quality,
            description: vConfigBase64
          }
        };
      } else if (mediaType === "audio") {
        const aConfigBase64 = this.uint8ArrayToBase64(new Uint8Array(config.description));
        configPacket = {
          type: "StreamConfig",
          channelName: channelName,
          mediaType: "audio",
          config: {
            codec: config.codec,
            sampleRate: config.sampleRate,
            numberOfChannels: config.numberOfChannels,
            description: aConfigBase64
          }
        };
      }
      console.log("send stream config", configPacket);
      const packet = new TextEncoder().encode(JSON.stringify(configPacket));
      if (this.useWebRTC) {
        this.sendOverDataChannel(channelName, packet, FRAME_TYPE.CONFIG);
      } else {
        await this.sendOverStream(channelName, packet);
      }
      streamData.configSent = true;
      streamData.config = config;
      this.onStatusUpdate(`Config sent for stream: ${channelName}`);
    } catch (error) {
      console.error(`Failed to send config for ${channelName}:`, error);
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
    // type mapping
    // video-360p-key = 0
    // video-360p-delta = 1
    // video-720p-key = 2
    // video-720p-delta = 3
    // video-1080p-key = 4
    // video-1080p-delta = 5
    // audio = 6
    // config = 7
    // ping = 8

    packet[4] = type;
    const view = new DataView(packet.buffer, 0, 4);
    view.setUint32(0, safeTimestamp, false);
    packet.set(data instanceof ArrayBuffer ? new Uint8Array(data) : data, HEADER_SIZE);
    return packet;
  }
  uint8ArrayToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
  async stop() {
    if (!this.isPublishing) {
      return;
    }
    try {
      this.isPublishing = false;

      // Close video encoders
      for (const [quality, encoderObj] of this.videoEncoders) {
        if (encoderObj.encoder && encoderObj.encoder.state !== "closed") {
          await encoderObj.encoder.flush();
          encoderObj.encoder.close();
        }
      }
      this.videoEncoders.clear();

      // Stop audio processor
      if (this.audioProcessor && typeof this.audioProcessor.stop === "function") {
        await this.audioProcessor.stop();
        this.audioProcessor = null;
      }

      // Close all streams
      for (const [channelName, streamData] of this.publishStreams) {
        if (streamData.writer) {
          await streamData.writer.close();
        }
      }
      this.publishStreams.clear();

      // Close event stream
      if (this.eventStream && this.eventStream.writer) {
        await this.eventStream.writer.close();
        this.eventStream = null;
      }

      // Close WebTransport
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
      activeStreams: Array.from(this.publishStreams.keys())
    };
  }
}

/**
 * Frame type constants for different media streams and control messages
 */
const FRAME_TYPE = {
  // Video frame types
  CAM_360P_KEY: 0,
  CAM_360P_DELTA: 1,
  CAM_720P_KEY: 2,
  CAM_720P_DELTA: 3,
  SCREEN_SHARE_KEY: 4,
  SCREEN_SHARE_DELTA: 5,
  // Audio frame type
  AUDIO: 6,
  // Control message types
  CONFIG: 0xfd,
  EVENT: 0xfe,
  PING: 0xff
};

/**
 * Transport packet type constants for network protocol
 */
const TRANSPORT_PACKET_TYPE = {
  VIDEO: 0x00,
  AUDIO: 0x01,
  CONFIG: 0xfd,
  EVENT: 0xfe,
  PING: 0xff
};

/**
 * Helper function to get frame type based on channel name and chunk type
 * @param {string} channelName - Channel name (cam_360p, cam_720p, screen_share_1080p)
 * @param {string} chunkType - Chunk type ("key" or "delta")
 * @returns {number} Frame type constant
 */
function getFrameType(channelName, chunkType) {
  switch (channelName) {
    case CHANNEL_NAME.CAMERA_360P:
      return chunkType === "key" ? FRAME_TYPE.CAM_360P_KEY : FRAME_TYPE.CAM_360P_DELTA;
    case CHANNEL_NAME.CAMERA_720P:
      return chunkType === "key" ? FRAME_TYPE.CAM_720P_KEY : FRAME_TYPE.CAM_720P_DELTA;
    case CHANNEL_NAME.SCREEN_SHARE_1080P:
      return chunkType === "key" ? FRAME_TYPE.SCREEN_SHARE_KEY : FRAME_TYPE.SCREEN_SHARE_DELTA;
    default:
      return FRAME_TYPE.CAM_720P_KEY;
    // fallback
  }
}

/**
 * Helper function to get transport packet type from frame type
 * @param {number} frameType - Frame type constant
 * @returns {number} Transport packet type constant
 */
function getTransportPacketType(frameType) {
  switch (frameType) {
    case FRAME_TYPE.PING:
      return TRANSPORT_PACKET_TYPE.PING;
    case FRAME_TYPE.EVENT:
      return TRANSPORT_PACKET_TYPE.EVENT;
    case FRAME_TYPE.CONFIG:
      return TRANSPORT_PACKET_TYPE.CONFIG;
    case FRAME_TYPE.AUDIO:
      return TRANSPORT_PACKET_TYPE.AUDIO;
    default:
      return TRANSPORT_PACKET_TYPE.VIDEO;
    // All video frame types
  }
}

/**
 * Channel name constants for different media streams
 */
const CHANNEL_NAME = {
  // Control channels
  MEETING_CONTROL: "meeting_control",
  // Audio channels
  MICROPHONE: "mic_48k",
  // Video channels - Camera
  CAMERA_360P: "cam_360p",
  CAMERA_720P: "cam_720p",
  // Video channels - Screen share
  SCREEN_SHARE_1080P: "screen_share_1080p"
};

/**
 * Helper function to get data channel ID from channel name
 * @param {string} channelName - Channel name
 * @returns {number} Data channel ID for WebRTC
 */
function getDataChannelId(channelName) {
  switch (channelName) {
    case CHANNEL_NAME.MEETING_CONTROL:
      return 0;
    case CHANNEL_NAME.MICROPHONE:
      return 1;
    case CHANNEL_NAME.CAMERA_360P:
      return 2;
    case CHANNEL_NAME.CAMERA_720P:
      return 3;
    case CHANNEL_NAME.SCREEN_SHARE_1080P:
      return 4;
    default:
      return 5;
    // fallback
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
    this.userMediaWorker = config.userMediaWorker || "sfu-adaptive-bitrate.ermis-network.workers.dev";
    this.screenShareWorker = config.screenShareWorker || "sfu-screen-share.ermis-network.workers.dev";
    this.videoElement = config.videoElement;
    this.isOwnStream = config.isOwnStream || false;

    // Media configuration
    this.mediaWorkerUrl = config.mediaWorkerUrl || "workers/media-worker-ab.js";
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

    // Screen share flag
    this.isScreenSharing = config.isScreenSharing || false;
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
        type: "toggleAudio"
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
      const workerHost = this.isScreenSharing ? this.screenShareWorker : this.userMediaWorker;
      const mediaUrl = `wss://${workerHost}/meeting/${this.roomId}/${this.streamId}`;
      console.log("try to init worker with url:", mediaUrl);
      this.worker.postMessage({
        type: "init",
        data: {
          mediaUrl
        },
        port: channelPort,
        quality: "360p",
        // default quality
        isShare: this.isScreenSharing
      }, [channelPort]);
    } catch (error) {
      throw new Error(`Worker initialization failed: ${error.message}`);
    }
  }
  switchBitrate(quality) {
    // 360p | 720p
    if (this.worker) {
      this.worker.postMessage({
        type: "switchBitrate",
        quality
      });
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
      isLocal,
      isScreenSharing: memberData.is_screen_sharing || false
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
   * Setup screen share button UI and event handlers
   * Call this method after local participant tile is created
   */
  setupScreenShareButton() {
    if (!this.localParticipant || !this.localParticipant.tile) {
      console.warn("Local participant or tile not available for screen share setup");
      return;
    }
    const btn = this.localParticipant.tile.querySelector(`#screenShareBtn-${this.localParticipant.streamId}`);
    if (!btn) {
      console.warn("Screen share button not found in local participant tile");
      return;
    }
    let isScreenSharing = false;

    // Button click handler - directly call room's screen share methods
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        if (!isScreenSharing) {
          // Call room's startScreenShare method
          await this.startScreenShare();
          isScreenSharing = true;
          btn.classList.add("sharing");

          // Update button icon or text if needed
          const svg = btn.querySelector("svg");
          if (svg) {
            svg.style.color = "#4CAF50"; // Green when sharing
          }
        } else {
          // Call room's stopScreenShare method
          await this.stopScreenShare();
          isScreenSharing = false;
          btn.classList.remove("sharing");

          // Reset button icon color
          const svg = btn.querySelector("svg");
          if (svg) {
            svg.style.color = "white"; // Default color
          }
        }
      } catch (error) {
        console.error("Screen share button error:", error);
        // Reset button state on error
        isScreenSharing = false;
        btn.classList.remove("sharing");
        const svg = btn.querySelector("svg");
        if (svg) {
          svg.style.color = "white";
        }
      } finally {
        btn.disabled = false;
      }
    });

    // Listen to room events to sync button state
    this.on("screenShareStarted", () => {
      isScreenSharing = true;
      btn.classList.add("sharing");
      btn.disabled = false;

      // Update local participant state
      if (this.localParticipant) {
        this.localParticipant.isScreenSharing = true;
      }

      // Update button visual
      const svg = btn.querySelector("svg");
      if (svg) {
        svg.style.color = "#4CAF50";
      }
    });
    this.on("screenShareStopped", () => {
      isScreenSharing = false;
      btn.classList.remove("sharing");
      btn.disabled = false;

      // Update local participant state
      if (this.localParticipant) {
        this.localParticipant.isScreenSharing = false;
      }

      // Reset button visual
      const svg = btn.querySelector("svg");
      if (svg) {
        svg.style.color = "white";
      }
    });
    this.on("screenShareStarting", () => {
      btn.disabled = true; // Disable during transition
    });
    this.on("screenShareStopping", () => {
      btn.disabled = true; // Disable during transition
    });
    this.on("error", ({
      action,
      error
    }) => {
      if (action === "startScreenShare" || action === "stopScreenShare") {
        // Reset button state on screen share errors
        isScreenSharing = false;
        btn.classList.remove("sharing");
        btn.disabled = false;
        const svg = btn.querySelector("svg");
        if (svg) {
          svg.style.color = "white";
        }

        // Update participant state
        if (this.localParticipant) {
          this.localParticipant.isScreenSharing = false;
        }
      }
    });
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
      streamId: this.localParticipant.streamId,
      width: 1280,
      height: 720,
      framerate: 30,
      bitrate: 1_500_000,
      roomId: this.id,
      // use webtransport if supported, fallback to WebRTC in safari
      useWebRTC: true,
      onStatusUpdate: (msg, isError) => {
        this.localParticipant.setConnectionStatus(isError ? "failed" : "connected");
      },
      onServerEvent: async event => {
        await this._handleServerEvent(event);
      }
    });
    await publisher.startPublishing();
    this.localParticipant.setPublisher(publisher);

    // Setup screen share button in participant tile
    this.setupScreenShareButton();
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
      isScreenSharing: false,
      // DO for adaptive camera url
      userMediaWorker: "sfu-adaptive-bitrate-webrtc.ermis-network.workers.dev",
      // DO for screen share url
      screenShareWorker: "sfu-webrtc-screen_share_test.ermis-network.workers.dev",
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
    if (participant.isScreenSharing) {
      await this.handleRemoteScreenShare(participant.userId, participant.streamId, true);
    }
  }

  /**
   * Handle server events from publisher
   */
  async _handleServerEvent(event) {
    console.log("Received server event:", event);
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
    if (event.type === "start_share_screen") {
      const participant = event.participant;
      if (participant.user_id === this.localParticipant?.userId) return;
      await this.handleRemoteScreenShare(participant.user_id, participant.stream_id, true);
    }
    if (event.type === "stop_share_screen") {
      const participant = event.participant;
      if (participant.user_id === this.localParticipant?.userId) return;
      await this.handleRemoteScreenShare(participant.user_id, participant.stream_id, false);
    }
  }

  /**
   * Setup event listeners for a participant
   */

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
   * Start screen sharing for local participant
   */
  async startScreenShare() {
    if (!this.localParticipant || !this.localParticipant.publisher) {
      throw new Error("Local participant or publisher not available");
    }
    try {
      this.emit("screenShareStarting", {
        room: this
      });

      // Get display media
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1920,
          height: 1080
        },
        audio: true
      });

      // Start screen share through publisher
      await this.localParticipant.publisher.startShareScreen(screenStream);
      this.emit("screenShareStarted", {
        room: this
      });
      return screenStream;
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "startScreenShare"
      });
      throw error;
    }
  }

  /**
   * Stop screen sharing for local participant
   */
  async stopScreenShare() {
    if (!this.localParticipant || !this.localParticipant.publisher) {
      throw new Error("Local participant or publisher not available");
    }
    try {
      this.emit("screenShareStopping", {
        room: this
      });
      await this.localParticipant.publisher.stopShareScreen();
      this.emit("screenShareStopped", {
        room: this
      });
    } catch (error) {
      this.emit("error", {
        room: this,
        error,
        action: "stopScreenShare"
      });
      throw error;
    }
  }

  /**
   * Handle remote screen share
   */
  async handleRemoteScreenShare(participantId, screenStreamId, isStarting) {
    const participant = this.participants.get(participantId);
    if (!participant) return;
    if (isStarting) {
      // Create screen share tile
      const screenTile = participant.createScreenShareTile();

      // Append to main video area (screen share takes priority)
      if (this.mainVideoArea) {
        this.mainVideoArea.innerHTML = "";
        this.mainVideoArea.appendChild(screenTile);
      }

      // Create subscriber for screen share
      const screenSubscriber = new Subscriber$1({
        streamId: screenStreamId,
        roomId: this.id,
        host: this.mediaConfig.host,
        videoElement: participant.screenVideoElement,
        isScreenSharing: true,
        onStatus: (msg, isError) => {
          console.log(`Screen share status: ${msg}`);
        },
        audioWorkletUrl: "workers/audio-worklet1.js",
        mstgPolyfillUrl: "polyfills/MSTG_polyfill.js"
      });

      // Add to audio mixer if has audio
      if (this.audioMixer) {
        screenSubscriber.setAudioMixer(this.audioMixer);
      }
      await screenSubscriber.start();

      // Store reference
      participant.screenSubscriber = screenSubscriber;
      participant.isScreenSharing = true;
      // participant.setScreenSubscriber(screenSubscriber);

      this.emit("remoteScreenShareStarted", {
        room: this,
        participant
      });
    } else {
      // Stop screen share
      if (participant.screenSubscriber) {
        participant.screenSubscriber.stop();
        participant.screenSubscriber = null;
      }
      participant.removeScreenShareTile();

      // Restore pinned participant to main video
      if (this.pinnedParticipant && this.pinnedParticipant.tile) {
        if (this.mainVideoArea) {
          this.mainVideoArea.innerHTML = "";
          this.mainVideoArea.appendChild(this.pinnedParticipant.tile);
        }
      }
      this.emit("remoteScreenShareStopped", {
        room: this,
        participant
      });
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
      webtpUrl: config.webtpUrl || "https://daibo.ermis.network:4457/meeting/wt",
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
