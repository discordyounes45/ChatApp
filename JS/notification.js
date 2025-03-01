// Notification Functionality

// Check for Notification API support
if ('Notification' in window) {
    // Request permission to show notifications
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            console.log('Notification permission granted.');
        } else {
            console.log('Notification permission denied.');
        }
    });
}

// Function to show a notification
function showNotification(title, options) {
    if (Notification.permission === 'granted') {
        new Notification(title, options);
    }
}

// Listen for new messages and show notifications
function setupMessageNotification() {
    supabase
        .channel('messages-channel')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, payload => {
            const message = payload.new;
            
            if (message.receiver_id === currentUser.id) {
                const sender = usersList.find(u => u.id === message.sender_id);
                const senderName = sender ? sender.username : 'Unknown';
                const options = {
                    body: message.content,
                    icon: getAvatarUrl(sender.avatar),
                    tag: message.id,
                    renotify: true
                };

                showNotification(`New message from ${senderName}`, options);
            }
        })
        .subscribe();
}

// Initialize notifications when user logs in
document.addEventListener('DOMContentLoaded', () => {
    const originalShowChatScreen = showChatScreen;
    showChatScreen = function() {
        originalShowChatScreen();
        setupMessageNotification();
    };
});