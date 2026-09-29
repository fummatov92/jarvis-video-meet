// Configuration
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// State
let socket = null;
let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let isAudioMuted = false;
let isVideoMuted = false;
let roomId = '';
let myUserId = 'usr_' + Math.random().toString(36).substr(2, 9);
let myUserName = '';
const peers = {}; // socketId -> RTCPeerConnection
let unreadChatCount = 0;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const meetScreen = document.getElementById('meet-screen');
const lobbyPreview = document.getElementById('lobby-preview');
const previewStatus = document.getElementById('preview-status');
const userNameInput = document.getElementById('user-name-input');
const roomIdInput = document.getElementById('room-id-input');
const btnJoinRoom = document.getElementById('btn-join-room');

const displayRoomId = document.getElementById('display-room-id');
const btnCopyLink = document.getElementById('btn-copy-link');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localUserBadge = document.getElementById('local-user-badge');
const localMicIcon = document.getElementById('local-mic-icon');

const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnShareScreen = document.getElementById('btn-share-screen');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const btnLeaveCall = document.getElementById('btn-leave-call');

const chatPanel = document.getElementById('chat-panel');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatBadge = document.getElementById('chat-badge');
const toast = document.getElementById('toast');

// Auto-fill room from URL
const urlParams = new URLSearchParams(window.location.search);
const paramRoom = urlParams.get('room');
if (paramRoom) {
  roomIdInput.value = paramRoom;
}

// 1. Initialize Local Preview in Lobby
async function initLobbyPreview() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    lobbyPreview.srcObject = localStream;
    previewStatus.textContent = '🟢 Kamera va mikrofon faol';
  } catch (err) {
    console.warn('Lobby media access error:', err);
    previewStatus.textContent = '⚠️ Kamera/Mikrofonga ruxsat berilmadi';
  }
}

initLobbyPreview();

// 2. Join Room Logic
btnJoinRoom.addEventListener('click', () => {
  myUserName = userNameInput.value.trim() || 'Foydalanuvchi_' + Math.floor(Math.random() * 1000);
  roomId = roomIdInput.value.trim() || 'room_' + Math.random().toString(36).substr(2, 6);

  // Update URL without reload
  const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + '?room=' + roomId;
  window.history.pushState({ path: newUrl }, '', newUrl);

  startMeeting();
});

async function startMeeting() {
  lobbyScreen.classList.remove('active');
  meetScreen.classList.add('active');
  displayRoomId.textContent = roomId;
  localUserBadge.textContent = `${myUserName} (Siz)`;

  // Attach local stream to meet screen
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      console.error('Error getting local stream:', e);
    }
  }
  localVideo.srcObject = localStream;

  // Initialize Socket.io
  socket = io();

  socket.emit('join-room', {
    roomId,
    userId: myUserId,
    userName: myUserName
  });

  // When a new peer joins
  socket.on('user-connected', async ({ socketId, userName }) => {
    showToast(`👋 ${userName} xonaga qo'shildi`);
    createPeerConnection(socketId, userName, true);
  });

  // Handle incoming signaling
  socket.on('signal', async ({ from, userName, signal, data }) => {
    let pc = peers[from];
    if (!pc) {
      pc = createPeerConnection(from, userName, false);
    }

    if (signal === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', {
        to: from,
        signal: 'answer',
        data: answer
      });
    } else if (signal === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (signal === 'candidate') {
      if (data) {
        await pc.addIceCandidate(new RTCIceCandidate(data)).catch(e => console.error(e));
      }
    }
  });

  // Chat message received
  socket.on('chat-message', (msg) => {
    appendChatMessage(msg);
    if (chatPanel.classList.contains('hidden') || !chatPanel.offsetParent) {
      unreadChatCount++;
      chatBadge.textContent = unreadChatCount;
      chatBadge.classList.remove('hidden');
    }
  });

  // Peer disconnected
  socket.on('user-disconnected', ({ socketId, userName }) => {
    showToast(`🏃 ${userName || 'Foydalanuvchi'} xonani tark etdi`);
    removePeer(socketId);
  });
}

// 3. WebRTC Peer Connection Helper
function createPeerConnection(socketId, peerName, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[socketId] = pc;

  // Add local tracks to peer
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // Handle ICE candidate
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        to: socketId,
        signal: 'candidate',
        data: event.candidate
      });
    }
  };

  // Remote stream received
  pc.ontrack = (event) => {
    let remoteVideoCard = document.getElementById(`card-${socketId}`);
    if (!remoteVideoCard) {
      remoteVideoCard = document.createElement('div');
      remoteVideoCard.className = 'video-card';
      remoteVideoCard.id = `card-${socketId}`;

      const videoEl = document.createElement('video');
      videoEl.id = `video-${socketId}`;
      videoEl.autoplay = true;
      videoEl.playsInline = true;

      const overlay = document.createElement('div');
      overlay.className = 'video-overlay';
      overlay.innerHTML = `<span class="user-badge">${peerName || 'Foydalanuvchi'}</span>`;

      remoteVideoCard.appendChild(videoEl);
      remoteVideoCard.appendChild(overlay);
      videoGrid.appendChild(remoteVideoCard);

      videoEl.srcObject = event.streams[0];
    }
  };

  // If initiator, create and send Offer
  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', {
          to: socketId,
          signal: 'offer',
          data: offer
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    };
  }

  return pc;
}

function removePeer(socketId) {
  if (peers[socketId]) {
    peers[socketId].close();
    delete peers[socketId];
  }
  const card = document.getElementById(`card-${socketId}`);
  if (card) {
    card.remove();
  }
}

// 4. Controls Handling
btnToggleMic.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioMuted = !isAudioMuted;
    audioTrack.enabled = !isAudioMuted;
    btnToggleMic.classList.toggle('off', isAudioMuted);
    btnToggleMic.querySelector('.btn-icon').textContent = isAudioMuted ? '🔇' : '🎤';
    localMicIcon.textContent = isAudioMuted ? '🔇' : '🎤';
  }
});

btnToggleCam.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoMuted = !isVideoMuted;
    videoTrack.enabled = !isVideoMuted;
    btnToggleCam.classList.toggle('off', isVideoMuted);
    btnToggleCam.querySelector('.btn-icon').textContent = isVideoMuted ? '🚫' : '📹';
  }
});

btnShareScreen.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace track for all peers
      for (const socketId in peers) {
        const sender = peers[socketId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      }

      localVideo.srcObject = screenStream;
      btnShareScreen.classList.add('active');
      isScreenSharing = true;

      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.warn('Screen share cancelled/failed:', err);
    }
  } else {
    stopScreenShare();
  }
});

function stopScreenShare() {
  if (!isScreenSharing) return;
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
  }
  const camTrack = localStream.getVideoTracks()[0];
  for (const socketId in peers) {
    const sender = peers[socketId].getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && camTrack) {
      sender.replaceTrack(camTrack);
    }
  }
  localVideo.srcObject = localStream;
  btnShareScreen.classList.remove('active');
  isScreenSharing = false;
}

// 5. Chat Handling
btnToggleChat.addEventListener('click', () => {
  chatPanel.classList.toggle('hidden');
  if (!chatPanel.classList.contains('hidden')) {
    unreadChatCount = 0;
    chatBadge.classList.add('hidden');
  }
});

btnCloseChat.addEventListener('click', () => {
  chatPanel.classList.add('hidden');
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text && socket) {
    socket.emit('chat-message', { message: text });
    chatInput.value = '';
  }
});

function appendChatMessage({ userName, message, time }) {
  const isMe = (userName === myUserName);
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg';
  msgEl.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-author" style="color: ${isMe ? '#3b82f6' : '#10b981'}">${isMe ? 'Siz' : userName}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-body">${escapeHtml(message)}</div>
  `;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 6. Copy Link & Toast
btnCopyLink.addEventListener('click', () => {
  const link = window.location.href;
  navigator.clipboard.writeText(link).then(() => {
    showToast('📋 Xona havolasi nusxalandi!');
  }).catch(() => {
    prompt('Xona havolasi:', link);
  });
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// 7. Leave Call
btnLeaveCall.addEventListener('click', () => {
  if (confirm('Suhbatdan chiqmoqchimisiz?')) {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }
    if (socket) {
      socket.disconnect();
    }
    window.location.href = window.location.pathname;
  }
});
