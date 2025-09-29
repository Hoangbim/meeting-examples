/**
 * ermis-classroom-sdk v1.0.0
 * Ermis Classroom SDK for virtual classroom and meeting integration
 * 
 * @author Ermis Team <dev@ermis.network>
 * @license MIT
 * @homepage https://github.com/ermis-network/classroom-sdk#readme
 */
'use strict';

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
      if (!document.querySelector('script[src="../polyfills/MSTP_polyfill.min.js"]')) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "../polyfills/MSTP_polyfill.min.js";
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
          } = await Promise.resolve().then(function () { return require('./raptorq_wasm-fbafd406.js'); });
          this.WasmEncoder = WasmEncoder;
          this.wasmInitPromise = init().then(() => {
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
          this.stopPublishing();
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
    console.warn("Connecting to WebTransport server at", this.publishUrl);
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
            console.log("📩 Message from server:", msg);
            if (msg === "pong") {
              continue; // Ignore pong responses
            }
            let msgJson;
            try {
              msgJson = JSON.parse(msg);
            } catch (e) {
              msgJson = null;
            }
            if (msgJson && msgJson.event) {
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
            const keyFrame = frameCounter % 120 === 0; // Key frame every ~4 seconds
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
      console.warn("video config", metadata.decoderConfig);
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
      console.error("Failed to send data over WebTransport stream:", error);
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
      console.warn("video config description in base64 before sending:", vConfigBase64);
      console.warn("video config description in uint8 before sending:", vConfigUint8);
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
      console.log("Sending media configuration:", config);
      const packet = new TextEncoder().encode(JSON.stringify(config));
      this.sendOverWebTransportStream(packet);
      this.mediaConfigSent = true;
      this.onStatusUpdate("Media configuration sent");
    }
  }
  async stopPublishing() {
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

exports.Publisher = Publisher;
//# sourceMappingURL=Publisher-b17f9b7d.js.map
