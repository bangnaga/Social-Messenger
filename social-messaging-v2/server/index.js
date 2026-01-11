/* eslint-env node */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Storage for profile pics
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Middlewares
app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// Swagger Documentation
require('./swagger')(app);

// Database Initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT,
    country TEXT,
    profile_pic TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    friend_id INTEGER,
    status TEXT DEFAULT 'pending', 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(friend_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    file_url TEXT,
    file_name TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    user_id INTEGER,
    emoji TEXT,
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER,
    group_pic TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    user_id INTEGER,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Safe column addition for existing DBs
try {
    db.prepare("ALTER TABLE users ADD COLUMN profile_pic TEXT").run();
} catch (e) { }

try {
    db.prepare("ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'").run();
} catch (e) { }
try {
    db.prepare("ALTER TABLE messages ADD COLUMN file_url TEXT").run();
} catch (e) { }
try {
    db.prepare("ALTER TABLE messages ADD COLUMN file_name TEXT").run();
} catch (e) { }
try {
    db.prepare("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER").run();
} catch (e) { }
try {
    db.prepare("ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0").run();
} catch (e) { }

try {
    db.prepare("ALTER TABLE users ADD COLUMN bio TEXT").run();
} catch (e) { }

try {
    db.prepare("ALTER TABLE messages ADD COLUMN group_id INTEGER").run();
} catch (e) { }

// Simple Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Routes
app.post('/api/register', async (req, res) => {
    const { username, password, full_name, country } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const info = db.prepare('INSERT INTO users (username, password, full_name, country) VALUES (?, ?, ?, ?)').run(username, hashedPassword, full_name, country);
        res.status(201).json({ id: info.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ error: 'Username already exists' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET || 'secret');
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, profile_pic: user.profile_pic } });
});

app.post('/api/user/upload-profile-pic', authenticateToken, upload.single('profile_pic'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const profilePicUrl = `/uploads/${req.file.filename}`;
    db.prepare('UPDATE users SET profile_pic = ? WHERE id = ?').run(profilePicUrl, req.user.id);
    res.json({ profile_pic: profilePicUrl });
});

app.put('/api/user/update', authenticateToken, (req, res) => {
    const { full_name, country, bio } = req.body;
    db.prepare('UPDATE users SET full_name = ?, country = ?, bio = ? WHERE id = ?')
        .run(full_name, country, bio, req.user.id);

    const updatedUser = db.prepare('SELECT id, username, full_name, country, bio, profile_pic FROM users WHERE id = ?').get(req.user.id);
    res.json(updatedUser);
});

app.post('/api/messages/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
        file_url: fileUrl,
        file_name: req.file.originalname,
        type: req.file.mimetype.startsWith('image/') ? 'image' : (req.file.mimetype.startsWith('audio/') ? 'voice' : 'file')
    });
});

// Search users
app.get('/api/users/search', authenticateToken, (req, res) => {
    const { q } = req.query;
    console.log(`Searching for: ${q} (requested by user ${req.user.id})`);
    if (!q) return res.json([]);
    const users = db.prepare('SELECT id, username, full_name, profile_pic FROM users WHERE username LIKE ? OR full_name LIKE ? LIMIT 10')
        .all(`%${q}%`, `%${q}%`);
    // For search, also check status of friendship
    const results = users.map(u => {
        const friendship = db.prepare('SELECT status, user_id FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
            .get(req.user.id, u.id, u.id, req.user.id);
        return {
            ...u,
            friendStatus: friendship ? friendship.status : 'none',
            isRequester: friendship ? friendship.user_id === req.user.id : false,
            requestId: friendship ? friendship.id : null
        };
    });

    const filtered = results.filter(u => u.id !== req.user.id);
    res.json(filtered);
});

// Get message history
app.get('/api/messages/:friendId', authenticateToken, (req, res) => {
    const { friendId } = req.params;
    const messages = db.prepare(`
        SELECT m.*, rm.content as reply_content, rm.sender_id as reply_sender_id 
        FROM messages m 
        LEFT JOIN messages rm ON m.reply_to_id = rm.id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) 
           OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.created_at ASC
    `).all(req.user.id, friendId, friendId, req.user.id);

    // Auto mark as read when history is fetched
    db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0')
        .run(friendId, req.user.id);

    // Add reactions to each message
    const messagesWithReactions = messages.map(msg => {
        const reactions = db.prepare('SELECT r.*, u.username FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?').all(msg.id);
        return { ...msg, reactions };
    });

    res.json(messagesWithReactions);
});

// Get users I've messaged with
app.get('/api/users/recent', authenticateToken, (req, res) => {
    // Advanced query to get users with last message and unread count
    const users = db.prepare(`
        SELECT 
            u.id, 
            u.username, 
            u.full_name, 
            u.profile_pic,
            (SELECT CASE 
                WHEN type = 'text' THEN content 
                WHEN type = 'image' THEN '📷 Sent a photo' 
                WHEN type = 'voice' THEN '🎙️ Voice message' 
                ELSE '📄 Sent a file' 
             END FROM messages 
             WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
             ORDER BY created_at DESC LIMIT 1) as last_message,
            (SELECT type FROM messages 
             WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id)
             ORDER BY created_at DESC LIMIT 1) as last_type,
            (SELECT COUNT(*) FROM messages 
             WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread_count,
            (SELECT rm.content 
             FROM messages m 
             LEFT JOIN messages rm ON m.reply_to_id = rm.id
             WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
             ORDER BY m.created_at DESC LIMIT 1) as last_reply_content
        FROM users u
        WHERE u.id IN (
            SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
            UNION
            SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
        )
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
    res.json(users);
});

// Mark messages as read
app.post('/api/messages/read-all', authenticateToken, (req, res) => {
    const { friendId } = req.body;
    db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0')
        .run(friendId, req.user.id);
    res.json({ success: true });
});

// React to a message
app.post('/api/messages/react', authenticateToken, (req, res) => {
    const { messageId, emoji } = req.body;
    // Remove existing reaction by same user on same message first
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(messageId, req.user.id);
    // Add new reaction
    db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
        .run(messageId, req.user.id, emoji);

    // Get updated reactions for socket emission
    const reactions = db.prepare('SELECT r.*, u.username FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?').all(messageId);

    // Find the receiver to notify
    const msg = db.prepare('SELECT sender_id, receiver_id FROM messages WHERE id = ?').get(messageId);
    if (msg) {
        const targetId = msg.sender_id === req.user.id ? msg.receiver_id : msg.sender_id;
        io.to(`user_${targetId}`).emit('message_reaction', { message_id: messageId, reactions });
    }

    res.json({ success: true, reactions });
});

// Get reactions for a message
app.get('/api/messages/:messageId/reactions', authenticateToken, (req, res) => {
    const reactions = db.prepare('SELECT r.*, u.username FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?').all(req.params.messageId);
    res.json(reactions);
});

// Delete all chat history with a friend
app.delete('/api/messages/history/:friendId', authenticateToken, (req, res) => {
    const { friendId } = req.params;
    db.prepare('DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)')
        .run(req.user.id, friendId, friendId, req.user.id);
    res.json({ success: true, message: 'Chat history cleared' });
});

// --- FRIENDSHIP ROUTES ---

// Send Friend Request
app.post('/api/friends/request', authenticateToken, (req, res) => {
    const { friendId } = req.body;
    if (req.user.id == friendId) return res.status(400).json({ error: "Cannot add yourself" });

    // Check if already exist
    const exist = db.prepare('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
        .get(req.user.id, friendId, friendId, req.user.id);

    if (exist) return res.status(400).json({ error: "Relationship already exists or pending" });

    const info = db.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)')
        .run(req.user.id, friendId, 'pending');

    // Notify recipient
    io.to(`user_${friendId}`).emit('new_friend_request', {
        from: { id: req.user.id, username: req.user.username, full_name: req.user.full_name }
    });

    res.json({ success: true });
});

// Get Pending Requests (Incoming)
app.get('/api/friends/pending', authenticateToken, (req, res) => {
    const pending = db.prepare(`
        SELECT f.id as request_id, u.id, u.username, u.full_name, u.profile_pic 
        FROM friends f 
        JOIN users u ON f.user_id = u.id 
        WHERE f.friend_id = ? AND f.status = 'pending'
    `).all(req.user.id);
    res.json(pending);
});

// Accept Friend Request
app.post('/api/friends/accept', authenticateToken, (req, res) => {
    const { requestId } = req.body;
    db.prepare("UPDATE friends SET status = 'accepted' WHERE id = ? AND friend_id = ?")
        .run(requestId, req.user.id);
    res.json({ success: true });
});

// Reject/Cancel Friend Request
app.post('/api/friends/reject', authenticateToken, (req, res) => {
    const { requestId } = req.body;
    db.prepare("DELETE FROM friends WHERE id = ? AND (friend_id = ? OR user_id = ?)")
        .run(requestId, req.user.id, req.user.id);
    res.json({ success: true });
});

// Get Friends List (Accepted)
app.get('/api/friends/list', authenticateToken, (req, res) => {
    const friends = db.prepare(`
        SELECT u.id, u.username, u.full_name, u.profile_pic 
        FROM friends f 
        JOIN users u ON (f.user_id = u.id OR f.friend_id = u.id) 
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted' AND u.id != ?
    `).all(req.user.id, req.user.id, req.user.id);
    res.json(friends);
});

// --- GROUP ROUTES ---
app.post('/api/groups/create', authenticateToken, (req, res) => {
    const { name, userIds } = req.body; // userIds is array of member IDs
    if (!name) return res.status(400).json({ error: "Group name required" });

    const info = db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run(name, req.user.id);
    const groupId = info.lastInsertRowid;

    const insertMember = db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
    insertMember.run(groupId, req.user.id, 'admin');

    if (userIds && Array.isArray(userIds)) {
        userIds.forEach(uid => {
            if (uid != req.user.id) insertMember.run(groupId, uid, 'member');
        });
    }

    res.json({ id: groupId, name });
});

app.get('/api/groups/my', authenticateToken, (req, res) => {
    const groups = db.prepare(`
        SELECT g.*, 
        (SELECT 
            CASE 
                WHEN type = 'image' THEN '📷 Photo'
                WHEN type = 'voice' THEN '🎙️ Voice message'
                WHEN type = 'file' THEN '📁 File'
                ELSE content 
            END
         FROM messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT u.username FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.group_id = g.id ORDER BY m.created_at DESC LIMIT 1) as last_sender
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
    `).all(req.user.id);
    res.json(groups);
});

app.get('/api/groups/:groupId/messages', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    // Check membership
    const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, req.user.id);
    if (!isMember) return res.status(403).json({ error: "Not a member" });

    const messages = db.prepare(`
        SELECT m.*, u.username as sender_name, u.profile_pic as sender_pic,
               rm.content as reply_content, rm.sender_id as reply_sender_id 
        FROM messages m 
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages rm ON m.reply_to_id = rm.id
        WHERE m.group_id = ? 
        ORDER BY m.created_at ASC
    `).all(groupId);

    const messagesWithReactions = messages.map(msg => {
        const reactions = db.prepare('SELECT r.emoji, u.username FROM reactions r JOIN users u ON r.user_id = u.id WHERE r.message_id = ?').all(msg.id);
        return { ...msg, reactions };
    });

    res.json(messagesWithReactions);
});

app.get('/api/groups/:groupId/members', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    try {
        const members = db.prepare(`
            SELECT u.id, u.username, u.full_name, u.profile_pic, gm.role
            FROM users u
            JOIN group_members gm ON u.id = gm.user_id
            WHERE gm.group_id = ?
        `).all(groupId);
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups/:groupId/leave', authenticateToken, (req, res) => {
    const { groupId } = req.params;
    try {
        db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Real-time with Socket.io
const onlineUsers = new Map(); // userId -> Set of socketIds

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);

        // Join group rooms
        const groups = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId);
        groups.forEach(g => socket.join(`group_${g.group_id}`));

        // Track online status
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId).add(socket.id);

        // Broadcast updated online list
        io.emit('online_users', Array.from(onlineUsers.keys()));
        console.log(`User ${userId} joined their room. Online users:`, Array.from(onlineUsers.keys()));
    });

    socket.on('send_message', (data) => {
        const { sender_id, receiver_id, group_id, content, type, file_url, file_name, reply_to_id } = data;
        const msgType = type || 'text';
        const msgContent = content || '';

        const info = db.prepare('INSERT INTO messages (sender_id, receiver_id, group_id, content, type, file_url, file_name, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(sender_id, receiver_id || null, group_id || null, msgContent, msgType, file_url || null, file_name || null, reply_to_id || null);

        // Fetch the sender info for groups
        const sender = db.prepare('SELECT username, profile_pic FROM users WHERE id = ?').get(sender_id);

        let reply_content = null;
        if (reply_to_id) {
            const rMsg = db.prepare('SELECT content FROM messages WHERE id = ?').get(reply_to_id);
            reply_content = rMsg ? rMsg.content : null;
        }

        const newMessage = {
            id: info.lastInsertRowid,
            sender_id,
            receiver_id,
            group_id,
            content,
            type: msgType,
            file_url,
            file_name,
            reply_to_id,
            reply_content,
            sender_name: sender.username,
            sender_pic: sender.profile_pic,
            created_at: new Date().toISOString(),
            reactions: []
        };

        if (group_id) {
            io.to(`group_${group_id}`).emit('receive_message', newMessage);
        } else {
            io.to(`user_${receiver_id}`).emit('receive_message', newMessage);
        }
        socket.emit('message_sent', newMessage);
    });

    socket.on('typing', (data) => {
        const { sender_id, receiver_id, group_id, is_typing } = data;
        if (group_id) {
            socket.to(`group_${group_id}`).emit('typing_status', { sender_id, group_id, is_typing });
        } else {
            io.to(`user_${receiver_id}`).emit('typing_status', { sender_id, is_typing });
        }
    });

    socket.on('mark_read', (data) => {
        const { sender_id, receiver_id } = data;
        db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?')
            .run(sender_id, receiver_id);
        io.to(`user_${sender_id}`).emit('messages_read', { reader_id: receiver_id });
    });

    socket.on('delete_message', (data) => {
        const { message_id, sender_id, receiver_id } = data;
        // Verify sender
        const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND sender_id = ?').get(message_id, sender_id);
        if (msg) {
            db.prepare('DELETE FROM messages WHERE id = ?').run(message_id);
            io.to(`user_${receiver_id}`).emit('message_deleted', { message_id });
            socket.emit('message_deleted_confirm', { message_id });
        }
    });

    socket.on('edit_message', (data) => {
        const { message_id, sender_id, receiver_id, new_content } = data;
        // Verify sender
        const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND sender_id = ?').get(message_id, sender_id);
        if (msg) {
            db.prepare('UPDATE messages SET content = ?, is_edited = 1 WHERE id = ?').run(new_content, message_id);
            io.to(`user_${receiver_id}`).emit('message_edited', { message_id, new_content });
            socket.emit('message_edited_confirm', { message_id, new_content });
        }
    });

    socket.on('clear_history', (data) => {
        const { sender_id, receiver_id } = data;
        io.to(`user_${receiver_id}`).emit('history_cleared', { cleared_by: sender_id });
    });

    // Voice Call Signaling
    socket.on('call_user', (data) => {
        const { userToCall, signalData, from, name } = data;
        io.to(`user_${userToCall}`).emit('incoming_call', { signal: signalData, from, name });
    });

    socket.on('answer_call', (data) => {
        io.to(`user_${data.to}`).emit('call_accepted', data.signal);
    });

    socket.on('reject_call', (data) => {
        io.to(`user_${data.to}`).emit('call_rejected');
    });

    socket.on('ice_candidate', (data) => {
        io.to(`user_${data.to}`).emit('ice_candidate', data.candidate);
    });

    socket.on('end_call', (data) => {
        io.to(`user_${data.to}`).emit('call_ended');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove from online list
        for (const [userId, sockets] of onlineUsers.entries()) {
            if (sockets.has(socket.id)) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                }
                // Broadcast updated online list
                io.emit('online_users', Array.from(onlineUsers.keys()));
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
