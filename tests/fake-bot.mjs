// Fake bot child for the host smoke test: prints its env, then idles.
// (The real bot is bot/index.js; this stub proves the host spawns a child
// with the right per-number env without needing a WhatsApp connection.)
console.log('FAKE BOT STARTED owner=' + process.env.DZM_OWNER_NUMBER);
console.log('FAKE BOT session=' + process.env.DZM_SESSION_DIR);
console.log('FAKE BOT data=' + process.env.DZM_DATA_DIR);
setInterval(() => {}, 10000);
