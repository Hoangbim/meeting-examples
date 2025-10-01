import EventEmitter from "../events/EventEmitter.js";
import Participant from "./Participant.js";

import Publisher from "../media/Publisher.js";
import Subscriber from "../media/Subscriber.js";
import AudioMixer from "../media/AudioMixer.js";

/**
 * Represents a meeting room
 */
class Room extends EventEmitter {
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
      this.emit("joining", { room: this });
      console.log("Joining room with code", this.code);
      // Join via API
      const joinResponse = await this.apiClient.joinRoom(this.code);

      // Store connection info
      this.id = joinResponse.room_id;
      this.membershipId = joinResponse.id;
      this.streamId = joinResponse.stream_id;

      // Get room details and members
      const roomDetails = await this.apiClient.getRoomById(
        joinResponse.room_id
      );
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
      this.emit("joined", { room: this, participants: this.participants });

      return {
        room: this,
        localParticipant: this.localParticipant,
        participants: Array.from(this.participants.values()),
      };
    } catch (error) {
      this.emit("error", { room: this, error, action: "join" });
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
      this.emit("leaving", { room: this });

      // Cleanup media connections
      await this._cleanupMediaConnections();

      // Cleanup participants
      this._cleanupParticipants();

      // Leave via API
      if (this.membershipId) {
        await this.apiClient.leaveRoom(this.id, this.membershipId);
      }

      this.isActive = false;
      this.emit("left", { room: this });
    } catch (error) {
      this.emit("error", { room: this, error, action: "leave" });
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
      this.emit("creatingSubRoom", { room: this, config });

      // Create sub room via API
      const subRoomData = await this.apiClient.createSubRoom(
        this.id,
        config.name,
        config.type || "breakout"
      );

      // Create sub room instance
      const subRoom = new Room({
        id: subRoomData.id,
        name: subRoomData.room_name,
        code: subRoomData.room_code,
        type: config.type || "breakout",
        parentRoomId: this.id,
        ownerId: subRoomData.user_id,
        apiClient: this.apiClient,
        mediaConfig: this.mediaConfig,
      });

      // Store sub room
      this.subRooms.set(subRoom.id, subRoom);

      this.emit("subRoomCreated", { room: this, subRoom });

      return subRoom;
    } catch (error) {
      this.emit("error", { room: this, error, action: "createSubRoom" });
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
            mediaConfig: this.mediaConfig,
          });

          this.subRooms.set(subRoom.id, subRoom);
        }
      }

      return Array.from(this.subRooms.values());
    } catch (error) {
      this.emit("error", { room: this, error, action: "getSubRooms" });
      throw error;
    }
  }

  /**
   * Switch to a sub room
   */
  async switchToSubRoom(subRoomCode) {
    try {
      this.emit("switchingToSubRoom", { room: this, subRoomCode });

      // Switch via API
      const switchResponse = await this.apiClient.switchToSubRoom(
        this.id,
        subRoomCode
      );

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
        response: switchResponse,
      });

      return switchResponse;
    } catch (error) {
      this.emit("error", { room: this, error, action: "switchToSubRoom" });
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
      this.emit("returningToMainRoom", { room: this });

      // Leave current sub room
      await this.leave();

      // The parent should handle rejoining main room
      this.emit("returnedToMainRoom", { room: this });
    } catch (error) {
      this.emit("error", { room: this, error, action: "returnToMainRoom" });
      throw error;
    }
  }

  /**
   * Add a participant to the room
   */
  addParticipant(memberData, userId) {
    const isLocal = memberData.user_id === userId;

    const participant = new Participant({
      userId: memberData.user_id,
      streamId: memberData.stream_id,
      membershipId: memberData.id,
      role: memberData.role,
      roomId: this.id,
      isLocal,
    });

    // Setup participant events
    this._setupParticipantEvents(participant);

    this.participants.set(participant.userId, participant);

    if (isLocal) {
      this.localParticipant = participant;
    }

    this.emit("participantAdded", { room: this, participant });

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

    this.emit("participantRemoved", { room: this, participant });

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

    this.emit("participantPinned", { room: this, participant });

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
      participant: unpinnedParticipant,
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

    console.warn(
      "Rendering participant tiles..., participants:",
      this.participants
    );

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
      pinnedParticipant: this.pinnedParticipant?.userId || null,
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
      this.audioMixer = new AudioMixer();
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
        this.localParticipant.setConnectionStatus(
          isError ? "failed" : "connected"
        );
      },
      onServerEvent: async (event) => {
        await this._handleServerEvent(event);
      },
    });

    await publisher.startPublishing();
    this.localParticipant.setPublisher(publisher);
  }

  /**
   * Setup subscriber for remote participant
   */
  async _setupRemoteSubscriber(participant) {
    const subscriber = new Subscriber({
      streamId: participant.streamId,
      roomId: this.id,
      host: this.mediaConfig.host,
      videoElement: participant.videoElement,
      onStatus: (msg, isError) => {
        participant.setConnectionStatus(isError ? "failed" : "connected");
      },
      audioWorkletUrl: "workers/audio-worklet1.js",
      mstgPolyfillUrl: "polyfills/MSTG_polyfill.js",
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

      const participant = this.addParticipant(
        {
          user_id: joinedParticipant.user_id,
          stream_id: joinedParticipant.stream_id,
          id: joinedParticipant.membership_id,
          role: joinedParticipant.role,
        },
        this.localParticipant?.userId
      );

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
    participant.on("pinToggled", ({ participant: p, pinned }) => {
      if (pinned) {
        this.pinParticipant(p.userId);
      } else if (this.pinnedParticipant === p) {
        this.unpinParticipant();
      }

      // Chỉ di chuyển tile của participant này
      this._moveParticipantTile(p);
    });

    participant.on("error", ({ participant: p, error, action }) => {
      this.emit("participantError", {
        room: this,
        participant: p,
        error,
        action,
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

export default Room;
