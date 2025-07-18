// This script runs in the page context
(function() {
    let windowId = null;
    
    // Wait for windowId from content script
    window.addEventListener('message', function initListener(event) {
        if (event.data && event.data.type === 'posta-init' && event.data.windowId) {
            windowId = event.data.windowId;
            window.windowId = windowId;
            window.removeEventListener('message', initListener);
            
            // Now initialize the agent
            initializeAgent();
        }
    });
    
    function initializeAgent() {
        console.debug(`agent injected in ${windowId} at ${location.href}`);

        const $$$_addEventListener = window.addEventListener;
        const $$$listeners = new Set();
        const uuid = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        const frameTree = (frameId = "root", refWindow = window, path = []) => {
            if (frameId !== "root") {
                refWindow.postMessage({
                    isPostaMessage: true,
                    topic: "account-for-path",
                    path,
                    topWindowId: windowId
                }, "*")
            }
            let childWindowsIds = Object.keys(refWindow.frames).slice(0, Object.keys(refWindow.frames).findIndex((v) => v === "window")).map(Number)
            childWindowsIds.forEach(id => frameTree(id, refWindow[id], path.concat(id)))
        }

        const sendToBackgroundPage = (body) => {
            if (!body) return console.trace("no sending without body")
            try {
                let event = new CustomEvent("posta-telemetry", { detail: body });
                window.dispatchEvent(event);
            } catch (e) {
                // Ignore errors if extension context is invalidated
                console.debug("Cannot send to background page:", e);
            }
        }

        window.addEventListener("posta-relay", event=>{
            let {
                data,
                dispatchTo=[]
            } = event.detail
            let ref = window.top;
            while (dispatchTo.length) {
                let frameIndex = dispatchTo.shift();
                ref = ref.frames[frameIndex];
            }
            ref.postMessage(data,"*");
        })

        const sendWindowTelemetry = () => {
            sendToBackgroundPage({
                topic: "listeners",
                windowId,
                listeners: Array.from($$$listeners).map(i => i.toString())
            })
        }

        window.addEventListener = function (event) {
            if (!event || $$$listeners.has(event)) return $$$_addEventListener.apply(this, arguments);
            if (event === "message") {
                $$$listeners.add(arguments[1].toString());
                sendWindowTelemetry();
            }
            return $$$_addEventListener.apply(this, arguments);
        }

        let interval = setInterval(() => {
            sendWindowTelemetry();
            frameTree();
            try {
                sendToBackgroundPage({
                    topic: "account-for-path",
                    path: [],
                })
            } catch (error) {

            }
        }, 600);

        setInterval(() => {
            sendWindowTelemetry();
            try {
                let frames = document.querySelectorAll("frame,iframe");
                Array.from(frames).forEach(frame => {
                    let src = frame.src || frame.getAttribute("src");
                    //if (!src) frame.src = location.href+"?isPostaInnerFrame";//TODO:take care of already existed query strings
                })
            } catch (error) {

            }
        }, 1200)

        let postMessageOriginal = window.postMessage;
        window.postMessage = function (...args) {
            let messageId = uuid();
            let data = args[0];
            let notifyTelemetry = () => sendToBackgroundPage({
                topic: "account-for-message",
                messageId
            })
            notifyTelemetry();
            return postMessageOriginal.apply(this, args);
        }

        const sendReceivedMessage = ({ data, origin, source }) => {
            if (!data) return
            let messageId = uuid();
            let telemetryBody = {
                messageId,
                topic: "received-message",
                data,
                origin
            };
            sendToBackgroundPage(telemetryBody);
        }

        const processReceivedMessage = (event) => {
            const { data } = event;
            if (data && typeof (data) === "object" && data.isPostaMessage) {
                processPostaSpecificMessage(event);
            } else {
                sendReceivedMessage(event);
            }
        }

        const processPostaSpecificMessage = (event) => {
            const { data } = event;
            const { topic } = data;
            switch (topic) {
                case "account-for-path":
                    const { path, topWindowId } = data;
                    sendToBackgroundPage({
                        topic: "account-for-path",
                        path: [0].concat(path),
                    })
                    break;
                default:
                    console.log(`TODO: process ${topic}`)
                    break;
            }
        }

        window.addEventListener("message", processReceivedMessage)
    }
})();