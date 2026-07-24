/**
 * NAZAR Voice Engine — Command History Ring Buffer
 * v1.0.0
 *
 * Keeps track of the last 20 executed voice commands and their performance metrics.
 * Useful for HUD telemetry, diagnostics, and performance optimization.
 */
import { voiceConfig } from './voiceConfig.js';
import { logger } from './logger.js';

class CommandHistory {
    constructor() {
        this.limit = voiceConfig.analytics.commandHistorySize || 20;
        this.history = [];
        this.lastCommandMs = 0;
    }

    /**
     * Appends a command execution entry to the history ring buffer.
     * @param {Object} entry
     * @param {string} entry.transcript - Raw user transcript
     * @param {string} entry.skill - Resolved skill ID
     * @param {string} entry.action - Resolved action
     * @param {string} entry.source - Intent source ('local_exact', 'local_regex', 'local_fuzzy', 'gemini')
     * @param {boolean} entry.success - Execution success status
     * @param {Object} entry.stages - Latency timing stages (in milliseconds)
     * @param {number} [entry.stages.wakeDetectionMs]
     * @param {number} [entry.stages.localParseMs]
     * @param {number} [entry.stages.fuzzyMatchMs]
     * @param {number} [entry.stages.geminiRTTMs]
     * @param {number} [entry.stages.skillExecutionMs]
     * @param {number} [entry.stages.speechStartMs]
     * @param {number} [entry.stages.totalMs]
     */
    add(entry) {
        const fullEntry = {
            timestamp: Date.now(),
            ...entry
        };

        // Determine slowest stage relative to budget (bottleneck identification)
        let slowestStage = 'unknown';
        let maxBreachMs = -Infinity;
        const budgets = voiceConfig.performance.budgets;

        if (entry.stages) {
            const stageKeys = Object.keys(entry.stages);
            for (const stage of stageKeys) {
                if (stage === 'totalMs') continue;
                const ms = entry.stages[stage];
                const budgetKey = this._mapStageToBudgetKey(stage);
                const budget = budgets[budgetKey];

                if (budget !== undefined) {
                    const breach = ms - budget;
                    if (breach > maxBreachMs) {
                        maxBreachMs = breach;
                        slowestStage = stage;
                    }
                    if (breach > 0) {
                        logger.perf.warn(`⚠ Stage '${stage}' breached budget of ${budget}ms by ${breach.toFixed(1)}ms (took ${ms.toFixed(1)}ms)`);
                    }
                }
            }
        }
        fullEntry.stages.bottleneck = slowestStage;
        this.lastCommandMs = entry.stages?.totalMs || 0;

        this.history.push(fullEntry);
        
        // Enforce ring buffer size
        if (this.history.length > this.limit) {
            this.history.shift();
        }

        logger.perf.info(`Command executed: ${entry.skill}.${entry.action} in ${this.lastCommandMs.toFixed(1)}ms. Bottleneck: ${slowestStage}`);
    }

    /** Maps timing stage names to configuration budget keys */
    _mapStageToBudgetKey(stage) {
        switch (stage) {
            case 'localParseMs':     return 'localCommand';
            case 'fuzzyMatchMs':     return 'fuzzyMatch';
            case 'geminiRTTMs':      return 'geminiResolution';
            case 'skillExecutionMs': return 'skillExecution';
            case 'speechStartMs':    return 'speechTrigger';
            default:                 return 'unknown';
        }
    }

    /** Returns all command history logs */
    getLogs() {
        return this.history;
    }

    /** Clears command history */
    clear() {
        this.history = [];
        this.lastCommandMs = 0;
    }
}

// Export single instance
export const commandHistory = new CommandHistory();
window.NazarVoiceHistory = commandHistory;
