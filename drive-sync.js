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
    let fileId = localStorage.getItem('drive_backup_file_id');
    
    try {
        // Show a brief sync indicator if desired, or just do it silently
        console.log("Syncing to Google Drive...");
        
        if (!fileId) {
            // Double check if file exists before creating a new one
            fileId = await searchFile('stockmaster_backup.json', token);
            if (fileId) {
                localStorage.setItem('drive_backup_file_id', fileId);
            }
        }
        
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
            sessionStorage.removeItem('googleDriveAccessToken');
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
            sessionStorage.removeItem('googleDriveAccessToken');
        }
        throw new Error("Update failed: " + res.status);
    }
    return await res.json();
}

window.pullFromDrive = async () => {
    if (!window.googleDriveAccessToken) {
        console.log("No Google Drive access token found. Cannot pull at this time.");
        return;
    }

    const token = window.googleDriveAccessToken;
    console.log("Checking Google Drive for existing backup...");

    try {
        const fileId = await searchFile('stockmaster_backup.json', token);
        
        if (fileId) {
            const localFileId = localStorage.getItem('drive_backup_file_id');
            
            // Check if local storage has actual data
            const localItems = localStorage.getItem('inventory_items');
            const localTx = localStorage.getItem('inventory_transactions');
            const hasLocalData = (localItems && JSON.parse(localItems).length > 0) || 
                                 (localTx && JSON.parse(localTx).length > 0);

            if (hasLocalData) {
                if (localFileId === fileId) {
                    // This device is already linked to this backup file.
                    // They just reconnected their drive. We should PUSH any offline changes they made.
                    console.log("Device already linked. Pushing offline changes to Google Drive...");
                    window.syncToDrive();
                    alert("Drive reconnected! Your offline changes are being synced to Google Drive.");
                    return;
                } else {
                    // This is either a new device that has some unsynced local data, or a different Google account.
                    const pull = confirm("Google Drive Backup Found!\n\nThis device also has some local data.\n\nClick 'OK' to DOWNLOAD from Google Drive (this will replace your local data).\n\nClick 'Cancel' to UPLOAD your local data (this will replace the Google Drive backup).");
                    if (!pull) {
                        console.log("User chose to push local data to Drive.");
                        window.syncToDrive();
                        return;
                    }
                }
            }

            console.log("Backup found! Downloading data...");
            localStorage.setItem('drive_backup_file_id', fileId);
            const content = await downloadFile(fileId, token);
            
            if (content) {
                if (content.items) localStorage.setItem('inventory_items', JSON.stringify(content.items));
                if (content.transactions) localStorage.setItem('inventory_transactions', JSON.stringify(content.transactions));
                if (content.persons) localStorage.setItem('inventory_persons', JSON.stringify(content.persons));
                
                console.log("Data successfully restored from Google Drive.");
                alert("Data successfully synced from Google Drive!");
                // Reload the page to reflect the synced data
                window.location.reload();
            }
        } else {
            console.log("No existing backup found. Starting initial sync...");
            window.syncToDrive();
        }
    } catch (error) {
        console.error("Failed to pull from Google Drive:", error);
    }
};

async function searchFile(filename, token) {
    const query = encodeURIComponent(`name='${filename}' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });

    if (!res.ok) {
        if (res.status === 401) {
            window.googleDriveAccessToken = null;
            sessionStorage.removeItem('googleDriveAccessToken');
        }
        throw new Error("Search failed: " + res.status);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
        const latestFileId = data.files[0].id;
        
        // Delete older duplicates to keep only the latest backup file
        if (data.files.length > 1) {
            console.log(`Found ${data.files.length} backup files. Keeping the latest one and deleting older duplicates...`);
            for (let i = 1; i < data.files.length; i++) {
                try {
                    await deleteFile(data.files[i].id, token);
                } catch(e) {
                    console.error("Failed to delete older duplicate file:", e);
                }
            }
        }
        
        return latestFileId;
    }
    return null;
}

async function downloadFile(fileId, token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });

    if (!res.ok) {
        throw new Error("Download failed: " + res.status);
    }

    return await res.json();
}

async function deleteFile(fileId, token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });
    if (!res.ok) {
        throw new Error("Delete failed: " + res.status);
    }
}
