/**
 * NAZAR Voice Engine Settings Skill
 * v1.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { speaker } from '../core/speaker.js';

export class SettingsSkill extends BaseSkill {
    constructor() {
        super();
        this.previousVolume = 1.0;
    }

    name() {
        return 'settings';
    }

    supportedActions() {
        return [
            'increaseVolume', 'decreaseVolume',
            'speakFaster', 'speakSlower',
            'speak_faster', 'speak_slower',
            'muteVoice', 'unmuteVoice',
            'enableDarkMode', 'disableDarkMode'
        ];
    }

    async execute(action, params = {}) {
        console.log(`[SettingsSkill] Adjusting setting: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                spokenText: "Settings service is unavailable.",
                nextState: "Idle",
                data: {}
            };
        }

        try {
            const currentSettings = window.NazarVoiceAPI.getSettings();
            let responseText = '';

            switch (action) {
                case 'speakFaster':
                case 'speak_faster': {
                    let rate = currentSettings.speechRate || 1.0;
                    rate = Math.min(3.0, +(rate + 0.2).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechRate', rate);
                    speaker.setPreferences({ rate });
                    responseText = "Speaking faster.";
                    break;
                }

                case 'speakSlower':
                case 'speak_slower': {
                    let rate = currentSettings.speechRate || 1.0;
                    rate = Math.max(0.5, +(rate - 0.2).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechRate', rate);
                    speaker.setPreferences({ rate });
                    responseText = "Speaking slower.";
                    break;
                }

                case 'increaseVolume': {
                    let volume = currentSettings.speechVolume || 1.0;
                    volume = Math.min(1.0, +(volume + 0.15).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechVolume', volume);
                    speaker.setPreferences({ volume });
                    responseText = "Volume increased.";
                    break;
                }

                case 'decreaseVolume': {
                    let volume = currentSettings.speechVolume || 1.0;
                    volume = Math.max(0.1, +(volume - 0.15).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechVolume', volume);
                    speaker.setPreferences({ volume });
                    responseText = "Volume decreased.";
                    break;
                }

                case 'muteVoice': {
                    const volume = currentSettings.speechVolume || 1.0;
                    if (volume > 0) {
                        this.previousVolume = volume;
                    }
                    window.NazarVoiceAPI.saveSetting('speechVolume', 0.0);
                    speaker.setPreferences({ volume: 0.0 });
                    responseText = ""; // Silent confirmation
                    break;
                }

                case 'unmuteVoice': {
                    const volume = this.previousVolume || 1.0;
                    window.NazarVoiceAPI.saveSetting('speechVolume', volume);
                    speaker.setPreferences({ volume });
                    responseText = "Voice unmuted.";
                    break;
                }

                case 'enableDarkMode': {
                    window.NazarVoiceAPI.saveSetting('darkModeEnabled', true);
                    responseText = "Dark theme enabled.";
                    break;
                }

                case 'disableDarkMode': {
                    window.NazarVoiceAPI.saveSetting('darkModeEnabled', false);
                    responseText = "Light theme enabled.";
                    break;
                }

                default:
                    return {
                        success: false,
                        spokenText: "Action not recognized.",
                        nextState: "Idle",
                        data: {}
                    };
            }

            return {
                success: true,
                spokenText: responseText,
                nextState: "Idle",
                data: { action }
            };
        } catch (err) {
            console.error('[SettingsSkill] Execution error:', err);
            return {
                success: false,
                spokenText: "Failed to adjust settings.",
                nextState: "Idle",
                data: {}
            };
        }
    }
}
