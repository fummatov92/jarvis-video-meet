# 📹 JarvisOS WebRTC Video Meet

Ultra-lightweight, peer-to-peer (P2P) encrypted video calling, screen sharing, and real-time chat service designed for **JarvisOS**.

## 🚀 Imkoniyatlar (Features)
- 👥 **P2P HD Video & Audio:** WebRTC texnologiyasi orqali to'g'ridan-to'g'ri brauzerdan brauzerga shifrlangan yuqori sifatli aloqa.
- 🖥️ **Ekran Almashish (Screen Sharing):** Bir bosishda kompyuter yoki telefon ekranini jonli translatsiya qilish (`getDisplayMedia`).
- 💬 **Jonli Matnli Chat:** Qo'ng'iroq jarayonida real-vaqtli xabarlar almashish (Socket.io).
- 🔗 **Tezkor Xona Linki:** Xona havolasini 1 bosishda nusxalash (`?room=ROOM_ID`).
- 📱 **Mobile-First Glassmorphism UI:** To'liq moslashuvchan (responsive) zamonaviy quyuq dizayn.
- ⚡ **Minimal Resurs Sarfi:** Serverda faqat signalizatsiya (signaling) ishlaydi, RAM bandligi ~25 MB, video trafigi to'g'ridan-to'g'ri mijozlar o'rtasida uzatiladi.

## 🛠️ O'rnatish va Ishga Tushirish

```bash
# 1. Repozitoriyga kirish
cd webrtc_video_meet

# 2. Bog'liqliklarni o'rnatish
npm install

# 3. Ishga tushirish (Port: 15805)
node server.js
# yoki PM2 orqali:
pm2 start server.js --name "webrtc-video-meet"
```

## 🔌 API & Endpointlar
- `GET /` — Video Meet veb-interfeysi
- `GET /?room=<ROOM_ID>` — To'g'ridan-to'g'ri xonaga ulanish
- `GET /api/health` — Servis salomatligi va faol xonalar soni
