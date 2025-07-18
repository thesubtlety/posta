const uuid = require('uuid').v4;

// Early exit if extension context is already invalid
try {
    if (!chrome.runtime || !chrome.runtime.id) {
        console.debug("Chrome extension context not available, agent.js exiting");
        return;
    }
} catch (e) {
    console.debug("Chrome extension context check failed, agent.js exiting");
    return;
}

// Only proceed if chrome runtime is available
if (chrome.runtime && chrome.runtime.id) {
    // Generate a unique window ID
    let windowId = uuid();
    window.windowId = windowId;

    // Inject the agent script as an external file
    let script = document.createElement('script');
    script.src = chrome.runtime.getURL('agent-injected.js');
    script.dataset.windowId = windowId;
    document.documentElement.prepend(script);

    // After script loads, send the windowId
    script.onload = () => {
        try {
            window.postMessage({ type: 'posta-init', windowId: windowId }, '*');
        } catch (e) {
            console.debug("Cannot post message:", e);
        }
    };
}

// Check if chrome.runtime is still available
if (chrome.runtime && chrome.runtime.id) {
    chrome.runtime.onMessage.addListener((message, sender)=>{
        try {
            let event = new CustomEvent("posta-relay", { detail: message });
            window.dispatchEvent(event);
        } catch (e) {
            // Extension context invalidated or window context changed
            console.debug("Cannot dispatch event:", e);
        }
    })

    window.addEventListener("posta-telemetry", event => {
        // Check again before sending message
        if (chrome.runtime && chrome.runtime.id) {
            try {
                chrome.runtime.sendMessage(event.detail);
            } catch (e) {
                // Extension context invalidated, ignore
                console.debug("Extension context invalidated, cannot send message");
            }
        }
    });
} else {
    console.debug("Chrome runtime not available, content script not initializing");
}