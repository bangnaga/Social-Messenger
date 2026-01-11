# Peta Jalan Masa Depan: Fitur Panggilan Lanjutan

Dokumen ini menguraikan rencana implementasi untuk memperluas kemampuan panggilan pada Aplikasi Web Pesan Sosial.

## 1. Integrasi Panggilan Video 📹

**Tujuan:** Meningkatkan fitur panggilan suara 1-on-1 yang sudah ada agar mendukung streaming video dan melihat wajah gebetan.

-   **Perubahan Frontend (`Chat.jsx`):**
    -   Perbarui parameter `navigator.mediaDevices.getUserMedia` untuk menyertakan `video: true`.
    -   Tambahkan tombol toggle (Kamera Nyala/Mati) di tampilan panggilan aktif.
    -   Tampilkan pratinjau video lokal (di-mute) dan elemen video lawan bicara.
    -   Perbarui UI untuk menampilkan feed video (PIP atau Split View).
-   **Perubahan Backend:**
    -   Tidak ada perubahan besar yang diperlukan; jalur signaling yang ada (`call_user`, `answer_call`) sudah bekerja untuk video karena membawa SDP yang mencakup track video.

## 2. Berbagi Layar (Screen Sharing) 💻

**Tujuan:** Memungkinkan pengguna untuk membagikan tampilan layar mereka selama panggilan.

-   **Perubahan Frontend:**
    -   Tambahkan tombol "Bagikan Layar" di overlay panggilan.
    -   Gunakan `navigator.mediaDevices.getDisplayMedia` untuk menangkap stream layar.
    -   **Penggantian Track:** Logika untuk mengganti track video di pengirim `RTCPeerConnection` dengan track konten layar tanpa menegosiasikan ulang koneksi (menggunakan `replaceTrack`).
    -   Tangani event "Berhenti Berbagi" untuk kembali ke feed kamera.

## 3. Panggilan Grup (Multi-User) 👥

**Tujuan:** Mengaktifkan panggilan suara/video untuk banyak pengguna dalam Obrolan Grup.

-   **Pilihan Arsitektur:**
    -   **Pendekatan A (Jaringan Mesh):** Paling mudah diimplementasikan tanpa infrastruktur baru. Setiap klien terhubung P2P ke setiap klien lainnya. Bagus untuk 3-4 pengguna. Penggunaan bandwidth tinggi di sisi klien.
    -   **Pendekatan B (SFU - Selective Forwarding Unit):** Membutuhkan server media (misalnya, Mediasoup, Janus). Dapat diskalakan untuk grup yang lebih besar (5+).
    -   *Rekomendasi:* Mulai dengan **Jaringan Mesh** untuk MVP (hingga 4 pengguna).

-   **Langkah Implementasi (Mesh):**
    -   **Backend:**
        -   Logika room socket baru untuk `join_call_room`.
        -   Menangani relay `signal`: Server perlu meneruskan sinyal dari Pengguna A ke Pengguna B, C, dan D secara individual.
    -   **Frontend:**
        -   Kelola array `peerConnections` (satu untuk setiap peserta).
        -   UI dinamis untuk merender grid feed video.
        -   Tangani event "User Joined" dan "User Left" secara dinamis selama sesi aktif.

## Prioritas

1.  **Fase 1:** Panggilan Video (Kompleksitas rendah, dampak tinggi).
2.  **Fase 2:** Berbagi Layar (Kompleksitas sedang).
3.  **Fase 3:** Panggilan Grup (Kompleksitas tinggi).

---

## Kontak & Kredit 📞

**Maintained by:** Bang Ucok & Antigravity  
**Email:** emailsinaga@gmail.com  
**WhatsApp:** +6281234500747
