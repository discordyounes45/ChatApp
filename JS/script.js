// Initialize Supabase client
const SUPABASE_URL = 'https://jtyontqoxzpshinvidfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0eW9udHFveHpwc2hpbnZpZGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk5OTI1MjAsImV4cCI6MjA1NTU2ODUyMH0.0NMxh5OxWqyD2_Garr54gbVSsHNX-BSDPA-JuNqCAe4';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state management
let currentUser = null;          // Currently logged-in user
let selectedAvatar = null;       // Selected avatar seed character
let selectedUserId = null;       // ID of selected chat partner
let usersList = [];              // List of all users
let messagesSubscription = null; // Realtime text messages subscription
let audioSubscription = null;    // Realtime audio messages subscription

// DOM elements cache
const authContainer = document.getElementById('authContainer');
const chatContainer = document.getElementById('chatContainer');
const usernameInput = document.getElementById('username');
const avatarOptions = document.querySelectorAll('.avatar-option');
const registerBtn = document.getElementById('registerBtn');
const currentUserAvatar = document.getElementById('currentUserAvatar');
const currentUsername = document.getElementById('currentUsername');
const logoutBtn = document.getElementById('logoutBtn');
const usersList_el = document.getElementById('usersList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    initializeEventListeners();
});

// Check for existing session
async function checkSession() {
    const sessionData = localStorage.getItem('chatAppUser');
    if (sessionData) {
        try {
            currentUser = JSON.parse(sessionData);
            await loginUser(currentUser, false);
        } catch (error) {
            localStorage.removeItem('chatAppUser');
            showAuthScreen();
        }
    } else {
        showAuthScreen();
    }
}

// Show authentication screen
function showAuthScreen() {
    authContainer.style.display = 'flex';
    chatContainer.style.display = 'none';
}

// Show main chat interface
function showChatScreen() {
    authContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
    currentUserAvatar.src = getAvatarUrl(currentUser.avatar);
    currentUsername.textContent = currentUser.username;
    setupUsersSubscription();
    loadUsers();
}

// Initialize event listeners
function initializeEventListeners() {
    // Avatar selection
    avatarOptions.forEach(option => {
        option.addEventListener('click', () => {
            avatarOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedAvatar = option.getAttribute('data-avatar');
        });
    });

    // Registration
    registerBtn.addEventListener('click', handleRegistration);

    // Logout
    logoutBtn.addEventListener('click', handleLogout);

    // Message input
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', e => e.key === 'Enter' && sendMessage());
}

// Handle user registration
async function handleRegistration() {
    const username = usernameInput.value.trim();
    if (!username || !selectedAvatar) {
        alert('Please enter username and select avatar');
        return;
    }

    try {
        toggleButtonState(registerBtn, true, 'Registering...');

        // Check username availability
        const { data: existingUsers } = await supabase
            .from('users')
            .select('*')
            .eq('username', username);

        if (existingUsers.length > 0) {
            alert('Username taken');
            return;
        }

        // Create new user
        const { data: newUser } = await supabase
            .from('users')
            .insert([{ 
                username, 
                avatar: selectedAvatar, 
                last_seen: new Date().toISOString() 
            }])
            .select();

        await loginUser(newUser[0], true);
    } catch (error) {
        console.error('Registration failed:', error);
        alert('Registration error');
    } finally {
        toggleButtonState(registerBtn, false, 'Start Chatting');
    }
}

// Handle user login
async function loginUser(user, isNewUser) {
    currentUser = user;
    localStorage.setItem('chatAppUser', JSON.stringify(user));

    if (!isNewUser) {
        await supabase
            .from('users')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', user.id);
    }

    showChatScreen();
}

// Handle logout
async function handleLogout() {
    try {
        await supabase
            .from('users')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (messagesSubscription) supabase.removeChannel(messagesSubscription);
        if (audioSubscription) supabase.removeChannel(audioSubscription);

        localStorage.removeItem('chatAppUser');
        resetAppState();
        showAuthScreen();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Reset application state
function resetAppState() {
    currentUser = null;
    selectedUserId = null;
    usersList = [];
    messagesContainer.innerHTML = '<div class="no-chat-selected">Select a user to start chatting</div>';
}

// Setup users list subscription
function setupUsersSubscription() {
    supabase
        .channel('users-channel')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'users'
        }, () => loadUsers())
        .subscribe();
}

// Load and render users list
async function loadUsers() {
    try {
        const { data } = await supabase
            .from('users')
            .select('*')
            .order('username');

        usersList = data.filter(user => user.id !== currentUser.id);
        renderUsersList();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Render users list
function renderUsersList() {
    usersList_el.innerHTML = '';
    usersList.forEach(user => {
        const userItem = document.createElement('li');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <img src="${getAvatarUrl(user.avatar)}" class="user-avatar">
            <span>${user.username}</span>
        `;

        userItem.addEventListener('click', () => {
            document.querySelectorAll('.user-item').forEach(item => 
                item.classList.remove('active'));
            userItem.classList.add('active');
            selectedUserId = user.id;
            initializeChatSession(user.id);
        });

        usersList_el.appendChild(userItem);
    });
}

// Initialize chat session with selected user
function initializeChatSession(userId) {
    if (messagesSubscription) supabase.removeChannel(messagesSubscription);
    if (audioSubscription) supabase.removeChannel(audioSubscription);

    setupMessageSubscriptions(userId);
    loadMessages(userId);
}

// Setup realtime subscriptions
function setupMessageSubscriptions(userId) {
    // Text messages subscription
    messagesSubscription = supabase
        .channel(`text-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            table: 'messages',
            filter: `(sender_id=eq.${currentUser.id},receiver_id=eq.${userId})` +
                    ` OR (sender_id=eq.${userId},receiver_id=eq.${currentUser.id})`
        }, payload => appendMessage(payload.new))
        .subscribe();

    // Audio messages subscription
    audioSubscription = supabase
        .channel(`audio-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            table: 'audio_messages',
            filter: `(sender_id=eq.${currentUser.id},receiver_id=eq.${userId})` +
                    ` OR (sender_id=eq.${userId},receiver_id=eq.${currentUser.id})`
        }, payload => appendAudioMessage(payload.new))
        .subscribe();
}

// Load combined messages
async function loadMessages(userId) {
    try {
        messagesContainer.innerHTML = '<div class="loading">Loading messages...</div>';

        // Fetch text messages
        const { data: textMessages } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),` +
                `and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
            .order('created_at');

        // Fetch audio messages
        const { data: audioMessages } = await supabase
            .from('audio_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),` +
                `and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
            .order('created_at');

        // Combine and sort messages
        const allMessages = [...textMessages, ...audioMessages]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        messagesContainer.innerHTML = '';
        allMessages.forEach(message => {
            message.content ? appendMessage(message) : appendAudioMessage(message);
        });

        scrollToBottom();
    } catch (error) {
        messagesContainer.innerHTML = '<div class="error">Error loading messages</div>';
    }
}

// Send text message
async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText || !selectedUserId) return;

    try {
        toggleButtonState(sendBtn, true);
        const tempMessage = createTempMessage(messageText);
        appendMessage(tempMessage);
        messageInput.value = '';
        scrollToBottom();

        const { data } = await supabase
            .from('messages')
            .insert([{
                sender_id: currentUser.id,
                receiver_id: selectedUserId,
                content: messageText
            }])
            .select();

        // Replace temporary message with real one
        const realMessage = data[0];
        document.getElementById(`message-${tempMessage.id}`).id = `message-${realMessage.id}`;
    } catch (error) {
        document.getElementById(`message-${tempMessage.id}`)?.remove();
        alert('Message send failed');
    } finally {
        toggleButtonState(sendBtn, false);
    }
}

// Create temporary message object
function createTempMessage(content) {
    return {
        id: `temp-${Date.now()}`,
        sender_id: currentUser.id,
        receiver_id: selectedUserId,
        content,
        created_at: new Date().toISOString()
    };
}

// Append text message to UI
function appendMessage(message) {
    if (document.getElementById(`message-${message.id}`)) return;

    const isOutgoing = message.sender_id === currentUser.id;
    const sender = isOutgoing ? currentUser : usersList.find(u => u.id === message.sender_id);
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOutgoing ? 'message-outgoing' : 'message-incoming'}`;
    messageElement.id = `message-${message.id}`;

    messageElement.innerHTML = `
        <div class="message-content">${message.content}</div>
        <div class="message-meta">
            ${!isOutgoing ? `<img src="${getAvatarUrl(sender.avatar)}" alt="${sender.username}">` : ''}
            ${!isOutgoing ? `<span>${sender.username}</span>` : ''}
            <span>${formatDate(message.created_at)}</span>
        </div>
    `;

    messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

// Append audio message to UI
function appendAudioMessage(message) {
    if (document.getElementById(`audio-${message.id}`)) return;

    const isOutgoing = message.sender_id === currentUser.id;
    const sender = isOutgoing ? currentUser : usersList.find(u => u.id === message.sender_id);

    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOutgoing ? 'message-outgoing' : 'message-incoming'}`;
    messageElement.id = `audio-${message.id}`;

    messageElement.innerHTML = `
        <div class="message-content">
            <audio controls style="min-width: 200px;">
                <source src="${message.file_url}" type="audio/wav">
                Audio playback not supported
            </audio>
        </div>
        <div class="message-meta">
            ${!isOutgoing ? `<img src="${getAvatarUrl(sender.avatar)}" alt="${sender.username}">` : ''}
            ${!isOutgoing ? `<span>${sender.username}</span>` : ''}
            <span>${formatDate(message.created_at)}</span>
        </div>
    `;

    messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

// UI helpers
function toggleButtonState(button, isLoading, text = null) {
    button.disabled = isLoading;
    if (text) button.textContent = text;
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getAvatarUrl(seed) {
    return `https://api.dicebear.com/6.x/initials/svg?seed=${seed}`;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit'
    });
}

