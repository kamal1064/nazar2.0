/**
 * NAZAR Voice Engine Settings Skill
 * v2.0.0
 */
import { BaseSkill } from './BaseSkill.js';
import { speaker } from '../core/speaker.js';
import { logger } from '../utils/logger.js';

export class SettingsSkill extends BaseSkill {
    constructor() {
        super();
        this.previousVolume = 1.0;
    }

    async execute(action, params = {}) {
        logger.skill.info(`Executing SettingsSkill: ${action}`);

        if (!window.NazarVoiceAPI) {
            return {
                success: false,
                responseKey: 'settings.error',
                nextState: "Idle",
                data: {}
            };
        }

        try {
            const currentSettings = window.NazarVoiceAPI.getSettings();
            let responseKey = '';

            switch (action) {
                case 'speakFaster':
                case 'speak_faster': {
                    let rate = currentSettings.speechRate || 1.0;
                    rate = Math.min(3.0, +(rate + 0.2).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechRate', rate);
                    speaker.setPreferences({ rate });
                    responseKey = 'settings.speak_faster.success';
                    break;
                }

                case 'speakSlower':
                case 'speak_slower': {
                    let rate = currentSettings.speechRate || 1.0;
                    rate = Math.max(0.5, +(rate - 0.2).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechRate', rate);
                    speaker.setPreferences({ rate });
                    responseKey = 'settings.speak_slower.success';
                    break;
                }

                case 'increaseVolume': {
                    let volume = currentSettings.speechVolume || 1.0;
                    volume = Math.min(1.0, +(volume + 0.15).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechVolume', volume);
                    speaker.setPreferences({ volume });
                    responseKey = 'settings.increaseVolume.success';
                    break;
                }

                case 'decreaseVolume': {
                    let volume = currentSettings.speechVolume || 1.0;
                    volume = Math.max(0.1, +(volume - 0.15).toFixed(2));
                    window.NazarVoiceAPI.saveSetting('speechVolume', volume);
                    speaker.setPreferences({ volume });
                    responseKey = 'settings.decreaseVolume.success';
                    break;
                }

                case 'muteVoice': {
                    const volume = currentSettings.speechVolume || 1.0;
                    if (volume > 0) {
                        this.previousVolume = volume;
                    }
                    window.NazarVoiceAPI.saveSetting('speechVolume', 0.0);
                    speaker.setPreferences({ volume: 0.0 });
                    responseKey = 'settings.decreaseVolume.success'; // silent / low confirmation handled by cues
                    break;
                }

                case 'unmuteVoice': {
                    const volume = this.previousVolume || 1.0;
                    window.NazarVoiceAPI.saveSetting('speechVolume', volume);
                    speaker.setPreferences({ volume });
                    responseKey = 'settings.increaseVolume.success';
                    break;
                }

                case 'enableDarkMode': {
                    window.NazarVoiceAPI.saveSetting('darkModeEnabled', true);
                    responseKey = 'settings.enableDarkMode.success';
                    break;
                }

                case 'disableDarkMode': {
                    window.NazarVoiceAPI.saveSetting('darkModeEnabled', false);
                    responseKey = 'settings.disableDarkMode.success';
                    break;
                }

                default:
                    return {
                        success: false,
                        responseKey: 'settings.error',
                        nextState: "Idle",
                        data: {}
                    };
            }

            return {
                success: true,
                responseKey,
                nextState: "Idle",
                data: { action }
            };
        } catch (err) {
            logger.skill.error('[SettingsSkill] Execution error:', err);
            return {
                success: false,
                responseKey: 'settings.error',
                nextState: "Idle",
                data: {}
            };
        }
    }
}

// Static manifest for registration and capability discovery
SettingsSkill.manifest = {
    id: 'settings',
    version: '2.0.0',
    priority: 100,
    description: 'adjust voice settings, speech speed, volume, and toggle dark mode theme',
    commands: [
        'increaseVolume', 'decreaseVolume',
        'speakFaster', 'speakSlower',
        'speak_faster', 'speak_slower',
        'muteVoice', 'unmuteVoice',
        'enableDarkMode', 'disableDarkMode'
    ],
    permissions: [],
    busyDescription: 'adjusting application settings'
};

