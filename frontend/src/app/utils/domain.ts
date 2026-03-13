/**
 * 도메인별 기능 분기 유틸리티
 * 특정 도메인에서 UI/기능을 다르게 동작시킬 때 사용
 */

const hostname = typeof window !== "undefined" ? window.location.hostname : "";

/** milkyway.pe.kr 도메인 여부 (구독 숨김, 구글 로그인만) */
export const isWhiteLabelDomain =
  hostname === "milkyway.pe.kr" || hostname.endsWith(".milkyway.pe.kr");

/** 구독/결제 UI 숨김 도메인 여부 */
export const isDomainBillingHidden = isWhiteLabelDomain;

/** 이메일/패스워드 로그인 숨김 (구글 로그인만 허용) */
export const isGoogleOnlyLogin = isWhiteLabelDomain;

/** AI 기능 버튼 숨김 도메인 여부 */
export const isDomainAIHidden = isWhiteLabelDomain;

/** Organization 메뉴/UI 숨김 */
export const isDomainOrgHidden = isWhiteLabelDomain;

/** Personal Space(My Space) 숨김 */
export const isDomainPersonalSpaceHidden = isWhiteLabelDomain;

/** 언어/Holiday 설정 숨김 */
export const isDomainLocaleHidden = isWhiteLabelDomain;

/** 도메인별 브랜드명 */
export const domainBrandName = isWhiteLabelDomain ? "Milkyway" : "BRIDGE SPOTS";

/** @cookapps.com 이메일 제한 체크 (런타임, 로그인 후 사용) */
export const isRestrictedEmail = (email?: string | null): boolean =>
  !!email && email.endsWith("@cookapps.com");
