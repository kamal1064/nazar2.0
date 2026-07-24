/**
 * NAZAR Voice Engine — Event Constants
 * v2.0.0
 *
 * Single source of truth for all event names across the voice engine.
 * All eventBus.emit() and eventBus.on() calls must use these constants.
 * Never use raw string literals for event names.
 */

export const VoiceEvents = {

    // ─── Session ──────────────────────────────────────────────────────────────
    SESSION_STARTED:          'session.started',
    SESSION_ENDED:            'session.ended',
    SESSION_TIMEOUT:          'session.timeout',

    // ─── Wake Word ────────────────────────────────────────────────────────────
    WAKE_DETECTED:            'wake.detected',
    WAKE_STATE_CHANGED:       'wake.state.changed',

    // ─── Engine State ─────────────────────────────────────────────────────────
    ENGINE_STATE_CHANGED:     'engine.state.changed',
    ENGINE_OFFLINE:           'engine.offline',
    ENGINE_ONLINE:            'engine.online',
    ENGINE_ENABLED:           'engine.enabled',
    ENGINE_DISABLED:          'engine.disabled',

    // ─── Speech Recognition ───────────────────────────────────────────────────
    SPEECH_HEARD:             'speech.heard',
    SPEECH_INTERIM:           'speech.interim',
    SPEECH_PRIORITY:          'speech.priority',
    SPEECH_ERROR:             'speech.error',
    SPEECH_STARTED:           'speech.started',
    SPEECH_ENDED:             'speech.ended',

    // ─── Commands ─────────────────────────────────────────────────────────────
    COMMAND_STARTED:          'command.started',
    COMMAND_COMPLETED:        'command.completed',
    COMMAND_FAILED:           'command.failed',
    COMMAND_DUPLICATE:        'command.duplicate',
    COMMAND_DEFERRED:         'command.deferred',
    COMMAND_QUEUED:           'command.queued',

    // ─── Skills ───────────────────────────────────────────────────────────────
    SKILL_REGISTERED:         'skill.registered',
    SKILL_STARTED:            'skill.started',
    SKILL_FINISHED:           'skill.finished',
    SKILL_ERROR:              'skill.error',
    SKILL_CANCELLED:          'skill.cancelled',
    SKILL_HEALTH_CHECKED:     'skill.health.checked',

    // ─── Vision / Scanning ────────────────────────────────────────────────────
    SCAN_STARTED:             'scan.started',
    SCAN_COMPLETED:           'scan.completed',
    SCAN_FAILED:              'scan.failed',
    SCAN_CACHE_HIT:           'scan.cache.hit',

    // ─── Conversation ─────────────────────────────────────────────────────────
    CONVERSATION_ACTIVE:      'conversation.active',
    CONVERSATION_ENDED:       'conversation.ended',
    CONVERSATION_TIMEOUT:     'conversation.timeout',

    // ─── Permissions ──────────────────────────────────────────────────────────
    PERMISSION_REQUESTED:     'permission.requested',
    PERMISSION_GRANTED:       'permission.granted',
    PERMISSION_DENIED:        'permission.denied',
    PERMISSION_RECOVERED:     'permission.recovered',

    // ─── Resource Locks ───────────────────────────────────────────────────────
    RESOURCE_ACQUIRED:        'resource.acquired',
    RESOURCE_RELEASED:        'resource.released',
    RESOURCE_CONFLICT:        'resource.conflict',

    // ─── Performance ──────────────────────────────────────────────────────────
    PERF_BUDGET_BREACHED:     'perf.budget.breached',
};
