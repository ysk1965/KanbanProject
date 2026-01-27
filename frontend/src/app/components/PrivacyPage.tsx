import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield } from 'lucide-react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen w-full bg-bridge-dark text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bridge-obsidian/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">홈으로</span>
          </Link>
          <Link to="/" className="text-xl font-bold text-white">
            BRIDGE SPOTS
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-[#6366F1] to-[#2DD4BF] rounded-2xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">개인정보처리방침</h1>
              <p className="text-slate-400 text-sm mt-1">최종 수정일: 2026년 1월 1일</p>
            </div>
          </div>

          {/* Content Box */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-8 space-y-8">
            {/* Intro */}
            <section>
              <p className="text-slate-400 leading-relaxed">
                BRIDGE SPOTS(이하 "회사")는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」
                등 관련 법령을 준수하고 있습니다. 본 개인정보처리방침은 회사가 수집하는
                개인정보의 항목, 수집 목적, 이용 방법 및 보호 조치에 대해 설명합니다.
              </p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">1. 수집하는 개인정보 항목</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>회사는 서비스 제공을 위해 다음의 개인정보를 수집합니다:</p>
                <div className="bg-white/5 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-white font-medium mb-1">필수 항목</p>
                    <p className="text-sm">이메일 주소, 이름(닉네임), 비밀번호</p>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">선택 항목</p>
                    <p className="text-sm">프로필 이미지</p>
                  </div>
                  <div>
                    <p className="text-white font-medium mb-1">자동 수집 항목</p>
                    <p className="text-sm">접속 IP, 접속 시간, 브라우저 정보, 서비스 이용 기록</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">2. 개인정보의 수집 및 이용 목적</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>수집된 개인정보는 다음의 목적으로만 이용됩니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>회원가입 및 본인 확인</li>
                  <li>서비스 제공 및 운영</li>
                  <li>고객 문의 응대 및 민원 처리</li>
                  <li>서비스 개선 및 신규 서비스 개발</li>
                  <li>서비스 이용 관련 공지사항 전달</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">3. 개인정보의 보유 및 이용 기간</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  회원의 개인정보는 서비스 이용계약 기간 동안 보유 및 이용되며, 회원 탈퇴 시
                  즉시 파기됩니다. 단, 관련 법령에 따라 일정 기간 보관이 필요한 경우 해당
                  기간 동안 보관합니다.
                </p>
                <div className="bg-white/5 rounded-xl p-4 space-y-2">
                  <p className="text-white font-medium">법령에 따른 보관 기간:</p>
                  <ul className="text-sm space-y-1">
                    <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
                    <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
                    <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
                    <li>서비스 이용 기록, 접속 로그: 3개월</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">4. 개인정보의 제3자 제공</h2>
              <p className="text-slate-400 leading-relaxed">
                회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의
                경우에는 예외로 합니다:
              </p>
              <ul className="list-disc list-inside ml-4 text-slate-400 space-y-2 mt-3">
                <li>이용자가 사전에 동의한 경우</li>
                <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라
                    수사기관의 요청이 있는 경우</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">5. 개인정보의 안전성 확보 조치</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>비밀번호 암호화 저장</li>
                  <li>SSL/TLS를 통한 데이터 전송 암호화</li>
                  <li>개인정보 접근 권한 제한</li>
                  <li>정기적인 보안 점검 및 취약점 개선</li>
                </ul>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">6. 이용자의 권리</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>개인정보 열람 요청</li>
                  <li>개인정보 정정 요청</li>
                  <li>개인정보 삭제 요청</li>
                  <li>개인정보 처리 정지 요청</li>
                </ul>
                <p className="mt-3">
                  위 권리 행사는 서비스 내 설정 메뉴를 통해 직접 수행하거나, 고객센터를 통해
                  요청하실 수 있습니다.
                </p>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">7. 쿠키의 사용</h2>
              <p className="text-slate-400 leading-relaxed">
                회사는 서비스 제공을 위해 쿠키를 사용합니다. 쿠키는 로그인 상태 유지, 서비스
                이용 환경 개선 등의 목적으로 사용되며, 브라우저 설정을 통해 쿠키 저장을 거부할
                수 있습니다. 다만, 쿠키 저장을 거부할 경우 일부 서비스 이용에 제한이 있을 수
                있습니다.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">8. 개인정보 보호책임자</h2>
              <div className="bg-white/5 rounded-xl p-4 text-slate-400">
                <p className="mb-2">개인정보 보호에 관한 문의사항은 아래로 연락해 주시기 바랍니다:</p>
                <p>담당자: 개인정보 보호책임자</p>
                <p>이메일: privacy@bridgespots.com</p>
              </div>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">9. 개인정보처리방침 변경</h2>
              <p className="text-slate-400 leading-relaxed">
                본 개인정보처리방침은 법령 또는 서비스 정책 변경에 따라 수정될 수 있으며,
                변경 시 서비스 내 공지사항 또는 이메일을 통해 사전에 안내해 드립니다.
              </p>
            </section>

            {/* Placeholder Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-8">
              <p className="text-yellow-400 text-sm">
                본 개인정보처리방침은 법률 검토 전 임시 내용입니다. 정식 서비스 오픈 전
                전문 법률 자문을 통해 완성될 예정입니다.
              </p>
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-8 flex items-center justify-center gap-6 text-sm">
            <Link
              to="/terms"
              className="text-slate-400 hover:text-white transition-colors"
            >
              이용약관
            </Link>
            <span className="text-slate-600">|</span>
            <Link
              to="/login"
              className="text-bridge-accent hover:text-bridge-secondary transition-colors"
            >
              서비스 시작하기
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
