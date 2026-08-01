# Contributing to NAZAR

We welcome contributions to help improve NAZAR. This document outlines coding standards, Git branch naming rules, and instructions for creating new pluggable voice skills.

---

## 🛠️ Code Style Guidelines

1. **JavaScript Style**: Standard Vanilla ES6. Use 4 spaces for indentation.
2. **ES Modules in Frontend**: All frontend voice scripts must use ES Module imports (`import` / `export`). CommonJS `require` is restricted to `server/` and `whatsapp-service/`.
3. **No Direct DOM Mutations in Core**: Voice engine core components (`recognition.js`, `speaker.js`, `router.js`) must not mutate UI components directly. Use the [eventBus.js](file:///c:/Users/kamal/Documents/n1/voice/core/eventBus.js) to trigger events that the client (`app.js`) listens for.
4. **Preserve Comments**: Do not remove existing JSDoc comments or documentation headers during refactors.

---

## 🌿 Git Branching Conventions

- **Feature branches**: `feat/your-feature-name`
- **Fixes**: `fix/bug-description`
- **Docs**: `docs/update-docs-name`
- **Performance**: `perf/optimize-something`

Example commit message syntax:
- `feat: add Kannada speech command triggers`
- `fix: resolve speech synthesis callback boundary bugs on iOS Safari`

---

## 🎙️ How to Author a Custom Voice Skill

NAZAR utilizes a pluggable skill architecture. To add a new voice feature:

### Step 1: Create a Skill Class
Create a new file in `voice/skills/` (e.g. `voice/skills/MathSkill.js`). Extend it from `BaseSkill`:

```javascript
import { BaseSkill } from './BaseSkill.js';
import { logger } from '../utils/logger.js';

export class MathSkill extends BaseSkill {
    async execute(action, params = {}) {
        logger.skill.info(`Executing MathSkill: ${action}`);
        
        if (action === 'calculate') {
            const result = 2 + 2; // custom calculation
            return {
                success: true,
                responseKey: 'math.calc.success',
                nextState: 'Idle',
                data: { result }
            };
        }
        
        return {
            success: false,
            responseKey: 'math.error',
            nextState: 'Idle',
            data: {}
        };
    }

    cancel() {
        logger.skill.info('MathSkill cancelled.');
    }
}

// Manifest definition
MathSkill.manifest = {
    id: 'math',
    version: '1.0.0',
    priority: 100,
    description: 'perform simple arithmetic calculations',
    commands: ['calculate', 'add_numbers'],
    permissions: [],
    busyDescription: 'calculating'
};
```

### Step 2: Register in Barrel exports
Open [voice/skills/index.js](file:///c:/Users/kamal/Documents/n1/voice/skills/index.js):
1. Import your class:
   `import { MathSkill } from './MathSkill.js';`
2. Add your class and manifest to the `ALL_SKILLS` array:
   ```javascript
   export const ALL_SKILLS = [
       ...
       { SkillClass: MathSkill, manifest: MathSkill.manifest }
   ];
   ```

The skill router will automatically auto-discover, instantiate, and route matching speech triggers to your skill during server startup.
