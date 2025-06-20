// Import necessary modules
const http = require('http'); // HTTP server module
const express = require('express'); // Web framework for Node.js
const { Server } = require('socket.io'); // WebSocket library for real-time communication
const mediasoup = require('mediasoup'); // Mediasoup library for SFU functionality

// Initialize Express app
const app = express();
// Create an HTTP server using the Express app
const server = http.createServer(app);
// Initialize Socket.io server with CORS enabled for all origins
// This allows the frontend (HTML file) to connect from any domain.
const io = new Server(server, {
  cors: {
    origin: "*" // Allow connections from any origin for development purposes
  }
});

// Object to store active users and their socket IDs.
// This will map a role (e.g., 'userA', 'userB') to a specific socket ID.
const users = {}; // Example: { 'userA': 'socketId123', 'userB': 'socketId456' }

// In a real Mediasoup integration, you would also manage Mediasoup Workers,
// Routers, and Transports here or communicate with a separate Mediasoup API.
// For simplicity, we'll conceptualize API calls to a Mediasoup server.

// Stores active call sessions, potentially linking to Mediasoup room/session IDs
// This would be crucial for instructing the media server which call to record.
const activeCallSessions = {}; // Example: { 'userA_userB_callId': { mediasoupRoomId: 'xyz', participants: ['userA', 'userB'] } }


// --- Mediasoup Integration Scaffold ---
let worker;
let router;
const mediasoupRooms = {}; // { roomId: { router, transports, producers, consumers } }

// Start mediasoup worker and router on server startup
(async () => {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      }
    ]
  });
  console.log('Mediasoup worker and router started.');
})();
// --- End Mediasoup Integration Scaffold ---


// Event listener for new Socket.io connections
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Event to register a user's role (e.g., 'userA' or 'userB')
  socket.on('register', (role) => {
    users[role] = socket.id; // Store the socket ID associated with the role
    socket.role = role; // Attach the role to the socket object for easy access later
    console.log(`User ${role} registered with socket ID: ${socket.id}`);
  });

  // Event for initiating a call
  socket.on('call', ({ from, to, offer }) => {
    // In a Mediasoup integration, 'offer' would be an offer to the Mediasoup server,
    // not directly to 'to'. The signaling server would mediate this.
    if (users[to]) {
      console.log(`Call from ${from} to ${to}`);
      // Conceptually:
      // 1. Signaling server would tell Mediasoup to create a new room/transport for this call.
      // 2. Mediasoup would generate an SDP offer.
      // 3. Signaling server would forward Mediasoup's offer to 'to'.
      //    io.to(users[to]).emit('incoming-call', { from, offer: mediasoupOffer });
      // For now, retaining the direct offer relay for simplicity, but note the conceptual shift.
      io.to(users[to]).emit('incoming-call', { from, offer });

      // Store basic call info to link to potential server-side recording later
      const sessionId = `${from}_${to}_${Date.now()}`; // Simple unique ID for the call
      activeCallSessions[sessionId] = { from, to, status: 'calling' };
      socket.sessionId = sessionId; // Link socket to session
      io.to(users[to]).emit('call-session-info', { sessionId }); // Inform callee of session ID
      console.log(`Created conceptual session: ${sessionId}`);
    } else {
      console.log(`User ${to} not found for call from ${from}`);
    }
  });

  // Event for answering a call
  socket.on('answer', ({ from, to, answer }) => {
    // In a Mediasoup integration, 'answer' would be the client's answer to Mediasoup's offer.
    // Signaling server would forward it to Mediasoup.
    if (users[to]) {
      console.log(`Answer from ${from} to ${to}`);
      // Conceptually:
      // 1. Signaling server would receive client's answer.
      // 2. Signaling server would send this answer to Mediasoup.
      // 3. Mediasoup would process the answer and establish media.
      // For now, retaining direct answer relay.
      io.to(users[to]).emit('call-answered', { from, answer });

      // Update call session status
      const sessionId = socket.sessionId; // Assuming 'from' user is part of an existing session
      if (sessionId && activeCallSessions[sessionId]) {
        activeCallSessions[sessionId].status = 'connected';
        console.log(`Session ${sessionId} connected.`);
      }
    }
  });

  // Event for exchanging ICE candidates (for NAT traversal)
  socket.on('ice-candidate', ({ from, to, candidate }) => {
    // In a Mediasoup integration, ICE candidates would be exchanged between
    // client and Mediasoup (proxied by signaling server).
    if (users[to]) {
      console.log(`ICE candidate from ${from} to ${to}`);
      // Conceptually:
      // 1. Signaling server receives candidate from client.
      // 2. Signaling server forwards candidate to Mediasoup (for the relevant transport).
      // For now, retaining direct candidate relay.
      io.to(users[to]).emit('ice-candidate', { from, candidate });
    }
  });

  // Event for ending a call
  socket.on('end-call', ({ from, to }) => {
    if (users[to]) {
      console.log(`End call from ${from} to ${to}`);
      // Conceptually:
      // 1. Signaling server would inform Mediasoup to terminate the media session/transport.
      // 2. If recording was active, signaling server would tell Mediasoup to finalize it.
      io.to(users[to]).emit('call-ended', { from });

      // Clean up conceptual session
      const sessionId = socket.sessionId;
      if (sessionId && activeCallSessions[sessionId]) {
        delete activeCallSessions[sessionId];
        console.log(`Session ${sessionId} ended and cleaned up.`);
      }
    }
  });

  // New: Event to request starting server-side recording
  // This signal would come from one client and trigger recording for the entire session on the media server.
  socket.on('start-recording-request', ({ from, to }) => {
    const sessionId = socket.sessionId; // Get the session ID associated with the caller
    if (!sessionId || !activeCallSessions[sessionId]) {
      console.warn(`No active session found for ${from} to start recording.`);
      return;
    }

    console.log(`Server-side recording start request for session ${sessionId} from ${from} (for ${to})`);
    // --- CONCEPTUAL MEDIASOUP API CALL ---
    // Here, you would make an API call to your Mediasoup server.
    // Example (pseudo-code):
    // fetch('http://your-mediasoup-server/api/start-recording', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ mediasoupRoomId: activeCallSessions[sessionId].mediasoupRoomId })
    // })
    // .then(response => response.json())
    // .then(data => {
    //   console.log('Mediasoup recording started:', data);
    //   // Optionally, inform both clients that recording has started
    //   io.to(users[from]).emit('recording-status', { status: 'started', by: from });
    //   io.to(users[to]).emit('recording-status', { status: 'started', by: from });
    // })
    // .catch(error => {
    //   console.error('Failed to start Mediasoup recording:', error);
    //   io.to(users[from]).emit('recording-status', { status: 'failed', error: error.message });
    // });
    // ------------------------------------

    // For now, for demonstration, we will still emit a signal to both clients
    // to *display* that recording has started, even though it's not truly server-side yet.
    // In a full implementation, the client would await confirmation from the server.
    if (users[from]) io.to(users[from]).emit('start-recording-signal', { from });
    if (users[to]) io.to(users[to]).emit('start-recording-signal', { from });
  });

  // New: Event to request stopping server-side recording
  // This signal would come from one client and stop recording for the entire session on the media server.
  socket.on('stop-recording-request', ({ from, to }) => {
    const sessionId = socket.sessionId; // Get the session ID associated with the caller
    if (!sessionId || !activeCallSessions[sessionId]) {
      console.warn(`No active session found for ${from} to stop recording.`);
      return;
    }

    console.log(`Server-side recording stop request for session ${sessionId} from ${from} (for ${to})`);
    // --- CONCEPTUAL MEDIASOUP API CALL ---
    // Here, you would make an API call to your Mediasoup server.
    // Example (pseudo-code):
    // fetch('http://your-mediasoup-server/api/stop-recording', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ mediasoupRoomId: activeCallSessions[sessionId].mediasoupRoomId })
    // })
    // .then(response => response.json())
    // .then(data => {
    //   console.log('Mediasoup recording stopped:', data);
    //   // Optionally, inform both clients that recording has stopped and provide download link
    //   io.to(users[from]).emit('recording-status', { status: 'stopped', downloadUrl: data.url });
    //   io.to(users[to]).emit('recording-status', { status: 'stopped', downloadUrl: data.url });
    // })
    // .catch(error => {
    //   console.error('Failed to stop Mediasoup recording:', error);
    //   io.to(users[from]).emit('recording-status', { status: 'failed', error: error.message });
    // });
    // ------------------------------------

    // For now, for demonstration, we will still emit a signal to both clients
    // to *display* that recording has stopped.
    if (users[from]) io.to(users[from]).emit('stop-recording-signal', { from });
    if (users[to]) io.to(users[to]).emit('stop-recording-signal', { from });
  });


  // Event listener for socket disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // If the disconnected socket had a registered role, remove it from the users object
    if (socket.role && users[socket.role] === socket.id) {
      console.log(`De-registering user: ${socket.role}`);
      delete users[socket.role];
      // Also clean up any sessions this user was part of
      for (const sessionId in activeCallSessions) {
        if (activeCallSessions[sessionId].from === socket.role || activeCallSessions[sessionId].to === socket.role) {
          console.log(`Cleaning up session ${sessionId} due to ${socket.role} disconnection.`);
          // Conceptually: Tell Mediasoup to terminate this session and recording
          // fetch('http://your-mediasoup-server/api/terminate-session', { ... });
          delete activeCallSessions[sessionId];
        }
      }
    }
  });
});

// Start the server and listen on port 3001
server.listen(3001, () => {
  console.log('Signaling server running on port 3001');
});
