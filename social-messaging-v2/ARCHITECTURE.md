# Arsitektur Sistem Aplikasi Social Messaging

Dokumen ini menjelaskan desain teknis dan arsitektur dari aplikasi Social Messaging Web App v2.

## 1. Ikhtisar Sistem 🏗️

Aplikasi ini adalah PWA (Progressive Web App) yang berfokus pada komunikasi *real-time* yang cepat, aman, dan interaktif.

### Diagram Arsitektur Tingkat Tinggi
```mermaid
graph TD
    Client[Web Client (React + Vite)] <-->|HTTP/REST| API[Express API Server]
    Client <-->|WebSocket| Socket[Socket.io Server]
    Client -.->|WebRTC P2P| Peer[Peer Client]
    
    API --> DB[(SQLite Database)]
    Socket --> DB
    
    API --> Storage[Local File Storage /uploads]
```

---

## 2. Tech Stack 🛠️

### Frontend (Client-Side)
- **Framework:** React.js (Vite)
- **Styling:** TailwindCSS + Custom CSS (Glassmorphism UI)
- **State Management:** React Hooks (`useState`, `useEffect`, `useRef`)
- **Real-time Communication:** `socket.io-client`
- **P2P Calling:** Native WebRTC API (`RTCPeerConnection`)
- **Animations:** Framer Motion
- **Icons:** Lucide React

### Backend (Server-Side)
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite (`better-sqlite3`) - *Serverless & High Performance*
- **Real-time Engine:** Socket.io (WebSocket)
- **Authentication:** JWT (JSON Web Token) + Bcrypt
- **API Documentation:** Swagger UI (`swagger-ui-express`)
- **Security:** Helmet, CORS

---

## 3. Alur Data & Komunikasi 🔄

### A. Autentikasi & Otorisasi
1.  **Login:** User mengirim kredensial -> Server memvalidasi -> Mengembalikan JWT Token.
2.  **Proteksi:** Token disimpan di LocalStorage dan dikirim via Header `Authorization: Bearer <token>` pada setiap request API.
3.  **Socket Auth:** Token juga divalidasi saat inisialisasi koneksi Socket.io (Future improvement).

### B. Pesan Real-time (Socket.io)
-   Menggunakan model **Event-Driven Architecture**.
-   **Room Based:**
    -   Setiap user bergabung ke room `user_<id>`.
    -   Setiap grup memiliki room `group_<id>`.
-   **Flow Pesan:**
    1.  Sender emit `send_message`.
    2.  Server simpan ke DB.
    3.  Server broadcast `receive_message` ke room receiver.

### C. Panggilan Suara (WebRTC Signaling)
-   Menggunakan Socket.io sebagai **Signaling Server** untuk pertukaran metadata (SDP & ICE Candidates), namun media (Audio/Video) dikirim **Peer-to-Peer (P2P)**.
-   **Flow:**
    1.  **Offer:** Penelepon membuat Offer (SDP) -> Kirim via Socket.
    2.  **Answer:** Penerima menerima Offer -> Set Remote Desc -> Buat Answer (SDP) -> Kirim via Socket.
    3.  **ICE Candidates:** Kedua pihak saling bertukar info alamat jaringan (IP/Port) secara terus menerus untuk menembus NAT.
    4.  **Connected:** Stream Audio mengalir langsung antar browser (P2P).

### D. Struktur Database (Schema)
Menggunakan Relational Model (SQLite):
-   **`users`**: Menyimpan profil, auth, dan status.
-   **`friends`**: Tabel *self-referencing many-to-many* untuk hubungan pertemanan.
-   **`messages`**: Menyimpan chat history, tipe pesan (text/image/voice), dan relasi ke user.
-   **`groups`** & **`group_members`**: Manajemen obrolan grup.
-   **`reactions`**: Menyimpan reaksi emoji pada pesan.

---

## 4. Struktur Direktori 📂

```
social-messaging-v2/
├── server/
│   ├── index.js          # Entry point Server & Socket Logic
│   ├── database.sqlite   # File Database
│   ├── swagger.js        # Dokumentasi API Config
│   └── uploads/          # Penyimpanan file media user
│
├── src/
│   ├── Chat.jsx          # Komponen Utama (Monolith Component for UI & Logic)
│   ├── index.css         # Global Styles & Tailwind Directives
│   ├── main.jsx          # React Entry Point
│   └── ...
│
├── public/               # Static Assets
└── ...
```

---

## 5. Kontak & Kredit 📞

**Maintained by:** Bang Ucok & Antigravity  
**Email:** emailsinaga@gmail.com  
**WhatsApp:** +6281234500747
