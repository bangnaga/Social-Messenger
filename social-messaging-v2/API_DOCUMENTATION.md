# Dokumentasi API Aplikasi Social Messaging

Dokumentasi ini menjelaskan endpoint REST API dan event Socket.io yang tersedia di server backend.

**Base URL API:** `http://localhost:3001` (Default)
**Authentication:** Menggunakan JWT (JSON Web Token) di header `Authorization: Bearer <token>` untuk sebagian besar endpoint.

---

## 🚀 REST API Endpoints

### 🔐 Autentikasi

#### `POST /api/register`
Mendaftarkan pengguna baru.
- **Body:** `{ "username": "user1", "password": "123", "full_name": "User One", "country": "ID" }`
- **Response:** `{ "id": 1 }`

#### `POST /api/login`
Masuk dan mendapatkan token JWT.
- **Body:** `{ "username": "user1", "password": "123" }`
- **Response:** `{ "token": "...", "user": { ... } }`

---

### 👤 Pengguna (User)

#### `PUT /api/user/update`
Memperbarui profil pengguna.
- **Auth:** Wajib
- **Body:** `{ "full_name": "New Name", "country": "New Country", "bio": "New Bio" }`
- **Response:** Object user yang diperbarui.

#### `POST /api/user/upload-profile-pic`
Mengunggah foto profil.
- **Auth:** Wajib
- **Form-Data:** Key `profile_pic` (File)
- **Response:** `{ "profile_pic": "/uploads/filename.jpg" }`

#### `GET /api/users/search?q=query`
Mencari pengguna berdasarkan username atau nama lengkap.
- **Auth:** Wajib
- **Response:** Array user yang cocok beserta status pertemanan.

#### `GET /api/users/recent`
Mengambil daftar obrolan terakhir (pengguna yang pernah berinteraksi).
- **Auth:** Wajib
- **Response:** Array user dengan properti `last_message`, `unread_count`, dll.

---

### 💬 Pesan (Messages)

#### `GET /api/messages/:friendId`
Mengambil riwayat pesan dengan teman tertentu.
- **Auth:** Wajib
- **Response:** Array pesan (termasuk reaksi dan reply).

#### `POST /api/messages/upload`
Mengunggah file lampiran pesan.
- **Auth:** Wajib
- **Form-Data:** Key `file` (File)
- **Response:** `{ "file_url": "...", "type": "image/voice/file" }`

#### `POST /api/messages/read-all`
Menandai semua pesan dari teman tertentu sebagai sudah dibaca.
- **Auth:** Wajib
- **Body:** `{ "friendId": 2 }`

#### `POST /api/messages/react`
Memberikan reaksi emoji pada pesan.
- **Auth:** Wajib
- **Body:** `{ "messageId": 123, "emoji": "👍" }`

#### `DELETE /api/messages/history/:friendId`
Menghapus seluruh riwayat chat dengan teman.
- **Auth:** Wajib

---

### 🤝 Pertemanan (Friends)

#### `GET /api/friends/list`
Mengambil daftar teman yang sudah *accepted*.
- **Auth:** Wajib

#### `POST /api/friends/request`
Mengirim permintaan pertemanan.
- **Body:** `{ "friendId": 5 }`

#### `GET /api/friends/pending`
Melihat daftar permintaan pertemanan yang masuk.

#### `POST /api/friends/accept`
Menerima permintaan pertemanan.
- **Body:** `{ "requestId": 10 }`

#### `POST /api/friends/reject`
Menolak permintaan pertemanan.
- **Body:** `{ "requestId": 10 }`

---

### 👥 Grup (Groups)

#### `POST /api/groups/create`
Membuat grup baru.
- **Body:** `{ "name": "Grup Gibah", "userIds": [2, 3, 4] }`

#### `GET /api/groups/my`
Mengambil daftar grup yang diikuti user.

#### `GET /api/groups/:groupId/messages`
Mengambil riwayat pesan dalam grup.

#### `GET /api/groups/:groupId/members`
Mengambil daftar anggota grup.

#### `POST /api/groups/:groupId/leave`
Keluar dari grup.

---

## ⚡ Socket.io Events

Server berjalan pada port yang sama dengan HTTP.

### Events Koneksi
- `join` (Client -> Server): Mengirim `userId` saat connect untuk bergabung ke room pribadi dan room grup.

### Events Pesan
- `send_message`: Client mengirim pesan baru.
- `receive_message`: Server mem-broadcast pesan ke penerima/grup.
- `typing`: Client mengirim status mengetik (`is_typing: true/false`).
- `typing_status`: Server memberi tahu lawan bicara bahwa seseorang sedang mengetik.
- `mark_read`: Menandai pesan sudah dibaca.
- `messages_read`: Notifikasi ke pengirim bahwa pesannya sudah dibaca.
- `delete_message`: Menghapus pesan (real-time).
- `edit_message`: Mengedit pesan (real-time).

### Events Panggilan Suara (WebRTC) 📞
- `call_user`: Client A memulai panggilan ke Client B (mengirim signal Offer).
- `incoming_call`: Client B menerima notifikasi panggilan masuk (beserta Offer).
- `answer_call`: Client B menjawab panggilan (mengirim signal Answer).
- `call_accepted`: Client A menerima jawaban (Answer) dan koneksi P2P terbentuk.
- `ice_candidate`: Pertukaran kandidat jaringan (ICE) untuk menembus NAT/Firewall.
- `reject_call`: Menolak panggilan masuk.
- `end_call`: Mengakhiri panggilan yang sedang berlangsung.

### Events Status
- `online_users`: Server mem-broadcast daftar ID pengguna yang sedang online.
- `disconnect`: Saat pengguna offline, server memperbarui daftar `online_users`.

---

## Kontak & Kredit 📞

**Maintained by:** Bang Ucok & Antigravity  
**Email:** emailsinaga@gmail.com  
**WhatsApp:** +6281234500747
