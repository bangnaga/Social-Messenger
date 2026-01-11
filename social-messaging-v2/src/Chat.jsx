import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import {
    Send, User, Search, LogOut, MessageSquare,
    Users, Bell, UserPlus, Phone, Settings,
    HelpCircle, Edit3, MoreHorizontal, Smile, PlusSquare, Camera,
    Image as ImageIcon, File as FileIcon, Download, X, Loader2, Check, UserMinus, Globe, Info, Trash2, Heart, Reply, Pencil, Mic, Square, Music, Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker from 'emoji-picker-react';

const API_URL = 'http://localhost:3001';

const Chat = ({ user: initialUser, onLogout }) => {
    const [user, setUser] = useState(initialUser);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [activeChats, setActiveChats] = useState([]);
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [onlineUserIds, setOnlineUserIds] = useState([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [friends, setFriends] = useState([]);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [toast, setToast] = useState(null);
    const [typingUsers, setTypingUsers] = useState({}); // { friendId: true, 'group_groupId': [usernames] }
    const [showLeftSidebar, setShowLeftSidebar] = useState(true);
    const [showRightSidebar, setShowRightSidebar] = useState(true);
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [isSearchingInChat, setIsSearchingInChat] = useState(false);
    const [chatSearchQuery, setChatSearchQuery] = useState('');
    const [showSharedMedia, setShowSharedMedia] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [groupMembers, setGroupMembers] = useState([]);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState([]);
    const [editForm, setEditForm] = useState({
        full_name: initialUser.full_name || '',
        country: initialUser.country || '',
        bio: initialUser.bio || ''
    });

    const socketRef = useRef();
    const fileInputRef = useRef();
    const messageFileRef = useRef();
    const messagesEndRef = useRef(null);
    const emojiPickerRef = useRef();
    const typingTimeoutRef = useRef();
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const selectedFriendRef = useRef(selectedFriend);
    const selectedGroupRef = useRef(selectedGroup);

    // Sidebar State
    const [activeTab, setActiveTab] = useState('chat'); // chat, friends, notifications, calls, settings

    // Call State
    const [callState, setCallState] = useState('idle'); // idle, calling, receiving, connected, ended
    const [callerSignal, setCallerSignal] = useState(null);
    const [caller, setCaller] = useState(null); // { id, name }
    const [stream, setStream] = useState(null);
    const peerRef = useRef();
    const otherUserRef = useRef(); // The user we are in a call with
    const audioContextRef = useRef(null);
    const oscillatorRef = useRef(null);
    const gainNodeRef = useRef(null);

    // Ringtone Helper
    const startRingtone = () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
            oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.4); // C#6

            // Pulse effect
            gainNode.gain.setValueAtTime(0, ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);

            // Loop the "ring"
            // Since oscillators are one-shot, we might need a loop or simple interval.
            // Simpler: Just a continuous repeating warble for now, or use Interval.
            // Let's use a simple repeated sound logic via setInterval or just a warbling tone.

            // Better: Warbling tone
            oscillator.frequency.setTargetAtTime(880, ctx.currentTime, 0);

            // LFO for ringing effect
            const lfo = ctx.createOscillator();
            lfo.type = 'square';
            lfo.frequency.value = 0.5; // 1 ring per 2 seconds
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 500.0;

            // Actually, simpler approach for "Phone Ring":
            // Use local Interval to re-trigger beeps? No, messy with refs.
            // Let's use a constant warble.
            oscillator.type = 'triangle';

            // Connect
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.start();

            // Cyclic gain for ringing pattern (2s on, 1s off is hard with just nodes without scheduling loop)
            // Let's just do a pattern of beeps using current time
            const now = ctx.currentTime;

            // Scheduling a few rings ahead (robust enough for 10-20 sec)
            for (let i = 0; i < 20; i++) {
                const startTime = now + i * 3;
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.1);
                gainNode.gain.setValueAtTime(0.5, startTime + 1.0);
                gainNode.gain.linearRampToValueAtTime(0, startTime + 1.1);
            }

            oscillatorRef.current = oscillator;
            gainNodeRef.current = gainNode;
        } catch (e) { console.error("Audio Context Error", e); }
    };

    const stopRingtone = () => {
        try {
            if (gainNodeRef.current) {
                // Ramp down to avoid clicks
                gainNodeRef.current.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.1);
            }
            if (oscillatorRef.current) {
                oscillatorRef.current.stop(audioContextRef.current.currentTime + 0.1);
                oscillatorRef.current = null;
            }
        } catch (e) { console.error("Error stopping ringtone:", e); }
    };

    useEffect(() => {
        selectedFriendRef.current = selectedFriend;
    }, [selectedFriend]);

    useEffect(() => {
        selectedGroupRef.current = selectedGroup;
    }, [selectedGroup]);

    useEffect(() => {
        socketRef.current = io(API_URL);
        socketRef.current.emit('join', user.id);

        socketRef.current.on('receive_message', (message) => {
            if (message.group_id) {
                if (selectedGroupRef.current && message.group_id === selectedGroupRef.current.id) {
                    setMessages((prev) => [...prev, message]);
                }
                fetchGroups();
            } else {
                if (selectedFriendRef.current && (message.sender_id === selectedFriendRef.current.id || message.receiver_id === selectedFriendRef.current.id)) {
                    setMessages((prev) => [...prev, message]);
                    socketRef.current.emit('mark_read', { sender_id: message.sender_id, receiver_id: user.id });
                }
                fetchRecentChats();
            }
        });

        socketRef.current.on('typing_status', (data) => {
            if (data.group_id) {
                setTypingUsers(prev => {
                    const groupKey = `group_${data.group_id}`;
                    const current = prev[groupKey] || [];
                    if (data.is_typing) {
                        if (!current.includes(data.username)) return { ...prev, [groupKey]: [...current, data.username] };
                    } else {
                        return { ...prev, [groupKey]: current.filter(u => u !== data.username) };
                    }
                    return prev;
                });
            } else {
                setTypingUsers(prev => ({ ...prev, [data.sender_id]: data.is_typing }));
            }
        });

        socketRef.current.on('messages_read', (data) => {
            if (selectedFriendRef.current && data.reader_id === selectedFriendRef.current.id) {
                setMessages(prev => prev.map(m => m.sender_id === user.id ? { ...m, is_read: 1 } : m));
            }
            fetchRecentChats();
        });

        socketRef.current.on('history_cleared', (data) => {
            if (selectedFriendRef.current && data.cleared_by === selectedFriendRef.current.id) {
                setMessages([]);
                fetchRecentChats();
            }
        });

        socketRef.current.on('new_friend_request', (data) => {
            fetchPendingRequests();
            setToast({
                title: 'New Friend Request',
                message: `${data.from.full_name || data.from.username} wants to vibe with you!`,
                type: 'friend'
            });
            setTimeout(() => setToast(null), 5000);
        });

        socketRef.current.on('message_deleted', (data) => {
            setMessages(prev => prev.filter(m => m.id !== data.message_id));
            fetchRecentChats();
        });

        socketRef.current.on('message_deleted_confirm', (data) => {
            setMessages(prev => prev.filter(m => m.id !== data.message_id));
            fetchRecentChats();
        });

        socketRef.current.on('message_reaction', (data) => {
            setMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, reactions: data.reactions } : m));
        });

        socketRef.current.on('message_edited', (data) => {
            setMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, content: data.new_content, is_edited: 1 } : m));
            fetchRecentChats();
        });

        socketRef.current.on('message_edited_confirm', (data) => {
            setMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, content: data.new_content, is_edited: 1 } : m));
            fetchRecentChats();
        });

        // Call Events
        socketRef.current.on('incoming_call', (data) => {
            setCallState('receiving');
            setCallerSignal(data.signal);
            setCaller({ id: data.from, name: data.name });
            otherUserRef.current = { id: data.from, name: data.name };
            startRingtone();
        });

        socketRef.current.on('call_accepted', (signal) => {
            setCallState('connected');
            if (peerRef.current) {
                peerRef.current.setRemoteDescription(new RTCSessionDescription(signal)).catch(e => console.error("Set remote desc error", e));
            }
        });

        socketRef.current.on('call_rejected', () => {
            setCallState('idle');
            setCaller(null);
            setCallerSignal(null);
            alert("Call rejected");
            if (peerRef.current) peerRef.current.destroy();
        });

        socketRef.current.on('call_ended', () => {
            setCallState('idle');
            setCaller(null);
            setCallerSignal(null);
            stopRingtone();
            if (peerRef.current) peerRef.current.destroy();
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
            otherUserRef.current = null;
        });

        socketRef.current.on('ice_candidate', (candidate) => {
            if (peerRef.current && peerRef.current.remoteDescription) {
                peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("Add ICE error", e));
            }
        });

        socketRef.current.on('online_users', (userIds) => {
            setOnlineUserIds(userIds);
        });

        fetchRecentChats();
        fetchFriends();
        fetchPendingRequests();
        fetchGroups();
        const handleClickOutside = (event) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            socketRef.current.disconnect();
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [user.id]);

    const isOnline = (userId) => onlineUserIds.includes(Number(userId));

    useEffect(() => {
        if (selectedFriend) {
            fetchMessageHistory(selectedFriend.id);
            setTypingUsers(prev => ({ ...prev, [selectedFriend.id]: false })); // Clear typing status for selected friend
            socketRef.current.emit('mark_read', { sender_id: selectedFriend.id, receiver_id: user.id });
            fetchRecentChats();
        } else if (selectedGroup) {
            setTypingUsers(prev => ({ ...prev, [`group_${selectedGroup.id}`]: [] })); // Clear typing status for selected group
        }
    }, [selectedFriend, selectedGroup, user.id]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, typingUsers]);

    useEffect(() => {
        let interval;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } else {
            setRecordingTime(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const fetchRecentChats = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/users/recent`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setActiveChats(res.data);
        } catch (err) {
            console.error('Error fetching recent:', err);
        }
    };

    const fetchFriends = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/friends/list`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFriends(res.data);
        } catch (err) {
            console.error('Error fetching friends:', err);
        }
    };

    const fetchPendingRequests = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/friends/pending`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPendingRequests(res.data);
        } catch (err) {
            console.error('Error fetching pending:', err);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/groups/my`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setGroups(res.data);
        } catch (err) { console.error(err); }
    };

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/api/groups/create`, { name: newGroupName, userIds: selectedMemberIds }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setNewGroupName('');
            setSelectedMemberIds([]);
            setIsCreatingGroup(false);
            fetchGroups();
            setToast({ title: "Success", message: "Group created!", type: "success" });
        } catch (err) { console.error(err); }
    };

    const handleLeaveGroup = async () => {
        if (!selectedGroup) return;
        if (!window.confirm("Are you sure you want to leave this group?")) return;
        try {
            await axios.post(`${API_URL}/api/groups/${selectedGroup.id}/leave`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setSelectedGroup(null);
            fetchGroups();
            setToast({ title: "Left Group", message: "You have left the group", type: "info" });
        } catch (err) {
            console.error(err);
            setToast({ title: "Error", message: "Failed to leave group", type: "error" });
        }
    };

    const fetchMessageHistory = async (friendId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/messages/${friendId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Fetch reactions for each message
            const messagesWithReactions = await Promise.all(res.data.map(async m => {
                const reacts = await axios.get(`${API_URL}/api/messages/${m.id}/reactions`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                return { ...m, reactions: reacts.data };
            }));
            setMessages(messagesWithReactions);
        } catch (err) {
            console.error('Error fetching history:', err);
        }
    };

    const handleReact = async (messageId, emoji) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${API_URL}/api/messages/react`, { messageId, emoji }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state instantly
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: res.data.reactions } : m));
        } catch (err) {
            console.error('React failed:', err);
        }
    };

    const handleSearch = async (query) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/api/users/search?q=${query}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSearchResults(res.data);
        } catch (err) {
            console.error('Search error:', err);
        }
    };

    const handleInputTyping = (e) => {
        setInput(e.target.value);
        const handleTyping = (isTyping) => {
            if (!selectedFriend && !selectedGroup) return;
            socketRef.current.emit('typing', {
                sender_id: user.id,
                username: user.full_name || user.username,
                receiver_id: selectedGroup ? null : selectedFriend.id,
                group_id: selectedGroup ? selectedGroup.id : null,
                is_typing: isTyping
            });
        };

        handleTyping(true);

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            handleTyping(false);
        }, 3000);
    };

    const startCall = async () => {
        if (!selectedFriend) return;
        setCallState('calling');
        otherUserRef.current = selectedFriend;

        try {
            const currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setStream(currentStream);

            const peer = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            currentStream.getTracks().forEach(track => peer.addTrack(track, currentStream));

            peer.onicecandidate = (event) => {
                if (event.candidate) {
                    socketRef.current.emit('ice_candidate', { to: selectedFriend.id, candidate: event.candidate });
                }
            };

            peer.ontrack = (event) => {
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio) {
                    remoteAudio.srcObject = event.streams[0];
                    remoteAudio.play().catch(e => console.error("Remote audio play failed", e));
                }
            };

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);

            socketRef.current.emit('call_user', {
                userToCall: selectedFriend.id,
                signalData: offer,
                from: user.id,
                name: user.full_name || user.username
            });

            peerRef.current = peer;
        } catch (err) {
            console.error("Error starting call:", err);
            setCallState('idle');
        }
    };

    const answerCall = async () => {
        setCallState('connected');
        stopRingtone();
        try {
            const currentStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setStream(currentStream);

            const peer = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            currentStream.getTracks().forEach(track => peer.addTrack(track, currentStream));

            peer.onicecandidate = (event) => {
                if (event.candidate) {
                    socketRef.current.emit('ice_candidate', { to: caller.id, candidate: event.candidate });
                }
            };

            peer.ontrack = (event) => {
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio) {
                    remoteAudio.srcObject = event.streams[0];
                    remoteAudio.play().catch(e => console.error("Remote audio play failed", e));
                }
            };

            peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            socketRef.current.emit('answer_call', { signal: answer, to: caller.id });
            peerRef.current = peer;
        } catch (err) {
            console.error("Error answering call:", err);
        }
    };

    const rejectCall = () => {
        socketRef.current.emit('reject_call', { to: caller.id });
        setCallState('idle');
        setCaller(null);
        setCallerSignal(null);
        stopRingtone();
    };

    const endCall = () => {
        const targetId = otherUserRef.current ? otherUserRef.current.id : (caller ? caller.id : null);
        if (targetId) socketRef.current.emit('end_call', { to: targetId });

        if (peerRef.current) {
            peerRef.current.close();
            peerRef.current = null;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setCallState('idle');
        setCaller(null);
        setCallerSignal(null);
        otherUserRef.current = null;
        stopRingtone();
    };


    const sendFriendRequest = async (friendId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/api/friends/request`, { friendId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            handleSearch(searchQuery);
        } catch (err) {
            console.error('Request failed:', err);
        }
    };

    const acceptRequest = async (requestId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/api/friends/accept`, { requestId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchPendingRequests();
            fetchFriends();
        } catch (err) {
            console.error('Accept failed:', err);
        }
    };

    const rejectRequest = async (requestId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/api/friends/reject`, { requestId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchPendingRequests();
        } catch (err) {
            console.error('Reject failed:', err);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`${API_URL}/api/user/update`, editForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(res.data);
            localStorage.setItem('user', JSON.stringify(res.data));
            setIsEditingProfile(false);
        } catch (err) {
            console.error('Update failed:', err);
        }
    };

    const selectFriend = async (friend) => {
        setSelectedFriend(friend);
        setSelectedGroup(null);
        try {
            const res = await axios.get(`${API_URL}/api/messages/${friend.id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setMessages(res.data);
            socketRef.current.emit('mark_read', { sender_id: friend.id, receiver_id: user.id });
            fetchRecentChats();
            setShowEmojiPicker(false);
            setReplyingTo(null);
        } catch (err) {
            console.error(err);
        }
    };

    const selectGroup = async (group) => {
        console.log("Selecting group:", group);
        setSelectedGroup(group);
        setSelectedFriend(null);
        setGroupMembers([]);
        try {
            const [msgRes, memRes] = await Promise.all([
                axios.get(`${API_URL}/api/groups/${group.id}/messages`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                }),
                axios.get(`${API_URL}/api/groups/${group.id}/members`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                })
            ]);
            setMessages(msgRes.data);
            setGroupMembers(memRes.data);
            setShowEmojiPicker(false);
            setReplyingTo(null);
        } catch (err) { console.error(err); }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() && !editingMessage) return;

        const messageData = {
            sender_id: user.id,
            receiver_id: selectedGroup ? null : selectedFriend.id,
            group_id: selectedGroup ? selectedGroup.id : null,
            content: input,
            reply_to_id: replyingTo ? replyingTo.id : null,
            reply_content: replyingTo ? (replyingTo.type === 'text' ? replyingTo.content : `[${replyingTo.type}]`) : null
        };

        if (editingMessage) {
            socketRef.current.emit('edit_message', { message_id: editingMessage.id, sender_id: user.id, receiver_id: selectedFriend?.id, group_id: selectedGroup?.id, new_content: input });
            setEditingMessage(null);
        } else {
            socketRef.current.emit('send_message', messageData);
            // Optimistically add message to UI
            const optimisticMsg = {
                ...messageData,
                id: Date.now(),
                created_at: new Date().toISOString(),
                reactions: [],
                sender_name: user.full_name || user.username
            };
            setMessages((prev) => [...prev, optimisticMsg]);
        }
        setInput('');
        setReplyingTo(null);
        setShowEmojiPicker(false);
        // Clear typing status after sending message
        if (selectedFriend) {
            socketRef.current.emit('typing', { sender_id: user.id, receiver_id: selectedFriend.id, is_typing: false });
        } else if (selectedGroup) {
            socketRef.current.emit('typing', { sender_id: user.id, group_id: selectedGroup.id, is_typing: false });
        }
        if (!selectedGroup) fetchRecentChats();
        else fetchGroups(); // Update group list for last message preview
    };

    const handleDeleteMessage = (messageId) => {
        socketRef.current.emit('delete_message', { message_id: messageId, sender_id: user.id, receiver_id: selectedFriend?.id, group_id: selectedGroup?.id });
    };

    const scrollToMessage = (msgId) => {
        const element = document.getElementById(`msg-${msgId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-message');
            setTimeout(() => {
                element.classList.remove('highlight-message');
            }, 2000);
        }
    };

    const handleClearHistory = async () => {
        if (!selectedFriend) return;
        if (!window.confirm(`Are you sure you want to clear all chat history with ${selectedFriend.full_name || selectedFriend.username}? This cannot be undone.`)) return;

        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/api/messages/history/${selectedFriend.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessages([]);
            fetchRecentChats();
            // Tell the friend via socket
            socketRef.current.emit('clear_history', { sender_id: user.id, receiver_id: selectedFriend.id });
        } catch (err) {
            console.error('Clear history failed:', err);
        }
    };

    const handleFileSend = async (e) => {
        const file = e.target.files[0];
        if (!file || (!selectedFriend && !selectedGroup)) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${API_URL}/api/messages/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            const messageData = {
                sender_id: user.id,
                receiver_id: selectedGroup ? null : selectedFriend.id,
                group_id: selectedGroup ? selectedGroup.id : null,
                type: res.data.type,
                file_url: res.data.file_url,
                file_name: res.data.file_name,
                content: ''
            };

            socketRef.current.emit('send_message', messageData);
            setMessages(prev => [...prev, {
                ...messageData,
                created_at: new Date().toISOString(),
                is_read: 0,
                reactions: [],
                sender_name: user.full_name || user.username
            }]);
            setTimeout(selectedGroup ? fetchGroups : fetchRecentChats, 100);
        } catch (err) {
            console.error('File upload failed:', err);
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const selectUser = (u) => {
        setSelectedFriend(u);
        setSearchQuery('');
        setSearchResults([]);
        setIsSearching(false);
        if (!activeChats.find(chat => chat.id === u.id)) {
            setActiveChats(prev => [u, ...prev]);
        }
    };

    const onEmojiClick = (emojiData) => {
        setInput(prev => prev + emojiData.emoji);
    };

    const handleProfilePicClick = () => {
        fileInputRef.current.click();
    };

    const handleProfilePicChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('profile_pic', file);
        try {
            const res = await axios.post(`${API_URL}/api/user/upload-profile-pic`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setUser(prev => ({ ...prev, profile_pic: res.data.profile_pic }));
            initialUser.profile_pic = res.data.profile_pic;
        } catch (err) {
            console.error(err);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await sendVoiceMessage(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            setToast({ title: "Mic Error", message: "Could not access microphone", type: "error" });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const sendVoiceMessage = async (blob) => {
        if (!selectedFriend && !selectedGroup) return;
        const formData = new FormData();
        formData.append('file', blob, 'voice_message.webm');

        try {
            const res = await axios.post(`${API_URL}/api/messages/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('token')}` }
            });

            const voiceMsg = {
                sender_id: user.id,
                receiver_id: selectedGroup ? null : selectedFriend.id,
                group_id: selectedGroup ? selectedGroup.id : null,
                content: '',
                type: 'voice',
                file_url: res.data.file_url,
                file_name: 'Voice Message',
                reply_to_id: replyingTo ? replyingTo.id : null,
                reply_content: replyingTo ? (replyingTo.type === 'text' ? replyingTo.content : `[${replyingTo.type}]`) : null
            };

            socketRef.current.emit('send_message', voiceMsg);
            setMessages((prev) => [...prev, {
                ...voiceMsg,
                id: Date.now(),
                created_at: new Date().toISOString(),
                reactions: [],
                sender_name: user.full_name || user.username
            }]);
            setReplyingTo(null);
            selectedGroup ? fetchGroups() : fetchRecentChats();
        } catch (err) {
            console.error("Error uploading voice message:", err);
            setToast({ title: "Upload Failed", message: "Failed to send voice message", type: "error" });
        }
    };

    const renderMessageContent = (msg) => {
        const highlightText = (text, query) => {
            if (!query) return text;
            const parts = text.split(new RegExp(`(${query})`, 'gi'));
            return parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase()
                    ? <span key={i} className="bg-yellow-400 text-black px-0.5 rounded-sm">{part}</span>
                    : part
            );
        };

        if (msg.type === 'image') {
            return (
                <div className="flex flex-col gap-1 -m-1">
                    <img
                        src={`${API_URL}${msg.file_url}`}
                        alt="sent"
                        className="max-w-full max-h-[350px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(`${API_URL}${msg.file_url}`, '_blank')}
                    />
                    {msg.content && <p className="px-1 py-1 text-sm">{highlightText(msg.content, chatSearchQuery)}</p>}
                </div>
            );
        }
        if (msg.type === 'file') {
            return (
                <a
                    href={`${API_URL}${msg.file_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-1 rounded-lg hover:bg-white/5 transition-all"
                >
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                        <FileIcon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate text-white">{highlightText(msg.file_name, chatSearchQuery)}</p>
                        <p className="text-[10px] text-gray-400">Download Document</p>
                    </div>
                    <Download size={16} className="text-gray-400 flex-shrink-0 ml-2" />
                </a>
            );
        }
        if (msg.type === 'voice') {
            return (
                <div className="flex flex-col gap-2 min-w-[220px] p-1">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${msg.sender_id === user.id ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-400'}`}>
                            <Music size={18} />
                        </div>
                        <audio
                            controls
                            src={`${API_URL}${msg.file_url}`}
                            className={`h-8 w-40 filter ${msg.sender_id === user.id ? 'invert brightness-200' : 'opacity-80'}`}
                        />
                    </div>
                </div>
            );
        }
        return <p className="whitespace-pre-wrap">{highlightText(msg.content, chatSearchQuery)}</p>;
    };

    return (
        <div className="flex h-[92vh] w-[90vw] overflow-hidden bg-[#0a0b14]/80 glass rounded-[10px] shadow-2xl border border-white/5 relative">
            <input type="file" ref={fileInputRef} onChange={handleProfilePicChange} className="hidden" accept="image/*" />
            <input type="file" ref={messageFileRef} onChange={handleFileSend} className="hidden" />

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute top-6 right-6 z-[200] w-72 glass-popup p-4 rounded-[15px] border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.2)] flex items-start gap-3"
                    >
                        <div className="w-10 h-10 rounded-[10px] bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <Bell size={20} />
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{toast.title}</p>
                            <p className="text-xs text-white font-medium mt-1 leading-relaxed">{toast.message}</p>
                        </div>
                        <button onClick={() => setToast(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isEditingProfile && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-black/60 flex items-center justify-center p-6 backdrop-blur-md">
                        <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-md glass-popup p-8 rounded-[20px] border border-white/10 shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Edit Profile</h2>
                                <button onClick={() => setIsEditingProfile(false)} className="p-2 hover:bg-white/10 rounded-full text-gray-400 transition-colors"><X size={20} /></button>
                            </div>
                            <form onSubmit={handleUpdateProfile} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Full Name</label>
                                    <input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-[10px] p-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50" placeholder="Your Name" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Country</label>
                                    <input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-[10px] p-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50" placeholder="e.g. Indonesia" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Bio</label>
                                    <textarea value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-[10px] p-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 h-24 resize-none" placeholder="Tell something about yourself..." />
                                </div>
                                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase py-4 rounded-[12px] shadow-lg shadow-blue-500/20 transition-all active:scale-95">Save Changes</button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 0. Create Group Modal */}
            <AnimatePresence>
                {isCreatingGroup && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md glass-popup p-8 rounded-[30px] border border-white/10 shadow-2xl">
                            <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tight text-center underline decoration-blue-500 decoration-4 underline-offset-8">New Group</h2>
                            <form onSubmit={handleCreateGroup} className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Group Name</label>
                                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[15px] p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-bold transition-all" placeholder="The Vibe Squad..." required />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Select Members ({selectedMemberIds.length})</label>
                                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar space-y-2 p-2 bg-black/20 rounded-[15px] border border-white/5">
                                        {friends.map(f => (
                                            <label key={f.id} className="flex items-center gap-3 p-3 rounded-[12px] hover:bg-white/5 transition-all cursor-pointer group">
                                                <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center overflow-hidden border transition-all ${selectedMemberIds.includes(f.id) ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-white/5 opacity-50'}`}>
                                                    {f.profile_pic ? <img src={`${API_URL}${f.profile_pic}`} className="w-full h-full object-cover" alt="avatar" /> : <span className="text-sm font-black text-gray-400">{f.username[0]}</span>}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-white uppercase tracking-tight">{f.full_name || f.username}</p>
                                                    <p className="text-[10px] text-gray-500 font-bold">@{f.username}</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={selectedMemberIds.includes(f.id)}
                                                    onChange={e => {
                                                        if (e.target.checked) setSelectedMemberIds([...selectedMemberIds, f.id]);
                                                        else setSelectedMemberIds(selectedMemberIds.filter(id => id !== f.id));
                                                    }}
                                                />
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMemberIds.includes(f.id) ? 'bg-blue-600 border-blue-600' : 'border-white/10'}`}>
                                                    {selectedMemberIds.includes(f.id) && <Check size={12} className="text-white" />}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button type="button" onClick={() => setIsCreatingGroup(false)} className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-white transition-all">Cancel</button>
                                    <button type="submit" className="flex-2 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase py-4 rounded-[15px] shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                        Create <PlusSquare size={16} />
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="w-16 glass flex flex-col items-center py-6 gap-6 border-r border-white/5">
                <div className="w-10 h-10 rounded-[10px] bg-gradient-to-tr from-blue-400 to-purple-600 flex items-center justify-center shadow-lg overflow-hidden">
                    {user.profile_pic ? (
                        <img src={`${API_URL}${user.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                    ) : (
                        <div className="w-5 h-5 bg-white rounded-full opacity-80 blur-[2px]" />
                    )}
                </div>
                <div className="flex flex-col gap-4 mt-2">
                    <button onClick={() => setActiveTab('chat')} className={`p-3 rounded-[10px] transition-all ${activeTab === 'chat' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><MessageSquare size={20} /></button>
                    <button onClick={() => setActiveTab('friends')} className={`p-3 rounded-[10px] transition-all ${activeTab === 'friends' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><Users size={20} /></button>
                    <button onClick={() => setActiveTab('notifications')} className={`p-3 rounded-[10px] transition-all group relative ${activeTab === 'notifications' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                        <Bell size={20} />
                        {pendingRequests.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0a0b14]"></span>}
                    </button>
                    <button onClick={() => setActiveTab('calls')} className={`p-3 rounded-[10px] transition-all ${activeTab === 'calls' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><Phone size={20} /></button>
                    <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-[10px] transition-all ${activeTab === 'settings' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}><Settings size={20} /></button>
                </div>
                <div className="mt-auto flex flex-col gap-4 items-center">
                    <button className="p-3 text-gray-500 hover:text-white transition-colors"><HelpCircle size={20} /></button>
                    <button onClick={onLogout} className="p-3 text-gray-500 hover:text-red-400 transition-colors bg-white/5 rounded-[10px]"><LogOut size={20} /></button>
                </div>
            </div>

            {/* 2. Chat Sidebar */}
            <AnimatePresence initial={false}>
                {showLeftSidebar && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 288, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="glass flex flex-col p-4 overflow-hidden border-r border-white/5 shrink-0"
                    >
                        {activeTab === 'chat' && (
                            <>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-black text-white uppercase tracking-tighter">CHATS</h2>
                                    <button className="p-2 bg-white/5 rounded-[8px] text-gray-400 hover:text-white"><Edit3 size={16} /></button>
                                </div>

                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        placeholder="Find new friends..."
                                        className="w-full bg-white/5 border border-white/5 rounded-[10px] py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 font-medium"
                                    />
                                    <AnimatePresence>
                                        {searchResults.length > 0 && (
                                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute z-50 top-full left-0 right-0 mt-2 glass rounded-[10px] overflow-hidden shadow-2xl border border-white/10 backdrop-blur-3xl">
                                                {searchResults.map(u => (
                                                    <div key={u.id} className="w-full p-3 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0">
                                                        <button onClick={() => selectUser(u)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                                                            <div className="w-8 h-8 rounded-[8px] bg-slate-800 flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                                                                {u.profile_pic ? (
                                                                    <img src={`${API_URL}${u.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                                                                ) : (
                                                                    <span className="text-[10px] font-bold text-blue-400 uppercase">{u.username[0]}</span>
                                                                )}
                                                            </div>
                                                            <div className="truncate">
                                                                <p className="text-[11px] font-bold text-white truncate">{u.full_name || u.username}</p>
                                                                <p className="text-[9px] text-gray-500">@{u.username}</p>
                                                            </div>
                                                        </button>

                                                        {u.friendStatus === 'none' && (
                                                            <button onClick={() => sendFriendRequest(u.id)} className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><UserPlus size={14} /></button>
                                                        )}
                                                        {u.friendStatus === 'pending' && u.isRequester && (
                                                            <span className="text-[9px] font-black text-gray-500 uppercase px-2">Pending</span>
                                                        )}
                                                        {u.friendStatus === 'pending' && !u.isRequester && (
                                                            <button className="p-2 bg-green-600/20 text-green-400 rounded-lg"><Bell size={14} /></button>
                                                        )}
                                                        {u.friendStatus === 'accepted' && (
                                                            <span className="p-2 text-green-500"><Check size={14} /></span>
                                                        )}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                    <div className="flex justify-between items-center mb-3 px-2">
                                        <p className="text-[9px] uppercase tracking-widest text-gray-500 font-extrabold">DIRECT MESSAGES</p>
                                    </div>
                                    <div className="space-y-1 mb-6">
                                        {activeChats.length > 0 ? activeChats.map(friend => (
                                            <button
                                                key={friend.id}
                                                onClick={() => selectFriend(friend)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-all relative ${selectedFriend?.id === friend.id ? 'bg-blue-600/20 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                                            >
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-[10px] bg-slate-800 flex items-center justify-center overflow-hidden border border-white/5 shadow-2xl">
                                                        {friend.profile_pic ? (
                                                            <img src={`${API_URL}${friend.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                                                        ) : (
                                                            <span className="text-sm font-black text-gray-400 uppercase">{friend.username[0]}</span>
                                                        )}
                                                    </div>
                                                    {isOnline(friend.id) && <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#0a0b14] rounded-full flex items-center justify-center"><div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_6px_#22c55e]"></div></div>}
                                                    {friend.unread_count > 0 && <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0a0b14] shadow-lg">{friend.unread_count}</div>}
                                                </div>
                                                <div className="text-left flex-1 min-w-0">
                                                    <p className={`text-xs font-bold truncate ${selectedFriend?.id === friend.id ? 'text-white' : 'text-gray-400'}`}>{friend.full_name || friend.username}</p>
                                                    <p className={`text-[10px] truncate mt-0.5 ${friend.unread_count > 0 ? 'text-white font-black' : 'text-gray-500'}`}>
                                                        {friend.last_message || 'Start vibing...'}
                                                    </p>
                                                </div>
                                            </button>
                                        )) : (
                                            <p className="text-[10px] text-gray-600 italic px-2">No recent chats</p>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center mb-3 px-2">
                                        <p className="text-[9px] uppercase tracking-widest text-gray-500 font-extrabold">GROUPS</p>
                                        <button onClick={() => setIsCreatingGroup(true)} className="p-1.5 hover:bg-white/10 rounded-full text-blue-400 transition-all"><PlusSquare size={14} /></button>
                                    </div>
                                    <div className="space-y-1 mb-6">
                                        {groups.map(group => (
                                            <button
                                                key={group.id}
                                                onClick={() => selectGroup(group)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-[12px] transition-all relative ${selectedGroup?.id === group.id ? 'bg-purple-600/20 border border-purple-500/20' : 'hover:bg-white/5 border border-transparent'}`}
                                            >
                                                <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-white/5 shadow-2xl">
                                                    <Hash size={18} className="text-purple-400" />
                                                </div>
                                                <div className="text-left flex-1 min-w-0">
                                                    <p className={`text-xs font-bold truncate ${selectedGroup?.id === group.id ? 'text-white' : 'text-gray-400'}`}>{group.name}</p>
                                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                                        {group.last_message ? `${group.last_sender}: ${group.last_message}` : 'No messages yet'}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                        {groups.length === 0 && <p className="text-[10px] text-gray-600 italic px-2">No groups yet</p>}
                                    </div>

                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-extrabold mb-3 px-2">FRIENDS</p>
                                    <div className="space-y-1">
                                        {friends.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => selectFriend(f)}
                                                className="w-full flex items-center gap-3 p-3 rounded-[10px] hover:bg-white/5 transition-all text-left"
                                            >
                                                <div className="w-8 h-8 rounded-[8px] bg-slate-800 flex items-center justify-center overflow-hidden border border-white/5">
                                                    {f.profile_pic ? (
                                                        <img src={`${API_URL}${f.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                                                    ) : (
                                                        <span className="text-xs font-black text-gray-400 uppercase">{f.username[0]}</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-300 truncate">{f.full_name || f.username}</p>
                                                </div>
                                                {isOnline(f.id) && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'friends' && (
                            <>
                                <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-6">Friends</h2>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                    <div className="space-y-2">
                                        {friends.length === 0 ? <p className="text-xs text-gray-500 text-center mt-10">No friends yet</p> : friends.map(f => (
                                            <div key={f.id} className="w-full flex items-center gap-3 p-3 bg-white/5 rounded-[12px] hover:bg-white/10 transition-all">
                                                <div className="w-10 h-10 rounded-[10px] bg-slate-800 overflow-hidden">
                                                    {f.profile_pic ? <img src={`${API_URL}${f.profile_pic}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/50">{f.username[0]}</div>}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-white">{f.full_name || f.username}</p>
                                                    <p className="text-[10px] text-gray-500">@{f.username}</p>
                                                </div>
                                                <button onClick={() => { selectFriend(f); setActiveTab('chat'); }} className="p-2 bg-blue-600 rounded-[8px] text-white"><MessageSquare size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'notifications' && (
                            <>
                                <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-6">Notifications</h2>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-extrabold mb-3">FRIEND REQUESTS</p>
                                    <div className="space-y-3">
                                        {pendingRequests.length === 0 ? <p className="text-xs text-gray-500 text-center mt-4">No new notifications</p> : pendingRequests.map(req => (
                                            <div key={req.request_id} className="p-3 bg-white/5 rounded-[12px] space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden">
                                                        {req.profile_pic ? <img src={`${API_URL}${req.profile_pic}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">{req.username[0]}</div>}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-white"><span className="text-blue-400">@{req.username}</span></p>
                                                        <p className="text-[10px] text-gray-400">wants to be friends</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => acceptRequest(req.request_id)} className="flex-1 py-1.5 bg-green-600 rounded-[6px] text-[10px] font-black uppercase text-white hover:bg-green-500">Accept</button>
                                                    <button onClick={() => {
                                                        const token = localStorage.getItem('token');
                                                        axios.post(`${API_URL}/api/friends/reject`, { requestId: req.request_id }, { headers: { Authorization: `Bearer ${token}` } })
                                                            .then(() => fetchPendingRequests());
                                                    }} className="flex-1 py-1.5 bg-white/10 rounded-[6px] text-[10px] font-black uppercase text-gray-400 hover:bg-red-500 hover:text-white">Reject</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'calls' && (
                            <>
                                <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-6">Calls</h2>
                                <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                                    <Phone size={48} className="mb-4 text-gray-500" />
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Call History</p>
                                    <p className="text-[10px] text-gray-600 mt-2">Coming Soon</p>
                                </div>
                            </>
                        )}

                        {activeTab === 'settings' && (
                            <>
                                <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-6">Settings</h2>
                                <div className="space-y-2">
                                    <button onClick={() => setIsEditingProfile(true)} className="w-full p-4 bg-white/5 rounded-[15px] flex items-center justify-between hover:bg-white/10 transition-all group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><Edit3 size={16} /></div>
                                            <span className="text-sm font-bold text-gray-300 group-hover:text-white">Edit Profile</span>
                                        </div>
                                    </button>
                                    <button onClick={onLogout} className="w-full p-4 bg-red-500/10 rounded-[15px] flex items-center justify-between hover:bg-red-500/20 transition-all group mt-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500"><LogOut size={16} /></div>
                                            <span className="text-sm font-bold text-red-400 group-hover:text-red-300">Log Out</span>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3. Main Chat View */}
            <div className="flex-1 glass flex flex-col overflow-hidden relative border-r border-white/5">
                {(selectedFriend || selectedGroup) ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-20 glass flex items-center justify-between px-8 border-b border-white/5 shrink-0 z-30">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className={`w-12 h-12 rounded-[12px] bg-gradient-to-br ${selectedGroup ? 'from-purple-500 to-indigo-600' : 'from-blue-500 to-indigo-600'} flex items-center justify-center shadow-xl border border-white/10 overflow-hidden`}>
                                        {selectedGroup ? (
                                            <Hash className="text-white" size={24} />
                                        ) : (
                                            selectedFriend.profile_pic ? (
                                                <img src={`${API_URL}${selectedFriend.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                                            ) : (
                                                <span className="text-lg font-black text-white">{selectedFriend.username[0].toUpperCase()}</span>
                                            )
                                        )}
                                    </div>
                                    {!selectedGroup && isOnline(selectedFriend.id) && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#0a0b14] rounded-full flex items-center justify-center"><div className="w-3 h-3 bg-green-500 rounded-full"></div></div>}
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-white uppercase tracking-tight">{selectedGroup ? selectedGroup.name : (selectedFriend.full_name || selectedFriend.username)}</h3>
                                    <p className="text-[10px] font-black text-blue-400/80 uppercase tracking-widest">
                                        {selectedGroup ? (
                                            typingUsers[`group_${selectedGroup.id}`]?.length > 0 ? (
                                                <span className="text-purple-400 animate-pulse">{typingUsers[`group_${selectedGroup.id}`].join(', ')} typing...</span>
                                            ) : 'Group Chat'
                                        ) : (
                                            typingUsers[selectedFriend?.id] ? (
                                                <span className="text-blue-400 animate-pulse">Typing...</span>
                                            ) : (
                                                <>{selectedFriend.username} -- {isOnline(selectedFriend.id) ? "online" : "offline"}</>
                                            )
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400">
                                {selectedFriend && (
                                    <button
                                        onClick={startCall}
                                        className="p-3 bg-white/5 hover:bg-green-600 hover:text-white rounded-[12px] transition-all border border-white/5 shadow-lg active:scale-95"
                                        title="Start Call"
                                    >
                                        <Phone size={18} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsSearchingInChat(!isSearchingInChat)}
                                    className={`p-3 bg-white/5 rounded-[12px] transition-all border border-white/5 hover:bg-white/10 ${isSearchingInChat ? 'text-blue-400' : 'text-gray-400'}`}
                                >
                                    <Search size={18} />
                                </button>
                                <button
                                    onClick={handleClearHistory}
                                    title="Clear Chat History"
                                    className="p-3 bg-white/5 rounded-[12px] transition-all border border-white/5 hover:bg-red-600/20 hover:text-red-400 text-gray-500"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <button
                                    onClick={() => setShowRightSidebar(!showRightSidebar)}
                                    className={`p-3 bg-white/5 rounded-[12px] transition-all border border-white/5 hover:bg-white/10 ${showRightSidebar ? 'text-blue-400' : 'text-gray-400'}`}
                                >
                                    <User size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Call Overlays */}
                        <AnimatePresence>
                            {callState === 'receiving' && (
                                <motion.div
                                    initial={{ y: -100, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -100, opacity: 0 }}
                                    className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 bg-[#0a0b14]/90 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl flex items-center gap-6"
                                >
                                    <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-white/10 overflow-hidden flex items-center justify-center animate-pulse">
                                        <User size={32} className="text-gray-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Incoming Call</p>
                                        <p className="text-xl font-black text-white">{caller?.name}</p>
                                    </div>
                                    <div className="flex gap-4 ml-4">
                                        <button onClick={rejectCall} className="p-4 bg-red-600 text-white rounded-full shadow-lg hover:scale-110 transition-transform"><X size={24} /></button>
                                        <button onClick={answerCall} className="p-4 bg-green-500 text-white rounded-full shadow-lg hover:scale-110 transition-transform"><Phone size={24} /></button>
                                    </div>
                                </motion.div>
                            )}

                            {(callState === 'calling' || callState === 'connected') && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex flex-col items-center justify-center"
                                >
                                    <div className="relative mb-8">
                                        <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-white/10 overflow-hidden flex items-center justify-center">
                                            {selectedFriend?.profile_pic ? <img src={`${API_URL}${selectedFriend.profile_pic}`} className="w-full h-full object-cover" /> : <User size={64} className="text-gray-400" />}
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 p-3 bg-blue-500 rounded-full border-4 border-[#0a0b14] text-white">
                                            <Phone size={24} className="animate-pulse" />
                                        </div>
                                    </div>
                                    <h2 className="text-3xl font-black text-white mb-2">{otherUserRef.current?.name || selectedFriend?.name}</h2>
                                    <p className="text-blue-400 font-bold uppercase tracking-widest mb-12 animate-pulse">{callState === 'calling' ? 'Calling...' : 'In Call'}</p>

                                    <div className="flex gap-8">
                                        <button onClick={() => { }} className="p-6 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"><Mic size={32} /></button>
                                        <button onClick={endCall} className="p-6 bg-red-600 text-white rounded-full hover:bg-red-500 hover:scale-110 transition-all shadow-[0_0_30px_rgba(220,38,38,0.5)]"><Phone size={32} className="rotate-[135deg]" /></button>
                                        <button onClick={() => { }} className="p-6 bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"><Settings size={32} /></button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <audio id="remoteAudio" autoPlay className="hidden" />

                        <AnimatePresence>
                            {isSearchingInChat && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="px-4 py-2 bg-slate-900/50 border-b border-white/5 flex items-center gap-3"
                                >
                                    <Search size={14} className="text-gray-500" />
                                    <input
                                        autoFocus
                                        value={chatSearchQuery}
                                        onChange={(e) => setChatSearchQuery(e.target.value)}
                                        placeholder="Search messages..."
                                        className="bg-transparent border-none focus:outline-none text-xs text-white flex-1"
                                    />
                                    <button
                                        onClick={() => {
                                            setIsSearchingInChat(false);
                                            setChatSearchQuery('');
                                        }}
                                        className="text-gray-500 hover:text-white"
                                    >
                                        <X size={14} />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#0f1021]/30">
                            {messages.map((msg, i) => (
                                <div key={msg.id || i} id={`msg-${msg.id}`} className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'} group/msg relative transition-all`}>
                                    <div className={`max-w-[70%] flex flex-col ${msg.sender_id === user.id ? 'items-end' : 'items-start'}`}>
                                        <div className={`p-3 px-5 rounded-[12px] text-sm font-medium shadow-xl border relative transition-all ${msg.sender_id === user.id
                                            ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-tr-none border-blue-400/20'
                                            : 'bg-white/5 text-gray-100 rounded-tl-none border-white/5'
                                            } ${msg.type === 'image' ? 'p-1 px-1' : ''}`}>
                                            {selectedGroup && msg.sender_id !== user.id && (
                                                <p className="text-[9px] font-black text-blue-400 uppercase mb-1.5 px-1 tracking-wider">{msg.sender_name}</p>
                                            )}
                                            {msg.reply_to_id && (
                                                <div
                                                    onClick={() => scrollToMessage(msg.reply_to_id)}
                                                    className={`mb-2 p-2 rounded-lg text-[10px] border-l-4 ${msg.sender_id === user.id ? 'bg-black/20 border-blue-400' : 'bg-white/5 border-gray-500'} italic opacity-80 max-w-full truncate cursor-pointer hover:opacity-100 transition-opacity`}
                                                >
                                                    {msg.reply_content || 'Original message deleted'}
                                                </div>
                                            )}
                                            {renderMessageContent(msg)}

                                            {/* Message Toolbar */}
                                            <div className={`absolute top-0 -translate-y-full mb-2 flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-full opacity-0 group-hover/msg:opacity-100 transition-all z-20 ${msg.sender_id === user.id ? 'right-0' : 'left-0'}`}>
                                                <button onClick={() => setReplyingTo(msg)} title="Reply" className="p-1.5 hover:bg-white/10 rounded-full transition-colors"><Reply size={12} className="text-gray-400" /></button>
                                                {msg.sender_id !== user.id ? (
                                                    <>
                                                        <button onClick={() => handleReact(msg.id, '❤️')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-[12px]">❤️</button>
                                                        <button onClick={() => handleReact(msg.id, '👍')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-[12px]">👍</button>
                                                        <button onClick={() => handleReact(msg.id, '😂')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-[12px]">😂</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {msg.type === 'text' && (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingMessage(msg);
                                                                    setInput(msg.content);
                                                                    setReplyingTo(null);
                                                                }}
                                                                title="Edit"
                                                                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                                                            >
                                                                <Pencil size={12} className="text-gray-400" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDeleteMessage(msg.id)} title="Delete" className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors"><Trash2 size={12} /></button>
                                                    </>
                                                )}
                                            </div>

                                            {/* Reactions Display */}
                                            {msg.reactions && msg.reactions.length > 0 && (
                                                <div className="absolute -bottom-2 right-2 flex -space-x-1">
                                                    {msg.reactions.map((r, ri) => (
                                                        <div key={ri} title={`${r.username} reacted ${r.emoji}`} className="w-5 h-5 bg-slate-800 border border-white/10 rounded-full flex items-center justify-center text-[10px] shadow-lg">
                                                            {r.emoji}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5 px-1">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-500 opacity-50">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {msg.is_edited ? ' (edited)' : ''}
                                            </p>
                                            {msg.sender_id === user.id && (
                                                <div className="flex items-center">
                                                    {msg.is_read ? (
                                                        <div className="flex -space-x-1">
                                                            <Check size={10} className="text-blue-400" />
                                                            <Check size={10} className="text-blue-400" />
                                                        </div>
                                                    ) : (
                                                        <Check size={10} className="text-gray-600" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {selectedFriend && typingUsers[selectedFriend.id] && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 p-3 px-5 rounded-[12px] rounded-tl-none border border-white/5 flex gap-1 items-center">
                                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            )}
                            {selectedGroup && typingUsers[`group_${selectedGroup.id}`]?.length > 0 && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 p-3 px-5 rounded-[12px] rounded-tl-none border border-white/5 flex gap-1 items-center">
                                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                        <span className="text-xs text-gray-400 ml-2">{typingUsers[`group_${selectedGroup.id}`].join(', ')} typing...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 bg-white/5 border-t border-white/5 relative">
                            <AnimatePresence>
                                {replyingTo && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-full left-0 right-0 p-3 bg-slate-900/90 backdrop-blur-3xl border-t border-white/10 flex items-center gap-3 z-30"
                                    >
                                        <div className="w-1 bg-blue-500 h-8 rounded-full"></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Replying to {replyingTo.sender_id === user.id ? 'yourself' : (replyingTo.sender_name || selectedFriend?.full_name || selectedFriend?.username || 'user')}</p>
                                            <p className="text-xs text-gray-300 truncate">{replyingTo.content || (replyingTo.type === 'image' ? 'Image' : 'File')}</p>
                                        </div>
                                        <button onClick={() => setReplyingTo(null)} className="p-2 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-all">
                                            <X size={16} />
                                        </button>
                                    </motion.div>
                                )}
                                {editingMessage && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-full left-0 right-0 p-3 bg-slate-900/90 backdrop-blur-3xl border-t border-white/10 flex items-center gap-3 z-30"
                                    >
                                        <div className="w-1 bg-yellow-500 h-8 rounded-full"></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Editing Message</p>
                                            <p className="text-xs text-gray-300 truncate">{editingMessage.content}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setEditingMessage(null);
                                                setInput('');
                                            }}
                                            className="p-2 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-all"
                                        >
                                            <X size={16} />
                                        </button>
                                    </motion.div>
                                )}
                                {showEmojiPicker && (
                                    <motion.div
                                        ref={emojiPickerRef}
                                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                        className="absolute bottom-full left-4 mb-4 z-50 shadow-2xl"
                                    >
                                        <EmojiPicker
                                            onEmojiClick={onEmojiClick}
                                            theme="dark"
                                            searchDisabled
                                            skinTonesDisabled
                                            width={320}
                                            height={400}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <form onSubmit={handleSendMessage} className="relative group flex items-center gap-3">
                                <div className="flex-1 relative flex items-center">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex gap-3 text-gray-500 group-focus-within:text-blue-400 transition-colors z-10">
                                        <Smile
                                            size={18}
                                            className={`cursor-pointer hover:text-white transition-colors ${showEmojiPicker ? 'text-blue-400' : ''}`}
                                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        />
                                        <div className="relative">
                                            {isUploading ? (
                                                <Loader2 size={18} className="animate-spin text-blue-400" />
                                            ) : (
                                                <PlusSquare
                                                    size={18}
                                                    className="cursor-pointer hover:text-white transition-colors"
                                                    onClick={() => messageFileRef.current.click()}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        value={input}
                                        onChange={handleInputTyping}
                                        placeholder={isRecording ? "Recording voice..." : "Type a message..."}
                                        disabled={isRecording}
                                        className="w-full bg-slate-900/50 border border-white/5 rounded-[12px] py-3.5 pl-16 pr-4 focus:outline-none focus:ring-1 focus:ring-blue-500/20 text-white text-sm font-medium transition-all"
                                        onFocus={() => setShowEmojiPicker(false)}
                                    />

                                    <AnimatePresence>
                                        {isRecording && (
                                            <motion.div
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="absolute inset-0 bg-slate-900 rounded-[12px] flex items-center justify-between px-4 z-20"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                                                    <span className="text-white font-black text-[10px] uppercase tracking-[0.2em]">Recording {formatTime(recordingTime)}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => setIsRecording(false)} className="p-2 text-gray-500 hover:text-white"><X size={16} /></button>
                                                    <button type="button" onClick={stopRecording} className="bg-red-600 hover:bg-red-500 p-2 rounded-lg text-white shadow-lg shadow-red-500/20 transition-all">
                                                        <Square size={14} fill="currentColor" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {input.trim() || isUploading ? (
                                    <button type="submit" className="w-12 h-12 shrink-0 bg-blue-600 hover:bg-blue-500 rounded-[12px] shadow-lg shadow-blue-500/30 active:scale-95 transition-all text-white flex items-center justify-center">
                                        <Send size={18} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={startRecording}
                                        className={`w-12 h-12 shrink-0 rounded-[12px] flex items-center justify-center transition-all ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-white/5 text-blue-400 hover:bg-blue-600/20 hover:text-blue-300'}`}
                                    >
                                        <Mic size={20} />
                                    </button>
                                )}
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                        <MessageSquare size={100} />
                        <h2 className="text-3xl font-black mt-2 uppercase tracking-tighter">Vibe Chat</h2>
                    </div>
                )}
            </div>

            {/* 4. Right Side Panels */}
            <AnimatePresence initial={false}>
                {showRightSidebar && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 288, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="flex flex-col h-full bg-[#0a0b14]/50 overflow-hidden shrink-0 border-l border-white/5"
                    >
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/2">
                            <button
                                onClick={() => setShowSharedMedia(false)}
                                className={`text-[9px] font-black tracking-widest uppercase pb-1 transition-all ${!showSharedMedia ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-white'}`}
                            >
                                Info
                            </button>
                            <button
                                onClick={() => setShowSharedMedia(true)}
                                className={`text-[9px] font-black tracking-widest uppercase pb-1 transition-all ${showSharedMedia ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-white'}`}
                            >
                                Shared Media
                            </button>
                        </div>

                        {!showSharedMedia ? (
                            <>
                                {/* Default View: User's Profile (if no friend selected) or Selected Friend info */}
                                {selectedFriend ? (
                                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center custom-scrollbar">
                                        <div className="w-24 h-24 rounded-[20px] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl mb-4 overflow-hidden border-2 border-white/10 relative group">
                                            {selectedFriend.profile_pic ? (
                                                <img src={`${API_URL}${selectedFriend.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                                            ) : (
                                                <span className="text-3xl font-black text-white">{selectedFriend.username[0].toUpperCase()}</span>
                                            )}
                                        </div>
                                        <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">{selectedFriend.full_name || selectedFriend.username}</h3>
                                        <p className="text-xs text-blue-400 font-bold mb-4">@{selectedFriend.username}</p>

                                        <div className="w-full space-y-4 text-left">
                                            <div className="p-4 rounded-[15px] bg-white/5 border border-white/5">
                                                <div className="flex items-center gap-2 mb-2 text-gray-400">
                                                    <Info size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">ABOUT</span>
                                                </div>
                                                <p className="text-xs text-gray-300 leading-relaxed italic">
                                                    {selectedFriend.bio || "This user prefers to keep the vibe mysterious..."}
                                                </p>
                                            </div>
                                            <div className="p-4 rounded-[15px] bg-white/5 border border-white/5">
                                                <div className="flex items-center gap-2 mb-2 text-gray-400">
                                                    <Globe size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">LOCATION</span>
                                                </div>
                                                <p className="text-xs text-white font-bold">{selectedFriend.country || "Earthlings"}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : selectedGroup ? (
                                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center custom-scrollbar">
                                        <div className="w-24 h-24 rounded-[20px] bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-2xl mb-4 border-2 border-white/10 relative">
                                            <Hash size={40} className="text-white" />
                                        </div>
                                        <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">{selectedGroup.name}</h3>
                                        <p className="text-xs text-purple-400 font-bold mb-6 uppercase tracking-widest">Group Vibe</p>

                                        <div className="w-full space-y-4 text-left">
                                            <div className="p-4 rounded-[15px] bg-white/5 border border-white/5">
                                                <div className="flex items-center gap-2 mb-4 text-gray-400">
                                                    <Users size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">MEMBERS ({groupMembers.length})</span>
                                                </div>
                                                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                                    {groupMembers.map(member => (
                                                        <div key={member.id} className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-[8px] bg-slate-800 flex items-center justify-center overflow-hidden border border-white/5">
                                                                {member.profile_pic ? (
                                                                    <img src={`${API_URL}${member.profile_pic}`} className="w-full h-full object-cover" alt="avatar" />
                                                                ) : (
                                                                    <span className="text-[10px] font-black text-gray-500">{member.username[0]}</span>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] font-bold text-gray-300 truncate">{member.full_name || member.username}</p>
                                                                <p className="text-[8px] text-gray-500 uppercase tracking-widest">{member.role || 'Member'}</p>
                                                            </div>
                                                            {isOnline(member.id) && <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_#22c55e]"></div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleLeaveGroup}
                                                className="w-full py-3 bg-red-600/20 text-red-400 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2"
                                            >
                                                <LogOut size={14} /> Leave Group
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                                        {/* My Profile */}
                                        <div className="p-6 flex flex-col items-center justify-center text-center">
                                            <div className="w-full flex justify-between items-center mb-6">
                                                <p className="text-[9px] uppercase font-black text-gray-500 tracking-[0.2em]">MY PROFILE</p>
                                                <button onClick={() => { setEditForm({ full_name: user.full_name || '', country: user.country || '', bio: user.bio || '' }); setIsEditingProfile(true); }} className="p-2 bg-white/5 rounded-lg text-blue-400 hover:bg-white/10 hover:text-white transition-all"><Edit3 size={14} /></button>
                                            </div>
                                            <div className="relative mb-4 group cursor-pointer" onClick={handleProfilePicClick}>
                                                <div className="absolute -inset-2 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
                                                <div className="relative w-20 h-20 rounded-[15px] border-2 border-white/5 p-1 group-hover:border-blue-500/30 transition-all overflow-hidden flex items-center justify-center bg-slate-800">
                                                    {user.profile_pic ? (
                                                        <img src={`${API_URL}${user.profile_pic}`} className="w-full h-full object-cover rounded-[12px]" alt="avatar" />
                                                    ) : (
                                                        <span className="text-xl font-black text-blue-500 uppercase">{user.username[0]}</span>
                                                    )}
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Camera className="text-white" size={24} />
                                                    </div>
                                                </div>
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-[#0a0b14]"></div>
                                            </div>
                                            <h3 className="text-base font-black text-white uppercase tracking-tight">{user.full_name || user.username}</h3>
                                            <p className="text-[9px] text-gray-500 font-bold tracking-[0.3em] uppercase mb-4">@{user.username}</p>
                                            <div className="w-full grid grid-cols-2 gap-2 mt-4">
                                                <div className="p-3 bg-white/5 rounded-[8px] border border-white/5">
                                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Messages</p>
                                                    <p className="text-lg font-black text-white">{(activeChats.length * 10) + messages.length}</p>
                                                </div>
                                                <div className="p-3 bg-white/5 rounded-[8px] border border-white/5">
                                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Friends</p>
                                                    <p className="text-lg font-black text-white">{friends.length}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Friend Requests */}
                                        <div className="p-4 flex flex-col border-t border-white/5 max-h-[250px] overflow-hidden">
                                            <p className="text-[9px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3">FRIEND REQUESTS ({pendingRequests.length})</p>
                                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                                                {pendingRequests.length > 0 ? pendingRequests.map((req) => (
                                                    <div key={req.request_id} className="flex items-center gap-3 pb-2 border-b border-white/5 last:border-0 last:pb-0">
                                                        <div className="w-10 h-10 rounded-[8px] border border-white/10 flex items-center justify-center bg-slate-800 overflow-hidden font-bold text-xs">
                                                            {req.profile_pic ? <img src={`${API_URL}${req.profile_pic}`} className="w-full h-full object-cover" alt="avatar" /> : req.username[0]}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-bold text-white truncate">{req.full_name || req.username}</p>
                                                            <p className="text-[9px] text-gray-500">@{req.username}</p>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => acceptRequest(req.request_id)} className="p-1.5 bg-blue-600/20 text-blue-400 rounded-md hover:bg-blue-600 hover:text-white transition-all"><Check size={12} /></button>
                                                            <button onClick={() => rejectRequest(req.request_id)} className="p-1.5 bg-red-600/20 text-red-400 rounded-md hover:bg-red-600 hover:text-white transition-all"><X size={12} /></button>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <p className="text-[10px] text-gray-600 italic">No pending requests</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Shared Items</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {messages.filter(m => m.type === 'image').length > 0 ? (
                                        messages.filter(m => m.type === 'image').map((m, idx) => (
                                            <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-blue-500 transition-all group relative cursor-pointer" onClick={() => window.open(`${API_URL}${m.file_url}`, '_blank')}>
                                                <img src={`${API_URL}${m.file_url}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="media" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <ImageIcon size={20} className="text-white" />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        null
                                    )}
                                </div>
                                <div className="mt-6 space-y-2 text-left">
                                    {messages.filter(m => m.type === 'file').length > 0 ? (
                                        messages.filter(m => m.type === 'file').map((m, idx) => (
                                            <a key={idx} href={`${API_URL}${m.file_url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/20 transition-all group">
                                                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                                    <FileIcon size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-white truncate">{m.file_name}</p>
                                                    <p className="text-[9px] text-gray-400">Document</p>
                                                </div>
                                            </a>
                                        ))
                                    ) : null}
                                    {messages.filter(m => m.type === 'image').length === 0 && messages.filter(m => m.type === 'file').length === 0 && (
                                        <p className="text-center text-gray-600 italic text-xs mt-10">No items shared yet</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Profile Modal */}
            <AnimatePresence>
                {isEditingProfile && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="w-full max-w-md glass-popup p-8 rounded-[30px] border border-white/10"
                        >
                            <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tight text-center">Update Profile</h2>
                            <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                                    <input
                                        value={editForm.full_name}
                                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                        placeholder="Full Name"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Country</label>
                                    <input
                                        value={editForm.country}
                                        onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                        placeholder="Country"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Bio</label>
                                    <textarea
                                        value={editForm.bio}
                                        onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 h-24 resize-none"
                                        placeholder="Tell us about yourself..."
                                    />
                                </div>
                                <div className="flex gap-4 pt-2">
                                    <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 py-4 rounded-xl font-bold text-xs uppercase tracking-widest text-gray-400 hover:text-white transition-all">Cancel</button>
                                    <button type="submit" className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all">Save Changes</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast Notifications */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className="fixed bottom-8 right-8 z-[200]"
                    >
                        <div className="glass-popup p-4 px-6 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-4 bg-[#0f1021]/95">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                {toast.type === 'friend' ? <Bell size={20} /> : <Check size={20} />}
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-tight">{toast.title}</h4>
                                <p className="text-[11px] text-gray-400">{toast.message}</p>
                            </div>
                            <button onClick={() => setToast(null)} className="ml-2 text-gray-500 hover:text-white"><X size={14} /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <input type="file" ref={fileInputRef} onChange={handleProfilePicChange} className="hidden" accept="image/*" />
            <input type="file" ref={messageFileRef} onChange={handleFileSend} className="hidden" />
        </div >
    );
};

export default Chat;
