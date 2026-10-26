// MM2 Trade Relay Server
// Bridges Side 1 (sender) -> Side 2 (receiver) Roblox bot communication.
//
// Endpoints:
//   POST /announce  body: { placeId, jobId, senderUsername }
//                  -> Side 1 calls this when it executes the script and is ready to trade.
//   POST /done     -> Side 1 calls this when its trade cycle finished and it's ready for next.
//   GET  /pending  -> Side 2 polls this every few seconds for new jobs.
//   GET  /health   -> Uptime check (also keeps free-tier Render instance warm).
//   GET  /         -> Human-readable status page.

const express = require('express');
const app = express();

app.use(express.json({ limit: '64kb' }));

// In-memory state (single-instance free tier is fine for this use case).
let currentJob = null;     // { id, placeId, jobId, senderUsername, timestamp }
let jobCounter = 0;
let stats = { announced: 0, done: 0, polled: 0 };

// --- Routes ---

app.post('/announce', (req, res) => {
    const { placeId, jobId, senderUsername } = req.body || {};
    if (!placeId || !jobId || !senderUsername) {
        return res.status(400).json({ ok: false, error: 'Missing placeId/jobId/senderUsername' });
    }
    jobCounter += 1;
    currentJob = {
        id: jobCounter,
        placeId: String(placeId),
        jobId: String(jobId),
        senderUsername: String(senderUsername),
        timestamp: Date.now()
    };
    stats.announced += 1;
    console.log(`[ANNOUNCE] #${jobCounter} from ${senderUsername} -> place ${placeId} job ${jobId}`);
    res.json({ ok: true, jobId: jobCounter });
});

app.post('/done', (req, res) => {
    console.log(`[DONE] Clearing job ${currentJob ? '#' + currentJob.id : '(none)'}`);
    currentJob = null;
    stats.done += 1;
    res.json({ ok: true });
});

app.get('/pending', (req, res) => {
    stats.polled += 1;
    if (!currentJob) {
        return res.json({ job: null });
    }
    res.json({
        job: {
            id: currentJob.id,
            placeId: currentJob.placeId,
            jobId: currentJob.jobId,
            senderUsername: currentJob.senderUsername,
            timestamp: currentJob.timestamp
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime(), stats });
});

app.get('/test', (req, res) => {
    // Simple echo endpoint for testing Roblox executor HTTP from inside the game.
    // Side 2 can hit this to verify its HTTP is reaching the relay.
    res.json({ ok: true, message: 'hello from relay', timestamp: Date.now() });
});

app.get('/', (req, res) => {
    res.type('text/plain').send(
        `MM2 Trade Relay\n` +
        `===============\n` +
        `Uptime: ${Math.floor(process.uptime())}s\n` +
        `Stats:  announced=${stats.announced} done=${stats.done} polled=${stats.polled}\n` +
        `Current job: ${currentJob ? `#${currentJob.id} from ${currentJob.senderUsername}` : '(none)'}\n\n` +
        `Endpoints:\n` +
        `  POST /announce   { placeId, jobId, senderUsername }\n` +
        `  POST /done\n` +
        `  GET  /pending    -> { job: {...} | null }\n` +
        `  GET  /health\n`
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MM2 Trade Relay listening on port ${PORT}`);
});
