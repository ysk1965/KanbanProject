import { describe, expect, it } from 'vitest';
import { deepLinkPath } from './deepLinks';

describe('deepLinkPath', () => {
  it('위젯 링크 bridgespots://app/… 는 app 호스트를 뺀 경로', () => {
    expect(deepLinkPath('bridgespots://app/sermonnote?tab=challenge')).toBe(
      '/sermonnote?tab=challenge',
    );
    expect(deepLinkPath('bridgespots://app/sermonnote')).toBe('/sermonnote');
    expect(deepLinkPath('bridgespots://app?x=1')).toBe('/?x=1');
  });

  it('예전 스킴 링크 bridgespots://path 는 그대로', () => {
    expect(deepLinkPath('bridgespots://boards/abc')).toBe('/boards/abc');
    expect(deepLinkPath('bridgespots://apple')).toBe('/apple');
  });

  it('https 링크는 경로 + 쿼리', () => {
    expect(deepLinkPath('https://bridgespots.com/g/abc?join=1')).toBe('/g/abc?join=1');
  });
});
