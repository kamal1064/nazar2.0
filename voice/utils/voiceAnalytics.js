/**
 * NAZAR Voice Engine — In-Memory Voice Analytics
 * v1.0.0
 *
 * Tracks session statistics like command accuracy, Gemini fallback percentages,
 * average latencies, skill usage counts, and bottleneck frequencies.
 */
import { voiceConfig } from './voiceConfig.js';
import { commandHistory } from './commandHistory.js';
import { logger } from './logger.js';

class VoiceAnalytics {
    constructor() {
        this.reset();
    }

    /** Reset all analytics statistics */
    reset() {
        this.wakeWordDetections = 0;
        this.totalCommands = 0;
        this.localResolvedCount = 0;
        this.geminiResolvedCount = 0;
        this.failedCommandsCount = 0;
        this.skillUsage = new Map();
        this.sessionStartTime = Date.now();
    }

    /** Record a wake word activation event */
    recordWake() {
        this.wakeWordDetections++;
        logger.perf.debug(`Wake word detections count: ${this.wakeWordDetections}`);
    }

    /**
     * Records intent resolution details for statistics.
     * @param {'local_exact'|'local_regex'|'local_fuzzy'|'gemini'} source 
     * @param {string} skill 
     * @param {boolean} success 
     */
    recordCommand(source, skill, success) {
        if (!voiceConfig.flags.analytics) return;

        this.totalCommands++;
        
        if (source === 'gemini') {
            this.geminiResolvedCount++;
        } else {
            this.localResolvedCount++;
        }

        if (!success) {
            this.failedCommandsCount++;
        }

        // Increment skill usage counter
        const count = this.skillUsage.get(skill) || 0;
        this.skillUsage.set(skill, count + 1);
    }

    /**
     * Compiles and returns a diagnostic report of the current session.
     * @returns {Object}
     */
    getReport() {
        const logs = commandHistory.getLogs();
        const total = logs.length;

        // Calculate average total latency and stage latencies
        let totalSum = 0;
        const stageSums = {};
        const bottleneckFreq = {};
        const budgetBreaches = {};

        logs.forEach(log => {
            if (log.stages) {
                totalSum += log.stages.totalMs || 0;
                
                Object.keys(log.stages).forEach(stage => {
                    if (stage === 'totalMs' || stage === 'bottleneck') return;
                    stageSums[stage] = (stageSums[stage] || 0) + log.stages[stage];
                });

                if (log.stages.bottleneck) {
                    const bn = log.stages.bottleneck;
                    bottleneckFreq[bn] = (bottleneckFreq[bn] || 0) + 1;
                }
            }
        });

        const avgTotalMs = total > 0 ? totalSum / total : 0;
        const avgStages = {};
        Object.keys(stageSums).forEach(stage => {
            avgStages[stage] = stageSums[stage] / total;
        });

        // Convert Map to plain object for serializability
        const skillUsageObj = {};
        this.skillUsage.forEach((val, key) => {
            skillUsageObj[key] = val;
        });

        return {
            sessionDurationSeconds: Math.floor((Date.now() - this.sessionStartTime) / 1000),
            wakeWordDetections: this.wakeWordDetections,
            totalCommands: this.totalCommands,
            localResolutionRate: this.totalCommands > 0 ? this.localResolvedCount / this.totalCommands : 0,
            geminiFallbackRate: this.totalCommands > 0 ? this.geminiResolvedCount / this.totalCommands : 0,
            failureRate: this.totalCommands > 0 ? this.failedCommandsCount / this.totalCommands : 0,
            avgTotalMs,
            avgStages,
            bottleneckFrequency: bottleneckFreq,
            skillUsage: skillUsageObj
        };
    }
}

// Export single instance
export const voiceAnalytics = new VoiceAnalytics();
window.NazarVoiceAnalytics = voiceAnalytics;
