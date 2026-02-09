/**
 * 도메인별 기능 분기 유틸리티
 * 특정 도메인에서 UI/기능을 다르게 동작시킬 때 사용
 */

const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

/** milkyway.pe.kr 도메인 여부 (구독 숨김, 구글 로그인만) */
export const isWhiteLabelDomain = hostname === 'milkyway.pe.kr' || hostname.endsWith('.milkyway.pe.kr');

/** 구독/결제 UI 숨김 도메인 여부 */
export const isDomainBillingHidden = isWhiteLabelDomain;

/** 이메일/패스워드 로그인 숨김 (구글 로그인만 허용) */
export const isGoogleOnlyLogin = isWhiteLabelDomain;
