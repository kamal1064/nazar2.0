/**
 * NAZAR Voice Engine — Pluggable Skills Barrel Export
 * v1.0.0
 *
 * Imports and registers all skill classes and manifests.
 * Enables dynamic discovery and registration on startup.
 */
import { NavigationSkill } from './NavigationSkill.js';
import { CameraSkill } from './CameraSkill.js';
import { OCRSkill } from './OCRSkill.js';
import { SceneSkill } from './SceneSkill.js';
import { SOSSkill } from './SOSSkill.js';
import { SettingsSkill } from './SettingsSkill.js';
import { ProfileSkill } from './ProfileSkill.js';
import { SpeechSkill } from './SpeechSkill.js';
import { UISkill } from './UISkill.js';
import { PermissionSkill } from './PermissionSkill.js';
import { ObjectFinderSkill } from './ObjectFinderSkill.js';

export const ALL_SKILLS = [
    { SkillClass: NavigationSkill,   manifest: NavigationSkill.manifest },
    { SkillClass: CameraSkill,       manifest: CameraSkill.manifest },
    { SkillClass: OCRSkill,          manifest: OCRSkill.manifest },
    { SkillClass: SceneSkill,        manifest: SceneSkill.manifest },
    { SkillClass: SOSSkill,          manifest: SOSSkill.manifest },
    { SkillClass: SettingsSkill,     manifest: SettingsSkill.manifest },
    { SkillClass: ProfileSkill,      manifest: ProfileSkill.manifest },
    { SkillClass: SpeechSkill,       manifest: SpeechSkill.manifest },
    { SkillClass: UISkill,           manifest: UISkill.manifest },
    { SkillClass: PermissionSkill,   manifest: PermissionSkill.manifest },
    { SkillClass: ObjectFinderSkill, manifest: ObjectFinderSkill.manifest }
];
