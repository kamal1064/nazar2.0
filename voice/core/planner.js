/**
 * NAZAR Voice Engine Execution Task Planner
 * v1.0.0
 */
import { parser } from './parser.js';

export class Planner {
    /**
     * Parses compound transcripts and returns an array of sequential intents
     * @param {string} transcript 
     * @param {string} locale e.g. 'en-US'
     * @returns {Array<Object>} List of task intents
     */
    plan(transcript, locale = 'en-US') {
        const cleanText = transcript.trim().toLowerCase();
        if (!cleanText) return [];

        // Split compound commands by conjunctions: "and", "then", or commas
        const parts = cleanText.split(/\s+and\s+|\s+then\s+|,\s*/);
        const taskList = [];

        for (const part of parts) {
            const trimmedPart = part.trim();
            if (!trimmedPart) continue;

            const intent = parser.parse(trimmedPart, locale);
            if (intent) {
                // Dependency injection check:
                // If a camera action is requested but viewfinder is not active, prepend navigating to camera
                if (intent.skill === 'camera' && intent.action !== 'stopScan') {
                    const isAlreadyOnCamera = this.checkCurrentView('camera');
                    const isNavigatedInPlan = taskList.some(t => t.skill === 'navigate' && (t.action === 'camera' || t.params.target === 'camera'));
                    
                    if (!isAlreadyOnCamera && !isNavigatedInPlan) {
                        taskList.push({
                            skill: 'navigate',
                            action: 'camera',
                            params: {},
                            confidence: 1.0,
                            source: 'planner_dependency'
                        });
                    }
                }

                taskList.push(intent);
            }
        }

        console.log('[Planner] Created execution plan steps:', taskList);
        return taskList;
    }

    /**
     * Helper to verify which page is currently rendered
     * @param {string} viewName 
     * @returns {boolean}
     */
    checkCurrentView(viewName) {
        if (!window.NazarVoiceAPI || !window.NazarVoiceAPI.getSettings) return false;
        
        // Check active panel class in the DOM
        const panel = document.getElementById(`${viewName}-panel`);
        return !!(panel && panel.classList.contains('active-panel'));
    }
}

// Export single instance
export const planner = new Planner();
