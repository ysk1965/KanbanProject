import { describe, expect, it } from 'vitest';
import {
  ASSIGNEE_COLOR_NAMES,
  getAssigneeClasses,
  getAssigneeHex,
  getInitials,
  resolveColorName,
} from './assigneeColor';

describe('assigneeColor', () => {
  describe('resolveColorName', () => {
    it('is deterministic for the same name', () => {
      expect(resolveColorName('alice')).toBe(resolveColorName('alice'));
    });

    it('always yields one of the six palette names', () => {
      for (const name of ['alice', 'bob', '유상건', '', 'a-very-long-name-with-symbols-!@#']) {
        expect(ASSIGNEE_COLOR_NAMES).toContain(resolveColorName(name));
      }
    });

    it('honours a valid custom palette name', () => {
      expect(resolveColorName('alice', 'rose')).toBe('rose');
    });

    it('falls back to the hash when the custom name is unknown', () => {
      expect(resolveColorName('alice', 'magenta')).toBe(resolveColorName('alice'));
      expect(resolveColorName('alice', null)).toBe(resolveColorName('alice'));
    });
  });

  describe('getAssigneeHex', () => {
    it('returns the palette hex for a palette name', () => {
      expect(getAssigneeHex('alice', 'indigo')).toBe('#6366F1');
      expect(getAssigneeHex('alice', 'emerald')).toBe('#10B981');
    });

    it('passes a custom "#" hex straight through', () => {
      expect(getAssigneeHex('alice', '#123ABC')).toBe('#123ABC');
    });

    it('returns a hex string even without a custom color', () => {
      expect(getAssigneeHex('bob')).toMatch(/^#[0-9A-F]{6}$/);
    });
  });

  describe('getAssigneeClasses', () => {
    it('returns Tailwind classes for a palette name', () => {
      expect(getAssigneeClasses('alice', 'teal')).toEqual({
        hex: '#14B8A6',
        bg: 'bg-teal-500',
        bgLight: 'bg-teal-500/20',
        text: 'text-teal-300',
      });
    });

    it('returns empty classes (inline style needed) for a custom hex', () => {
      expect(getAssigneeClasses('alice', '#ff0000')).toEqual({
        hex: '#ff0000',
        bg: '',
        bgLight: '',
        text: '',
      });
    });
  });

  describe('getInitials', () => {
    it('uses the last two syllables for Korean names', () => {
      expect(getInitials('유상건')).toBe('상건');
    });

    it('uses the first two letters, upper-cased, for Latin names', () => {
      expect(getInitials('alex')).toBe('AL');
      expect(getInitials('  bob  ')).toBe('BO');
    });

    it('handles single characters and empty input', () => {
      expect(getInitials('a')).toBe('A');
      expect(getInitials('')).toBe('');
      expect(getInitials('   ')).toBe('');
    });
  });
});
