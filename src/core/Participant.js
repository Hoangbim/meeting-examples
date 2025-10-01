import EventEmitter from "../events/EventEmitter.js";

/**
 * Represents a participant in a meeting room
 */
class Participant extends EventEmitter {
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

    this.emit("tileCreated", { participant: this, tile });
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
    pinBtn?.addEventListener("click", (e) => {
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

    audioBtn?.addEventListener("click", async (e) => {
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
        enabled: this.isAudioEnabled,
      });
    } catch (error) {
      this.emit("error", {
        participant: this,
        error,
        action: "toggleMicrophone",
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
        enabled: this.isVideoEnabled,
      });
    } catch (error) {
      this.emit("error", { participant: this, error, action: "toggleCamera" });
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
        enabled: this.isAudioEnabled,
      });
    } catch (error) {
      this.emit("error", {
        participant: this,
        error,
        action: "toggleRemoteAudio",
      });
    }
  }

  /**
   * Toggle pin status
   */
  togglePin() {
    this.isPinned = !this.isPinned;
    this.emit("pinToggled", { participant: this, pinned: this.isPinned });
  }

  /**
   * Update microphone button appearance
   */
  _updateMicButton() {
    const micBtn = this.tile?.querySelector(`#micBtn-${this.streamId}`);
    if (!micBtn) return;

    micBtn.classList.toggle("muted", !this.isAudioEnabled);
    micBtn.title = this.isAudioEnabled
      ? "Mute microphone"
      : "Unmute microphone";

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
    this.emit("statusChanged", { participant: this, status });

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

    this.emit("cleanup", { participant: this });
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
      connectionStatus: this.connectionStatus,
    };
  }
}

export default Participant;
