import { analyzeMusicClutter } from '../../../../../packages/music-core/src/index.js';

export class ReflectionEngine {
  analyze(input = {}) {
    return analyzeMusicClutter(input);
  }
}
