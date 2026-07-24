/**
 * NAZAR Voice Engine — Conversation Manager
 * v1.0.0
 *
 * Manages the "Anything else?" conversation loop.
 *
 * Flow:
 *   Command completes
 *     → "Anything else?" (spoken once per session)
 *     → Wait voiceConfig.conversation.conversationTimeout (10s)
 *     → User speaks → process → loop continues silently
 *     → 10s silence → "I'll keep listening for 'Hey Nazar'." → wake-word mode
 *     → "No" / "Stop" / "Nothing" / "That's all" → goodbye → wake-word mode
 *
 * Key rules:
 *   - "Anything else?" spoken only ONCE per session (hasGreeted flag)
 *   - After that, subsequent commands are processed silently
 *   - After 10s silence → wake-word mode (NOT full sleep)
 */
import { voiceConfig } from '../utils/voiceConfig.js';
import { speaker } from './speaker.js';
import { stateMachine } from './state.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { logger } from '../utils/logger.js';

/** Phrases that end the conversation */
const EXIT_PHRASES = [
    'no', 'nope', 'nothing', "that's all", "that's it",
    'stop', 'goodbye', 'bye', 'done', 'exit', 'nevermind',
    'never mind', 'cancel', 'ok thanks', 'okay thanks', 'thank you',
];

class ConversationManager {
    constructor() {
        this._hasGreeted    = false; // "Anything else?" spoken this session?
        this._timeoutHandle = null;
        this._active        = false;
        this._depth         = 0;    // Command count this session
    }

    /**
     * Called by VoiceController after every successful command execution.
     * Decides whether to say "Anything else?" or just keep listening.
     */
    async onCommandCompleted() {
        if (!voiceConfig.flags.conversationMode) return;

        this._depth++;
        this._cancelTimeout();

        // Force sleep after max conversation depth
        if (this._depth >= voiceConfig.conversation.maxDepth) {
            logger.voice.info('[ConversationManager] Max conversation depth reached. Going to wake-word mode.');
            await speaker.speak("I'll keep listening for Hey Nazar.", { mode: 'replace' });
            this._endConversation('max_depth');
            return;
        }

        this._active = true;

        if (!this._hasGreeted) {
            // Speak "Anything else?" once per session
            this._hasGreeted = true;
            await new Promise(r => setTimeout(r, voiceConfig.conversation.greetingDelayMs));
            await speaker.speak("Anything else?", { mode: 'queue' });
        }
        // Subsequent commands: stay listening silently

        // Start 10-second silence timeout
        this._timeoutHandle = setTimeout(async () => {
            logger.voice.info('[ConversationManager] 10s silence. Returning to wake-word mode.');
            await speaker.speak("I'll keep listening for Hey Nazar.", { mode: 'replace' });
            this._endConversation('silence_timeout');
        }, voiceConfig.conversation.conversationTimeout);

        eventBus.emit(VoiceEvents.CONVERSATION_ACTIVE, { depth: this._depth });
    }

    /**
     * Check if a transcript is an exit phrase.
     * Called by VoiceController before attempting to resolve a command.
     * @param {string} rawTranscript
     * @returns {boolean}
     */
    isExitPhrase(rawTranscript) {
        const normalized = rawTranscript.toLowerCase().trim().replace(/[^a-z\s']/g, '');
        return EXIT_PHRASES.some(p => normalized === p || normalized.startsWith(p + ' '));
    }

    /**
     * Called when user says an exit phrase during a conversation.
     */
    async handleExit() {
        this._cancelTimeout();
        await speaker.speak("Alright. Say 'Hey Nazar' whenever you need me.", { mode: 'replace' });
        this._endConversation('user_exit');
    }

    /**
     * Reset for a new session (called on wake word detection).
     */
    newSession() {
        this._cancelTimeout();
        this._hasGreeted = false;
        this._depth = 0;
        this._active = false;
    }

    /** Cancel any running silence timeout */
    _cancelTimeout() {
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
            this._timeoutHandle = null;
        }
    }

    /** End the conversation loop and return to wake-word mode */
    _endConversation(reason) {
        this._active = false;
        this._cancelTimeout();

        // Return to wake-word mode — mic stays on but wake word required
        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');

        eventBus.emit(VoiceEvents.CONVERSATION_ENDED, { reason, depth: this._depth });
        logger.voice.info(`[ConversationManager] Conversation ended. Reason: ${reason}, depth: ${this._depth}`);
    }

    get isActive() { return this._active; }
}

// Export single instance
export const conversationManager = new ConversationManager();
