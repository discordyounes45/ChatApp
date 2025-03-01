// Typing indicator functionality
let typingTimeout = null;
const TYPING_TIMEOUT_MS = 3000; // Stop showing typing indicator after 3 seconds of inactivity

// Track typing state
let isTyping = false;

// Initialize typing functionality
function initializeTypingIndicator() {
    setupTypingEventListeners();
    setupTypingSubscription();
}

// Set up event listeners for detecting typing
function setupTypingEventListeners() {
    // Ensure messageInput exists before adding event listeners
    if (!messageInput) {
        console.error('Message input element not found');
        return;
    }
    
    messageInput.addEventListener('input', () => {
        if (!selectedUserId) return;
        
        // Send typing status when user starts typing
        if (!isTyping) {
            updateTypingStatus(true);
        }
        
        // Clear previous timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Set new timeout to stop typing indicator after inactivity
        typingTimeout = setTimeout(() => {
            updateTypingStatus(false);
        }, TYPING_TIMEOUT_MS);
    });
    
    // Store reference to original sendMessage function
    if (typeof window.originalSendMessage === 'undefined') {
        window.originalSendMessage = window.sendMessage;
        
        // Redefine sendMessage to include typing status update
        window.sendMessage = function() {
            window.originalSendMessage();
            updateTypingStatus(false);
        };
    }
}

// Update typing status in database
async function updateTypingStatus(typing) {
    if (isTyping === typing || !currentUser || !selectedUserId) return;
    
    isTyping = typing;
    
    try {
        await supabase
            .from('typing_status')
            .upsert(
                {
                    user_id: currentUser.id,
                    typing_to: selectedUserId,
                    is_typing: typing,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'user_id, typing_to' }
            );
    } catch (error) {
        console.error('Error updating typing status:', error);
    }
}

// Listen for typing status changes from other users
function setupTypingSubscription() {
    if (!currentUser) {
        console.error('Cannot set up typing subscription: User not logged in');
        return;
    }
    
    supabase
        .channel('typing-channel')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'typing_status',
            filter: `typing_to=eq.${currentUser.id}`
        }, payload => {
            const data = payload.new;
            if (selectedUserId === data.user_id) {
                updateTypingIndicator(data.is_typing);
            }
        })
        .subscribe();
}

// Show or hide typing indicator in UI
function updateTypingIndicator(isTyping) {
    let typingIndicator = document.getElementById('typing-indicator');
    
    if (isTyping) {
        // Create typing indicator if it doesn't exist
        if (!typingIndicator) {
            // Find sender in usersList
            const sender = usersList.find(u => u.id === selectedUserId);
            if (!sender) return; // If sender not found, don't proceed
            
            typingIndicator = document.createElement('div');
            typingIndicator.id = 'typing-indicator';
            typingIndicator.className = 'typing-indicator message message-incoming';
            typingIndicator.innerHTML = `
                <div class="message-content">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                <div class="message-meta">
                    <img src="${getAvatarUrl(sender.avatar)}" alt="${sender.username}">
                    <span>${sender.username} is typing...</span>
                </div>
            `;
            
            // Make sure messagesContainer exists
            if (messagesContainer) {
                messagesContainer.appendChild(typingIndicator);
                scrollToBottom();
            }
        }
    } else {
        // Remove typing indicator if it exists
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
}

// Clean up when switching chat partners
function cleanupTypingStatus() {
    if (isTyping) {
        updateTypingStatus(false);
    }
    
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Add typing indicator styles
function addTypingStyles() {
    // Check if styles already exist to prevent duplicates
    if (document.getElementById('typing-indicator-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'typing-indicator-styles';
    styleElement.textContent = `
        .typing-indicator .message-content {
            padding: 6px 12px;
        }
        
        .typing-dots {
            display: flex;
            align-items: center;
            height: 20px;
        }
        
        .typing-dots span {
            display: inline-block;
            width: 8px;
            height: 8px;
            margin-right: 4px;
            background-color: var(--light-text);
            border-radius: 50%;
            opacity: 0.6;
            animation: typingAnimation 1.4s infinite ease-in-out;
        }
        
        .typing-dots span:nth-child(1) {
            animation-delay: 0s;
        }
        
        .typing-dots span:nth-child(2) {
            animation-delay: 0.2s;
        }
        
        .typing-dots span:nth-child(3) {
            animation-delay: 0.4s;
            margin-right: 0;
        }
        
        @keyframes typingAnimation {
            0%, 100% {
                transform: translateY(0);
            }
            
            50% {
                transform: translateY(-5px);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(styleElement);
}

// Safely override initializeChatSession function
document.addEventListener('DOMContentLoaded', () => {
    // Preserve original function references
    if (typeof window.originalInitializeChatSession === 'undefined' && typeof window.initializeChatSession === 'function') {
        window.originalInitializeChatSession = window.initializeChatSession;
        
        // Override with our version
        window.initializeChatSession = function(userId) {
            cleanupTypingStatus();
            window.originalInitializeChatSession(userId);
        };
    }

    // Similarly override showChatScreen
    if (typeof window.originalShowChatScreen === 'undefined' && typeof window.showChatScreen === 'function') {
        window.originalShowChatScreen = window.showChatScreen;
        
        // Override with our version
        window.showChatScreen = function() {
            window.originalShowChatScreen();
            addTypingStyles();
            initializeTypingIndicator();
        };
    }
});