const crypto = require('crypto');
const whatsappService = require('./whatsappService');
const locationFormatter = require('../utils/locationFormatter');

/**
 * Base QueueService Abstract Class
 * To allow switching to Redis/BullMQ in production easily.
 */
class QueueService {
    async enqueue(job) { throw new Error('Method enqueue() not implemented'); }
    async dequeue() { throw new Error('Method dequeue() not implemented'); }
    async acknowledge(jobId) { throw new Error('Method acknowledge() not implemented'); }
    async retry(jobId, backoffMs) { throw new Error('Method retry() not implemented'); }
    async fail(jobId, reason) { throw new Error('Method fail() not implemented'); }
    async stats() { throw new Error('Method stats() not implemented'); }
}

/**
 * Production-ready In-Memory Queue Service Implementation
 */
class MemoryQueue extends QueueService {
    constructor() {
        super();
        this.queue = [];
        this.activeJobs = new Map(); // jobId -> job
        this.idempotencyCache = new Set(); // recent dispatchIds (last 5 minutes)
        
        // Operational stats
        this.statsCompleted = 0;
        this.statsFailed = 0;
        this.statsDeadLetter = 0;

        // Start processing worker loop
        setInterval(() => this.processNextJob(), 1000);
    }

    isDuplicate(dispatchId) {
        if (this.idempotencyCache.has(dispatchId)) {
            return true;
        }
        // Cache for 5 minutes
        this.idempotencyCache.add(dispatchId);
        setTimeout(() => {
            this.idempotencyCache.delete(dispatchId);
        }, 5 * 60 * 1000);
        return false;
    }

    async enqueue(jobData) {
        const jobId = jobData.dispatchId;

        // Idempotency check
        if (this.isDuplicate(jobId)) {
            console.warn(JSON.stringify({
                level: 'warn',
                message: 'Duplicate job dispatch ignored.',
                dispatchId: jobId,
                timestamp: new Date().toISOString()
            }));
            return { success: true, duplicate: true, status: 'ignored' };
        }

        const job = {
            jobId,
            dispatchId: jobId,
            latitude: jobData.latitude,
            longitude: jobData.longitude,
            accuracy: jobData.accuracy,
            timestamp: jobData.timestamp,
            contacts: jobData.contacts || [],
            retryCount: 0,
            status: 'pending',
            queuedAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            error: null,
            workerId: 'whatsapp-service-render'
        };

        this.queue.push(job);

        console.log(JSON.stringify({
            level: 'info',
            message: 'Job successfully enqueued',
            dispatchId: jobId,
            pendingCount: this.queue.length,
            timestamp: new Date().toISOString()
        }));

        return { success: true, duplicate: false, status: 'queued' };
    }

    async dequeue() {
        if (this.queue.length === 0) return null;
        return this.queue.shift();
    }

    async acknowledge(jobId) {
        this.activeJobs.delete(jobId);
        this.statsCompleted++;
        console.log(JSON.stringify({
            level: 'info',
            message: 'Job processed and completed successfully',
            dispatchId: jobId,
            timestamp: new Date().toISOString()
        }));
    }

    async retry(jobId, backoffMs) {
        const job = this.activeJobs.get(jobId);
        if (!job) return;

        job.status = 'pending';
        job.retryCount++;
        this.activeJobs.delete(jobId);

        console.log(JSON.stringify({
            level: 'info',
            message: `Scheduling exponential backoff retry #${job.retryCount} in ${backoffMs / 1000}s`,
            dispatchId: jobId,
            timestamp: new Date().toISOString()
        }));

        setTimeout(() => {
            this.queue.push(job);
        }, backoffMs);
    }

    async fail(jobId, reason) {
        const job = this.activeJobs.get(jobId);
        if (!job) return;

        job.status = 'failed';
        job.error = reason;
        job.completedAt = new Date().toISOString();
        this.activeJobs.delete(jobId);
        
        this.statsFailed++;
        this.statsDeadLetter++;

        console.error(JSON.stringify({
            level: 'error',
            message: 'Job processing permanently failed and moved to Dead Letter Queue (DLQ)',
            dispatchId: jobId,
            reason,
            timestamp: new Date().toISOString()
        }));

        // Send callback status update to gateway
        await this.sendCallback(job);
    }

    async stats() {
        return {
            pending: this.queue.length,
            processing: this.activeJobs.size,
            completedToday: this.statsCompleted,
            failedToday: this.statsFailed,
            deadLetter: this.statsDeadLetter
        };
    }

    async processNextJob() {
        if (this.queue.length === 0 || this.activeJobs.size > 0) {
            return;
        }

        const job = await this.dequeue();
        if (!job) return;

        this.activeJobs.set(job.jobId, job);
        job.status = 'processing';
        job.startedAt = new Date().toISOString();

        console.log(JSON.stringify({
            level: 'info',
            message: 'Starting job execution processing',
            dispatchId: job.jobId,
            timestamp: new Date().toISOString()
        }));

        try {
            if (!whatsappService.isReady()) {
                throw new Error('WhatsApp service not initialized or authenticated.');
            }

            const sendTimeout = parseInt(process.env.WA_SEND_TIMEOUT_MS || process.env.OPENWA_SEND_TIMEOUT_MS || '10000', 10);
            const concurrentLimit = parseInt(process.env.WA_MAX_CONCURRENT_SENDS || process.env.OPENWA_MAX_CONCURRENT_SENDS || '4', 10);
            const results = [];

            // Process contacts in concurrency pools
            const contacts = job.contacts;
            for (let i = 0; i < contacts.length; i += concurrentLimit) {
                const chunk = contacts.slice(i, i + concurrentLimit);
                const chunkPromises = chunk.map(async (contact) => {
                    const jid = locationFormatter.normalizePhoneNumber(contact.phone);
                    if (!jid) {
                        return { phone: contact.phone, status: 'failed', reason: 'Invalid or missing phone number format' };
                    }

                    const messageBody = locationFormatter.constructSosMessage(
                        contact.name, 
                        job.latitude, 
                        job.longitude, 
                        job.accuracy
                    );

                    // Perform native location send with 10-second timeout
                    let isLocationDelivered = false;
                    try {
                        await Promise.race([
                            whatsappService.sendLocation(jid, job.latitude, job.longitude, `SOS: ${contact.name}`),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Send location timeout')), sendTimeout))
                        ]);
                        isLocationDelivered = true;
                    } catch (locErr) {
                        console.warn(JSON.stringify({
                            level: 'warn',
                            message: `Failed to deliver native location card for ${contact.phone}. Falling back to standard maps URL link text...`,
                            error: locErr.message,
                            dispatchId: job.jobId,
                            timestamp: new Date().toISOString()
                        }));
                    }

                    // Send alert message body details
                    try {
                        await Promise.race([
                            whatsappService.sendText(jid, messageBody),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Send text timeout')), sendTimeout))
                        ]);
                        return { phone: contact.phone, status: isLocationDelivered ? 'delivered' : 'fallback_link_delivered' };
                    } catch (textErr) {
                        return { phone: contact.phone, status: 'failed', reason: textErr.message };
                    }
                });

                const chunkResults = await Promise.allSettled(chunkPromises);
                chunkResults.forEach((res) => {
                    if (res.status === 'fulfilled') {
                        results.push(res.value);
                    } else {
                        results.push({ status: 'failed', reason: res.reason.message });
                    }
                });
            }

            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            job.results = results;

            await this.acknowledge(job.jobId);
            await this.sendCallback(job);

        } catch (err) {
            console.warn(JSON.stringify({
                level: 'warn',
                message: `Job processing encountered execution failure: ${err.message}`,
                dispatchId: job.jobId,
                timestamp: new Date().toISOString()
            }));

            // Handle retry exponential backoffs (Retry 1 -> 2s, Retry 2 -> 10s, Retry 3 -> 30s)
            if (job.retryCount < 3) {
                const backoffs = [2000, 10000, 30000];
                const backoffMs = backoffs[job.retryCount];
                await this.retry(job.jobId, backoffMs);
            } else {
                await this.fail(job.jobId, `Maximum retry attempts exceeded: ${err.message}`);
            }
        }
    }

    async sendCallback(job) {
        const callbackUrl = process.env.GATEWAY_CALLBACK_URL;
        if (!callbackUrl) {
            console.warn(JSON.stringify({
                level: 'warn',
                message: 'GATEWAY_CALLBACK_URL environment variable is not defined. Bypassing webhook callback dispatch.',
                dispatchId: job.jobId,
                timestamp: new Date().toISOString()
            }));
            return;
        }

        const durationMs = job.startedAt ? (new Date(job.completedAt) - new Date(job.startedAt)) : 0;
        
        const payload = {
            dispatchId: job.dispatchId,
            status: job.status,
            reason: job.error || 'SOS WhatsApp dispatches completed.',
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            durationMs,
            retryCount: job.retryCount,
            workerId: job.workerId,
            results: job.results || []
        };

        // Compute HMAC signature of the callback body
        const apiKey = process.env.INTERNAL_WHATSAPP_API_KEY;
        const hmac = crypto.createHmac('sha256', apiKey);
        hmac.update(JSON.stringify(payload));
        const signature = hmac.digest('hex');

        console.log(JSON.stringify({
            level: 'info',
            message: 'Dispatching webhook callback payload back to Vercel Gateway...',
            callbackUrl,
            dispatchId: job.dispatchId,
            timestamp: new Date().toISOString()
        }));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second callback timeout

            const response = await fetch(callbackUrl, {
                signal: controller.signal,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'X-Nazar-Signature': signature
                },
                body: JSON.stringify(payload)
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Server returned HTTP status ${response.status}`);
            }

            console.log(JSON.stringify({
                level: 'info',
                message: 'Webhook callback successfully posted and acknowledged by Vercel Gateway!',
                dispatchId: job.dispatchId,
                timestamp: new Date().toISOString()
            }));
        } catch (err) {
            console.error(JSON.stringify({
                level: 'error',
                message: 'Failed to post webhook callback to Vercel Gateway',
                error: err.message,
                dispatchId: job.dispatchId,
                timestamp: new Date().toISOString()
            }));
        }
    }
}

module.exports = {
    QueueService,
    MemoryQueue: new MemoryQueue()
};
