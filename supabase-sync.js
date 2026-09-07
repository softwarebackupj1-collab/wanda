// supabase-sync.js

// Function to pull data from Supabase
window.pullFromSupabase = async () => {
    if (!window.supabaseClient) return;
    
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    if (!sessionData || !sessionData.session) return;
    
    const email = sessionData.session.user.email;

    try {
        const { data, error } = await window.supabaseClient
            .from('user_data')
            .select('data')
            .eq('email', email)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows returned, this is a new user
                console.log("No Supabase backup found for this user. Pushing local data if any.");
                window.syncToSupabase();
                return;
            }
            throw error;
        }

        if (data && data.data) {
            const remoteData = data.data;
            
            // Check if we have unsynced local data
            const localItems = localStorage.getItem('inventory_items');
            const localTx = localStorage.getItem('inventory_transactions');
            const hasLocalData = (localItems && JSON.parse(localItems).length > 0) || 
                                 (localTx && JSON.parse(localTx).length > 0);
            
            // Check if we are already synced with this version (we can use updated_at, but simpler is comparing size)
            // For simplicity, if we pulled, we just overwrite, UNLESS user wants to push.
            // Since Supabase is real-time and we just connected, let's prompt if local data exists but hasn't been synced.
            
            const lastSync = localStorage.getItem('supabase_last_sync');
            if (hasLocalData && !lastSync) {
                const pull = confirm("Supabase Backup Found!\n\nThis device also has some local data.\n\nClick 'OK' to DOWNLOAD from Supabase (this will replace your local data).\n\nClick 'Cancel' to UPLOAD your local data (this will replace the Supabase backup).");
                if (!pull) {
                    console.log("User chose to push local data to Supabase.");
                    window.syncToSupabase();
                    return;
                }
            }

            console.log("Backup found! Downloading data...");
            
            // Overwrite local storage
            for (const key in remoteData) {
                localStorage.setItem(key, remoteData[key]);
            }
            localStorage.setItem('supabase_last_sync', Date.now().toString());

            alert("Data successfully synced from Supabase! The page will now reload.");
            location.reload();
        }
    } catch (error) {
        console.error("Failed to pull from Supabase:", error);
        alert("PULL ERROR: " + error.message);
    }
};

// Function to push data to Supabase
window.syncToSupabase = async () => {
    if (!window.supabaseClient) return;
    
    const { data: sessionData } = await window.supabaseClient.auth.getSession();
    if (!sessionData || !sessionData.session) return;
    
    const email = sessionData.session.user.email;

    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('inventory_') || key.startsWith('sm_')) {
            data[key] = localStorage.getItem(key);
        }
    }

    try {
        const { error } = await window.supabaseClient
            .from('user_data')
            .upsert({ email: email, data: data, updated_at: new Date().toISOString() }, { onConflict: 'email' });

        if (error) throw error;
        
        localStorage.setItem('supabase_last_sync', Date.now().toString());
        console.log("Successfully synced to Supabase!");
    } catch (error) {
        console.error("Failed to sync to Supabase:", error);
        alert("SYNC ERROR: " + error.message);
    }
};
