// MM2 Trade Relay Server
// Bridges Side 1 (sender) -> Side 2 (receiver) Roblox bot communication.
//
// Endpoints:
//   POST /announce  body: { placeId, jobId, senderUsername }
//                  -> Side 1 calls this when it executes the script and is ready to trade.
//   POST /done     -> Side 1 OR Side 2 calls this when their trade cycle finished.
//   POST /leave    -> Side 1 calls this on PlayerRemoving (or before teleporting away) to clear the job.
//   POST /claim    body: { jobId } -> Side 2 calls this when it picks up a job to prevent other bots from teleporting.
//   GET  /pending  -> Side 2 polls this every few seconds for new jobs.
//                     Auto-expires stale jobs (older than JOB_TTL_MS) before responding.
//                     Only returns UNCLAIMED jobs (claimed jobs are hidden from pollers).
//   GET  /health   -> Uptime check + stats.
//   GET  /test     -> Echo endpoint for verifying Roblox HTTP works.
//   GET  /         -> Human-readable status page.

const express = require('express');
const app = express();

app.use(express.json({ limit: '64kb' }));

// --- Config ---
const JOB_TTL_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const CLAIMED_JOB_TTL_MS = 60 * 1000;  // claimed jobs auto-clear after 60s even if /done never fires

// --- State ---
let currentJob = null;     // { id, placeId, jobId, senderUsername, timestamp, claimed, claimedAt }
let jobCounter = 0;
let stats = { announced: 0, done: 0, leave: 0, expired: 0, polled: 0, claimed: 0 };

// --- Helpers ---
function clearJob(reason) {
    if (!currentJob) return;
    if (reason === 'done') stats.done += 1;
    else if (reason === 'leave') stats.leave += 1;
    else if (reason === 'expired') stats.expired += 1;
    console.log(`[CLEAR] job #${currentJob.id} from ${currentJob.senderUsername} — reason: ${reason} (age: ${Math.floor((Date.now() - currentJob.timestamp) / 1000)}s)`);
    currentJob = null;
}

function isJobStale(job) {
    if (!job) return false;
    if ((Date.now() - job.timestamp) > JOB_TTL_MS) return true;
    if (job.claimed && (Date.now() - job.claimedAt) > CLAIMED_JOB_TTL_MS) return true;
    return false;
}

setInterval(() => {
    if (currentJob && isJobStale(currentJob)) {
        clearJob('expired');
    }
}, CLEANUP_INTERVAL_MS);

// --- Routes ---

app.post('/announce', (req, res) => {
    const { placeId, jobId, senderUsername } = req.body || {};
    if (!placeId || !jobId || !senderUsername) {
        return res.status(400).json({ ok: false, error: 'Missing placeId/jobId/senderUsername' });
    }
    if (currentJob) {
        clearJob('replaced');
    }
    jobCounter += 1;
    currentJob = {
        id: jobCounter,
        placeId: String(placeId),
        jobId: String(jobId),
        senderUsername: String(senderUsername),
        timestamp: Date.now(),
        claimed: false,
        claimedAt: null
    };
    stats.announced += 1;
    console.log(`[ANNOUNCE] #${jobCounter} from ${senderUsername} -> place ${placeId} job ${jobId}`);
    res.json({ ok: true, jobId: jobCounter });
});

app.post('/done', (req, res) => {
    clearJob('done');
    res.json({ ok: true });
});

app.post('/leave', (req, res) => {
    clearJob('leave');
    res.json({ ok: true });
});

app.post('/claim', (req, res) => {
    const { jobId } = req.body || {};
    if (!currentJob) {
        return res.json({ ok: false, error: 'no current job' });
    }
    if (String(currentJob.id) !== String(jobId)) {
        return res.json({ ok: false, error: 'jobId mismatch' });
    }
    if (currentJob.claimed) {
        return res.json({ ok: false, error: 'already claimed' });
    }
    currentJob.claimed = true;
    currentJob.claimedAt = Date.now();
    stats.claimed += 1;
    console.log(`[CLAIM] job #${currentJob.id} from ${currentJob.senderUsername} claimed`);
    res.json({ ok: true });
});

app.get('/pending', (req, res) => {
    stats.polled += 1;
    if (currentJob && isJobStale(currentJob)) {
        clearJob('expired');
    }
    if (!currentJob) {
        return res.json({ job: null });
    }
    if (currentJob.claimed) {
        return res.json({ job: null });
    }
    res.json({
        job: {
            id: currentJob.id,
            placeId: currentJob.placeId,
            jobId: currentJob.jobId,
            senderUsername: currentJob.senderUsername,
            timestamp: currentJob.timestamp,
            ageSeconds: Math.floor((Date.now() - currentJob.timestamp) / 1000)
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        stats,
        currentJob: currentJob ? {
            id: currentJob.id,
            sender: currentJob.senderUsername,
            ageSeconds: Math.floor((Date.now() - currentJob.timestamp) / 1000),
            claimed: currentJob.claimed
        } : null
    });
});

app.get('/test', (req, res) => {
    res.json({ ok: true, message: 'hello from relay', timestamp: Date.now() });
});

app.get('/', (req, res) => {
    res.type('text/plain').send(
        `MM2 Trade Relay\n` +
        `===============\n` +
        `Uptime: ${Math.floor(process.uptime())}s\n` +
        `Stats:  announced=${stats.announced} done=${stats.done} leave=${stats.leave} expired=${stats.expired} claimed=${stats.claimed} polled=${stats.polled}\n` +
        `Current job: ${currentJob ? `#${currentJob.id} from ${currentJob.senderUsername} (${Math.floor((Date.now() - currentJob.timestamp) / 1000)}s old${currentJob.claimed ? ', CLAIMED' : ''})` : '(none)'}\n` +
        `Job TTL: ${JOB_TTL_MS / 1000}s (claimed: ${CLAIMED_JOB_TTL_MS / 1000}s)\n\n` +
        `Endpoints:\n` +
        `  POST /announce   { placeId, jobId, senderUsername }\n` +
        `  POST /done       (Side 1 OR Side 2 trade cycle finished)\n` +
        `  POST /leave      (Side 1 left the game)\n` +
        `  POST /claim      { jobId }  (Side 2 picked up the job — hides it from other pollers)\n` +
        `  GET  /pending    -> { job: {...} | null }\n` +
        `  GET  /health\n` +
        `  GET  /test\n`
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MM2 Trade Relay listening on port ${PORT} (job TTL: ${JOB_TTL_MS / 1000}s, claimed TTL: ${CLAIMED_JOB_TTL_MS / 1000}s)`);
});
