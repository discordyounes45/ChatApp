let mediaRecorder;
let audioChunks = [];

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            await uploadAudio(audioBlob);
            audioChunks = [];
        };

        mediaRecorder.start();
        document.getElementById('startRecordingBtn').style.display = 'none';
        document.getElementById('stopRecordingBtn').style.display = 'inline-block';
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Microphone access required for audio messages');
    }
}

function stopRecording() {
    if (mediaRecorder?.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('startRecordingBtn').style.display = 'inline-block';
        document.getElementById('stopRecordingBtn').style.display = 'none';
    }
}

async function uploadAudio(audioBlob) {
    try {
        const fileName = `audio_${Date.now()}.wav`;
        const { data, error } = await supabase.storage
            .from('audio-messages')
            .upload(fileName, audioBlob);

        if (error) throw error;

        const { data: { publicUrl } } = await supabase.storage
            .from('audio-messages')
            .getPublicUrl(data.path);

        sendAudioMessage(publicUrl);
    } catch (error) {
        console.error('Audio upload failed:', error);
        alert('Failed to send audio message');
    }
}

async function sendAudioMessage(fileUrl) {
    if (!selectedUserId) {
        alert('Select a user first');
        return;
    }

    try {
        const tempMessage = {
            id: 'temp-' + Date.now(),
            sender_id: currentUser.id,
            receiver_id: selectedUserId,
            file_url: fileUrl,
            created_at: new Date().toISOString()
        };

        appendAudioMessage(tempMessage);

        const { data, error } = await supabase
            .from('audio_messages')
            .insert([{
                sender_id: currentUser.id,
                receiver_id: selectedUserId,
                file_url: fileUrl
            }])
            .select();

        if (error) {
            document.getElementById(`audio-message-${tempMessage.id}`)?.remove();
            throw error;
        }

        // Replace temporary message with real one
        const realMessage = data[0];
        document.getElementById(`audio-message-${tempMessage.id}`).id = `audio-message-${realMessage.id}`;
    } catch (error) {
        console.error('Audio message send failed:', error);
    }
}

function appendAudioMessage(message) {
    if (document.getElementById(`audio-message-${message.id}`)) return;

    const isOutgoing = message.sender_id === currentUser.id;
    const sender = isOutgoing ? currentUser : usersList.find(u => u.id === message.sender_id);
    const senderName = sender?.username || 'Unknown';

    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOutgoing ? 'message-outgoing' : 'message-incoming'}`;
    messageElement.id = `audio-message-${message.id}`;

    messageElement.innerHTML = `
        <div class="message-content">
            <audio controls style="min-width: 200px;">
                <source src="${message.file_url}" type="audio/wav">
                Browser does not support audio playback
            </audio>
        </div>
        <div class="message-meta">
            ${!isOutgoing ? `<img src="${getAvatarUrl(sender?.avatar)}" alt="${senderName}">` : ''}
            ${!isOutgoing ? `<span>${senderName}</span>` : ''}
            <span>${new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `;

    messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

document.getElementById('startRecordingBtn').addEventListener('click', startRecording);
document.getElementById('stopRecordingBtn').addEventListener('click', stopRecording);

// Helper functions
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getAvatarUrl(seed) {
    return `https://api.dicebear.com/6.x/initials/svg?seed=${seed}`;
}