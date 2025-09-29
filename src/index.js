/**
 * Ermis Classroom SDK
 * Main entry point for the SDK
 */

import ErmisClient from "./core/ErmisClient.js";
import Room from "./core/Room.js";
import SubRoom from "./core/SubRoom.js";
import Participant from "./core/Participant.js";
import ApiClient from "./api/ApiClient.js";
import EventEmitter from "./events/EventEmitter.js";

/**
 * SDK Version
 */
export const VERSION = "1.0.0";

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
    return new ErmisClient(config);
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
      ...options,
    };

    const client = new ErmisClient(config);
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
      ERROR: "error",
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
          cameras: devices.filter((d) => d.kind === "videoinput"),
          microphones: devices.filter((d) => d.kind === "audioinput"),
          speakers: devices.filter((d) => d.kind === "audiooutput"),
        };
      },

      /**
       * Get user media with constraints
       */
      async getUserMedia(constraints = { video: true, audio: true }) {
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
              name: "camera",
            });
            permissions.microphone = await navigator.permissions.query({
              name: "microphone",
            });
          } catch (error) {
            console.warn("Permission check failed:", error);
          }
        }

        return permissions;
      },
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
      DISCUSSION: "discussion",
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
      FAILED: "failed",
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
      OBSERVER: "observer",
    };
  }
}

/**
 * Named exports for individual classes
 */
export { ErmisClient, Room, SubRoom, Participant, ApiClient, EventEmitter };

/**
 * Default export - Main SDK class
 */
export default ErmisClassroom;

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
