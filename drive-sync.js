// drive-sync.js

window.syncToDrive = async () => {
    if (!window.googleDriveAccessToken) {
        console.log("No Google Drive access token found. Cannot sync at this time.");
        return;
    }

    const token = window.googleDriveAccessToken;
    
    // Gather all data from localStorage
    const data = {
        items: localStorage.getItem('inventory_items') ? JSON.parse(localStorage.getItem('inventory_items')) : [],
        transactions: localStorage.getItem('inventory_transactions') ? JSON.parse(localStorage.getItem('inventory_transactions')) : [],
        persons: localStorage.getItem('inventory_persons') ? JSON.parse(localStorage.getItem('inventory_persons')) : []
    };
    
    const fileContent = JSON.stringify(data, null, 2);
    const fileId = localStorage.getItem('drive_backup_file_id');
    
    try {
        // Show a brief sync indicator if desired, or just do it silently
        console.log("Syncing to Google Drive...");
        
        if (fileId) {
            // Update existing file
            await updateFile(fileId, fileContent, token);
        } else {
            // Create new file
            const newFileId = await createFile('stockmaster_backup.json', fileContent, token);
            if (newFileId) {
                localStorage.setItem('drive_backup_file_id', newFileId);
            }
        }
        console.log("Successfully synced to Google Drive!");
    } catch (error) {
        console.error("Failed to sync to Google Drive:", error);
        // If file not found (404), it might have been deleted, clear id and try again
        if (error.message.includes("404")) {
            localStorage.removeItem('drive_backup_file_id');
            // Try one more time to create it
            window.syncToDrive();
        }
    }
};

async function createFile(filename, content, token) {
    const metadata = {
        name: filename,
        mimeType: 'application/json'
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: form
    });
    
    if (!res.ok) {
        if (res.status === 401) {
            window.googleDriveAccessToken = null; // Token expired
        }
        throw new Error("Upload failed: " + res.status);
    }
    const data = await res.json();
    return data.id;
}

async function updateFile(fileId, content, token) {
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: content
    });
    
    if (!res.ok) {
        if (res.status === 401) {
            window.googleDriveAccessToken = null; // Token expired
        }
        throw new Error("Update failed: " + res.status);
    }
    return await res.json();
}
