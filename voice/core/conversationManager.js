import { voiceConfig } from '../utils/voiceConfig.js';
import { speaker } from './speaker.js';
import { stateMachine } from './state.js';
import { eventBus } from './eventBus.js';
import { VoiceEvents } from '../events.js';
import { logger } from '../utils/logger.js';
import { audioCues } from './audioCues.js';

/** Phrases that end the conversation */
const EXIT_PHRASES = [
    'no', 'nope', 'nothing', "that's all", "that's it",
    'stop', 'goodbye', 'bye', 'done', 'exit', 'nevermind',
    'never mind', 'cancel', 'ok thanks', 'okay thanks', 'thank you',
];

class ConversationManager {
    constructor() {
        this._hasGreeted    = false; 
        this._timeoutHandle = null;
        this._promptHandle  = null;
        this._active        = false;
        this._depth         = 0;    
    }

    /** Reset for a new session (called on wake word or tap activation) */
    newSession() {
        this._cancelTimers();
        this._hasGreeted = false;
        this._depth = 0;
        this._active = true;
        this.startSilenceTimer();
        this.startInitialPromptTimer();
    }

    /** Cancel all active timers */
    _cancelTimers() {
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
            this._timeoutHandle = null;
        }
        if (this._promptHandle) {
            clearTimeout(this._promptHandle);
            this._promptHandle = null;
        }
    }

    /** Removed 2-second initial prompt timer so users have uninterrupted listening time */
    startInitialPromptTimer() {
        if (this._promptHandle) {
            clearTimeout(this._promptHandle);
            this._promptHandle = null;
        }
    }

    /** Starts/Resets the main silence timeout timer (default 18s) */
    startSilenceTimer() {
        if (this._timeoutHandle) clearTimeout(this._timeoutHandle);
        this._timeoutHandle = setTimeout(async () => {
            logger.voice.info('[ConversationManager] Silence timeout reached. Deactivating overlay.');
            
            // 1. Play timeout beep
            await audioCues.play('timeout');

            // 2. Trigger overlay fade-out event immediately
            eventBus.emit('conversation.fadeOverlay');

            // 3. Wait 300ms for overlay to fade out, then speak timeout message
            setTimeout(async () => {
                await speaker.speak("Conversation ended.", { mode: 'replace' });
            }, 300);

            // 4. Return to Idle/Sleeping
            this._endConversation('silence_timeout');
        }, voiceConfig.conversation.conversationTimeout || 18000);
    }

    /** Called after every successful command execution */
    async onCommandCompleted() {
        if (!voiceConfig.flags.conversationMode) {
            this._endConversation('single_shot_done');
            return;
        }

        this._depth++;
        this._cancelTimers();

        // Force sleep after max conversation depth
        if (this._depth >= voiceConfig.conversation.maxDepth) {
            logger.voice.info('[ConversationManager] Max depth reached. Going to wake-word mode.');
            await speaker.speak("I'll keep listening for Hey Nazar.", { mode: 'replace' });
            this._endConversation('max_depth');
            return;
        }

        // Check if the AI's response ended with a question
        const lastSpeech = speaker.lastSpokenText || '';
        const endsWithQuestion = /\?\s*$/.test(lastSpeech.trim());

        if (endsWithQuestion) {
            logger.voice.info('[ConversationManager] Response ended with a question. Automatically returning to Listening without wake word.');
            this.startSilenceTimer();
            eventBus.emit(VoiceEvents.CONVERSATION_ACTIVE, { depth: this._depth });
            import('./recognition.js').then(({ recognition }) => {
                if (!recognition.isContinuous) recognition.start();
            });
            return;
        }

        // Ask "Anything else?" once per session, subsequent rounds are silent
        if (!this._hasGreeted) {
            this._hasGreeted = true;
            await new Promise(r => setTimeout(r, voiceConfig.conversation.greetingDelayMs));
            await speaker.speak("Anything else?", { mode: 'queue' });
        }

        this.startSilenceTimer();
        eventBus.emit(VoiceEvents.CONVERSATION_ACTIVE, { depth: this._depth });
        import('./recognition.js').then(({ recognition }) => {
            if (!recognition.isContinuous) recognition.start();
        });
    }

    isExitPhrase(rawTranscript) {
        const normalized = rawTranscript.toLowerCase().trim().replace(/[^a-z\s']/g, '');
        return EXIT_PHRASES.some(p => normalized === p || normalized.startsWith(p + ' '));
    }

    async handleExit() {
        this._cancelTimers();
        await speaker.speak("Alright. Say 'Hey Nazar' whenever you need me.", { mode: 'replace' });
        this._endConversation('user_exit');
    }

    /** End the conversation loop and return to wake-word mode */
    _endConversation(reason) {
        this._active = false;
        this._cancelTimers();

        stateMachine.setWakeState('Sleeping');
        stateMachine.setEngineState('Idle');

        eventBus.emit(VoiceEvents.CONVERSATION_ENDED, { reason, depth: this._depth });
        logger.voice.info(`[ConversationManager] Conversation ended. Reason: ${reason}, depth: ${this._depth}`);
    }

    /**
     * Handles new user voice input, updating conversation state and resetting timers.
     * @param {string} transcript
     */
    handleInput(transcript) {
        if (!this._active) return;
        this.latestTranscript = transcript;
        logger.voice.info(`[Conversation]\nReceived:\n"${transcript}"`);
        this.startSilenceTimer();
    }

    get isActive() { return this._active; }
}

export const conversationManager = new ConversationManager();
