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
let isSpeakerOn = true; // Speaker (karnay) mode
let audioOutputDevices = [];
let currentAudioOutputIndex = 0;
let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
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
const btnFlipPreview = document.getElementById('btn-flip-preview');

const displayRoomId = document.getElementById('display-room-id');
const btnCopyLink = document.getElementById('btn-copy-link');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localUserBadge = document.getElementById('local-user-badge');
const localMicIcon = document.getElementById('local-mic-icon');

const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnFlipCamActive = document.getElementById('btn-flip-cam-active');
const btnToggleSpeaker = document.getElementById('btn-toggle-speaker');
const speakerIcon = document.getElementById('speaker-icon');
const speakerText = document.getElementById('speaker-text');
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

// Auto-fill room from URL query param
const urlParams = new URLSearchParams(window.location.search);
const paramRoom = urlParams.get('room');
if (paramRoom) {
  roomIdInput.value = paramRoom;
}

// 1. Initialize Local Stream & Audio Devices
async function loadAudioOutputDevices() {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      audioOutputDevices = devices.filter(d => d.kind === 'audiooutput');
      console.log('Available audio outputs:', audioOutputDevices);
    }
  } catch (err) {
    console.warn('Cannot enumerate audio devices:', err);
  }
}

async function getMediaStream(facingMode = 'user') {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  const constraints = {
    video: {
      facingMode: facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

async function initLobbyPreview() {
  try {
    localStream = await getMediaStream(currentFacingMode);
    lobbyPreview.srcObject = localStream;
    previewStatus.textContent = 'Kamera faol';
    await loadAudioOutputDevices();
  } catch (err) {
    console.warn('Lobby camera access error:', err);
    previewStatus.textContent = 'Kameraga ruxsat berilmadi';
  }
}

initLobbyPreview();

// Flip camera function (Mobile Support)
async function flipCamera() {
  currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
  try {
    localStream = await getMediaStream(currentFacingMode);
    
    if (lobbyScreen.classList.contains('active')) {
      lobbyPreview.srcObject = localStream;
      lobbyPreview.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
    }

    if (meetScreen.classList.contains('active')) {
      localVideo.srcObject = localStream;
      localVideo.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';

      const videoTrack = localStream.getVideoTracks()[0];
      for (const socketId in peers) {
        const sender = peers[socketId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      }
    }
    showToast('🔄 Kamera almashtirildi');
  } catch (e) {
    console.error('Kamerani almashtirishda xatolik:', e);
  }
}

btnFlipPreview.addEventListener('click', flipCamera);
btnFlipCamActive.addEventListener('click', flipCamera);

// 2. Speaker (Karnay / Dinamik) Toggle Logic
async function toggleSpeakerOutput() {
  await loadAudioOutputDevices();
  isSpeakerOn = !isSpeakerOn;

  const remoteVideos = document.querySelectorAll('.video-tile video');
  
  if (audioOutputDevices.length > 1 && typeof HTMLMediaElement.prototype.setSinkId === 'function') {
    currentAudioOutputIndex = (currentAudioOutputIndex + 1) % audioOutputDevices.length;
    const targetDevice = audioOutputDevices[currentAudioOutputIndex];
    
    for (const vid of remoteVideos) {
      if (vid.id !== 'local-video' && typeof vid.setSinkId === 'function') {
        try {
          await vid.setSinkId(targetDevice.deviceId);
        } catch (e) {
          console.warn('setSinkId error:', e);
        }
      }
    }
    
    const deviceLabel = targetDevice.label || `Chiqish ${currentAudioOutputIndex + 1}`;
    showToast(`🔊 Chiqish: ${deviceLabel}`);
  } else {
    // Standard speakerphone / volume toggle fallback
    for (const vid of remoteVideos) {
      if (vid.id !== 'local-video') {
        vid.volume = isSpeakerOn ? 1.0 : 0.4;
      }
    }
    showToast(isSpeakerOn ? '🔊 Karnay (Baland ovoz) yoqildi' : '🔈 Standart dinamikga o\'tkazildi');
  }

  // Update button visual state
  if (btnToggleSpeaker) {
    btnToggleSpeaker.classList.toggle('off', !isSpeakerOn);
    speakerIcon.textContent = isSpeakerOn ? '🔊' : '🔈';
    speakerText.textContent = isSpeakerOn ? 'Karnay' : 'Dinamik';
  }
}

if (btnToggleSpeaker) {
  btnToggleSpeaker.addEventListener('click', toggleSpeakerOutput);
}

// 3. Join Room Logic
btnJoinRoom.addEventListener('click', () => {
  myUserName = userNameInput.value.trim() || 'Foydalanuvchi_' + Math.floor(Math.random() * 1000);
  roomId = roomIdInput.value.trim() || 'room_' + Math.random().toString(36).substr(2, 6);

  const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + '?room=' + roomId;
  window.history.pushState({ path: newUrl }, '', newUrl);

  startMeeting();
});

async function startMeeting() {
  lobbyScreen.classList.remove('active');
  meetScreen.classList.add('active');
  displayRoomId.textContent = roomId;
  localUserBadge.textContent = `${myUserName} (Siz)`;

  if (!localStream) {
    try {
      localStream = await getMediaStream(currentFacingMode);
    } catch (e) {
      console.error('Error getting local stream:', e);
    }
  }
  localVideo.srcObject = localStream;

  socket = io();

  socket.emit('join-room', {
    roomId,
    userId: myUserId,
    userName: myUserName
  });

  socket.on('user-connected', async ({ socketId, userName }) => {
    showToast(`👋 ${userName} qo'shildi`);
    createPeerConnection(socketId, userName, true);
    updateGridLayout();
  });

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
      updateGridLayout();
    } else if (signal === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      updateGridLayout();
    } else if (signal === 'candidate') {
      if (data) {
        await pc.addIceCandidate(new RTCIceCandidate(data)).catch(e => console.error(e));
      }
    }
  });

  socket.on('chat-message', (msg) => {
    appendChatMessage(msg);
    if (chatPanel.classList.contains('hidden')) {
      unreadChatCount++;
      chatBadge.classList.remove('hidden');
    }
  });

  socket.on('user-disconnected', ({ socketId, userName }) => {
    showToast(`🏃 ${userName || 'Foydalanuvchi'} chiqib ketdi`);
    removePeer(socketId);
    updateGridLayout();
  });
}

// 4. WebRTC Peer Connection Helper
function createPeerConnection(socketId, peerName, isInitiator) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[socketId] = pc;

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        to: socketId,
        signal: 'candidate',
        data: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    let remoteVideoTile = document.getElementById(`card-${socketId}`);
    if (!remoteVideoTile) {
      remoteVideoTile = document.createElement('div');
      remoteVideoTile.className = 'video-tile';
      remoteVideoTile.id = `card-${socketId}`;

      const videoEl = document.createElement('video');
      videoEl.id = `video-${socketId}`;
      videoEl.autoplay = true;
      videoEl.playsInline = true;

      // Apply initial audio sink if configured
      if (audioOutputDevices.length > 0 && typeof videoEl.setSinkId === 'function') {
        const targetDevice = audioOutputDevices[currentAudioOutputIndex];
        if (targetDevice) {
          videoEl.setSinkId(targetDevice.deviceId).catch(err => console.warn(err));
        }
      }

      const overlay = document.createElement('div');
      overlay.className = 'tile-tag';
      overlay.innerHTML = `<span>${peerName || 'Foydalanuvchi'}</span><span>🔊</span>`;

      remoteVideoTile.appendChild(videoEl);
      remoteVideoTile.appendChild(overlay);
      videoGrid.appendChild(remoteVideoTile);

      videoEl.srcObject = event.streams[0];
      updateGridLayout();
    }
  };

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
  updateGridLayout();
}

function updateGridLayout() {
  const peerCount = Object.keys(peers).length;
  if (peerCount > 0) {
    videoGrid.classList.add('has-remote');
  } else {
    videoGrid.classList.remove('has-remote');
  }

  if (peerCount >= 2) {
    videoGrid.classList.add('multi-peer');
  } else {
    videoGrid.classList.remove('multi-peer');
  }
}

// 5. Controls Handling
btnToggleMic.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioMuted = !isAudioMuted;
    audioTrack.enabled = !isAudioMuted;
    btnToggleMic.classList.toggle('off', isAudioMuted);
    btnToggleMic.querySelector('.bar-icon').textContent = isAudioMuted ? '🔇' : '🎤';
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
    btnToggleCam.querySelector('.bar-icon').textContent = isVideoMuted ? '🚫' : '📹';
  }
});

btnShareScreen.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      for (const socketId in peers) {
        const sender = peers[socketId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      }

      localVideo.srcObject = screenStream;
      localVideo.style.transform = 'none';
      btnShareScreen.classList.add('active');
      isScreenSharing = true;

      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.warn('Screen sharing cancelled/unsupported on this mobile device:', err);
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
  localVideo.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
  btnShareScreen.classList.remove('active');
  isScreenSharing = false;
}

// 6. Chat Handling (Mobile Drawer)
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
  msgEl.className = `chat-bubble ${isMe ? 'mine' : ''}`;
  msgEl.innerHTML = `
    <div class="chat-bubble-header">
      <span class="chat-bubble-author">${isMe ? 'Siz' : userName}</span>
      <span>${time}</span>
    </div>
    <div class="chat-bubble-body">${escapeHtml(message)}</div>
  `;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 7. Copy Link & Toast
btnCopyLink.addEventListener('click', () => {
  const link = window.location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => {
      showToast('📋 Havola nusxalandi!');
    }).catch(() => {
      prompt('Xona havolasi:', link);
    });
  } else {
    prompt('Xona havolasi:', link);
  }
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// 8. Leave Call
btnLeaveCall.addEventListener('click', () => {
  if (confirm('Suhbatdan chiqasizmi?')) {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    if (socket) socket.disconnect();
    window.location.href = window.location.pathname;
  }
});
