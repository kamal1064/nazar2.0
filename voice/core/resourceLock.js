/**
 * NAZAR Voice Engine — Resource Lock Manager
 * v1.0.0
 *
 * Prevents race conditions when multiple skills compete for shared hardware.
 * Managed resources: 'camera', 'microphone', 'speech'
 *
 * Usage:
 *   import { resourceLock } from '../core/resourceLock.js';
 *
 *   const ok = await resourceLock.acquire('camera', 'OCRSkill');
 *   if (!ok) { ... handle conflict ... }
 *   // ... do camera work ...
 *   resourceLock.release('camera', 'OCRSkill');
 */
import { logger } from '../utils/logger.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';

/** @type {Map<string, { owner: string, acquiredAt: number }>} */
const locks = new Map();

// Stale lock timeout: release any lock held longer than 60 seconds (safety net)
const STALE_LOCK_TIMEOUT_MS = 60_000;

export const resourceLock = {

    /**
     * Attempt to acquire a named resource lock.
     * @param {string} resource - 'camera' | 'microphone' | 'speech'
     * @param {string} requestor - Skill ID requesting the lock (e.g., 'OCRSkill')
     * @returns {boolean} true if acquired, false if already locked by another owner
     */
    acquire(resource, requestor) {
        const existing = locks.get(resource);

        if (existing) {
            // Release stale locks automatically
            if (Date.now() - existing.acquiredAt > STALE_LOCK_TIMEOUT_MS) {
                logger.router.warn(`[ResourceLock] Stale lock on '${resource}' (owned by ${existing.owner}) auto-released.`);
                this.forceRelease(resource);
            } else if (existing.owner !== requestor) {
                logger.router.debug(`[ResourceLock] '${resource}' locked by ${existing.owner}, requested by ${requestor}`);
                eventBus.emit(VoiceEvents.RESOURCE_CONFLICT, { resource, owner: existing.owner, requestor });
                return false;
            }
            // Same owner re-acquiring — idempotent
            return true;
        }

        locks.set(resource, { owner: requestor, acquiredAt: Date.now() });
        logger.router.debug(`[ResourceLock] '${resource}' acquired by ${requestor}`);
        eventBus.emit(VoiceEvents.RESOURCE_ACQUIRED, { resource, owner: requestor });
        return true;
    },

    /**
     * Release a resource lock.
     * Only the current owner may release; silently ignores mismatched releases.
     * @param {string} resource
     * @param {string} requestor - Must match current owner
     */
    release(resource, requestor) {
        const existing = locks.get(resource);
        if (!existing) return;

        if (existing.owner !== requestor) {
            logger.router.warn(`[ResourceLock] '${resource}' release denied — owned by ${existing.owner}, requestor ${requestor}`);
            return;
        }

        locks.delete(resource);
        logger.router.debug(`[ResourceLock] '${resource}' released by ${requestor}`);
        eventBus.emit(VoiceEvents.RESOURCE_RELEASED, { resource, owner: requestor });
    },

    /**
     * Force-release a lock regardless of who owns it.
     * Used when a higher-priority skill interrupts a lower-priority one.
     * @param {string} resource
     */
    forceRelease(resource) {
        const existing = locks.get(resource);
        if (!existing) return;

        logger.router.warn(`[ResourceLock] Force-releasing '${resource}' from ${existing.owner}`);
        locks.delete(resource);
        eventBus.emit(VoiceEvents.RESOURCE_RELEASED, { resource, owner: existing.owner, forced: true });
    },

    /**
     * Returns the current owner of a resource, or null if unlocked.
     * @param {string} resource
     * @returns {string|null}
     */
    getOwner(resource) {
        return locks.get(resource)?.owner ?? null;
    },

    /**
     * Check if a resource is currently locked (by any owner).
     * @param {string} resource
     * @returns {boolean}
     */
    isLocked(resource) {
        const entry = locks.get(resource);
        if (!entry) return false;
        // Also check for stale lock
        if (Date.now() - entry.acquiredAt > STALE_LOCK_TIMEOUT_MS) {
            this.forceRelease(resource);
            return false;
        }
        return true;
    },

    /**
     * Release ALL locks held by a specific owner.
     * Called in skill dispose() to ensure clean shutdown.
     * @param {string} owner
     */
    releaseAll(owner) {
        for (const [resource, entry] of locks.entries()) {
            if (entry.owner === owner) {
                this.release(resource, owner);
            }
        }
    },

    /**
     * Returns a snapshot of all current locks. For HUD/diagnostics.
     * @returns {Object}
     */
    snapshot() {
        const result = {};
        for (const [resource, entry] of locks.entries()) {
            result[resource] = { owner: entry.owner, heldMs: Date.now() - entry.acquiredAt };
        }
        return result;
    },
};

// Expose on window for console debugging
window.NazarResourceLock = resourceLock;
