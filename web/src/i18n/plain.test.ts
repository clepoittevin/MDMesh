import { describe, expect, it } from 'vitest';
import { format } from './plain';

describe('deploy-0.5.1 message stand-in', () => {
  it('fills placeholders and one/other plurals', () => {
    expect(format('{count, plural, one {# other entry} other {# other entries}}', { count: 1 })).toBe('1 other entry');
    expect(format('{count, plural, one {# Wi-Fi entry left out} other {# Wi-Fi entries left out}}: x', { count: 3 })).toBe(
      '3 Wi-Fi entries left out: x',
    );
    expect(format('{summary} (other Extra QR parameters left out: {error})', { summary: 'fr_FR', error: 'invalid JSON' })).toBe(
      'fr_FR (other Extra QR parameters left out: invalid JSON)',
    );
    expect(format("“{value}” isn't a value", { value: 'fr-FR' })).toBe("“fr-FR” isn't a value");
  });
});
