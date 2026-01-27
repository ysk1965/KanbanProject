import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';

export function TermsPage() {
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
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">이용약관</h1>
              <p className="text-slate-400 text-sm mt-1">최종 수정일: 2026년 1월 1일</p>
            </div>
          </div>

          {/* Content Box */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-8 space-y-8">
            {/* Section 1 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 1 조 (목적)</h2>
              <p className="text-slate-400 leading-relaxed">
                본 약관은 BRIDGE SPOTS(이하 "서비스")가 제공하는 프로젝트 관리 및 협업 서비스의
                이용 조건 및 절차, 회사와 회원 간의 권리, 의무 및 책임 사항 등 기본적인 사항을
                규정함을 목적으로 합니다.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 2 조 (정의)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  1. "서비스"란 회사가 제공하는 모든 프로젝트 관리, 협업, 일정 관리 관련 서비스를
                  의미합니다.
                </p>
                <p>
                  2. "회원"이란 본 약관에 동의하고 회사와 서비스 이용계약을 체결한 개인 또는
                  법인을 말합니다.
                </p>
                <p>
                  3. "보드"란 회원이 생성하는 프로젝트 단위의 작업 공간을 의미합니다.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 3 조 (약관의 효력 및 변경)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  1. 본 약관은 서비스를 이용하고자 하는 모든 회원에게 적용됩니다.
                </p>
                <p>
                  2. 회사는 필요한 경우 관련 법령을 위반하지 않는 범위 내에서 본 약관을 개정할
                  수 있습니다.
                </p>
                <p>
                  3. 약관이 변경되는 경우, 회사는 변경 내용을 서비스 내 공지사항 또는 이메일을
                  통해 사전에 고지합니다.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 4 조 (회원가입 및 계정)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  1. 회원가입은 이용자가 본 약관에 동의하고, 회사가 정한 가입 양식에 따라
                  정보를 기입한 후 회사가 이를 승인함으로써 완료됩니다.
                </p>
                <p>
                  2. 회원은 가입 시 정확한 정보를 제공해야 하며, 허위 정보 기재 시 서비스
                  이용이 제한될 수 있습니다.
                </p>
                <p>
                  3. 회원은 계정 정보의 보안을 유지할 책임이 있으며, 타인에게 계정을 양도하거나
                  대여할 수 없습니다.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 5 조 (서비스의 제공)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  1. 회사는 연중무휴 24시간 서비스를 제공하는 것을 원칙으로 합니다.
                </p>
                <p>
                  2. 회사는 시스템 점검, 업데이트 등의 사유로 서비스 제공을 일시적으로 중단할
                  수 있으며, 이 경우 사전에 공지합니다.
                </p>
                <p>
                  3. 회사는 무료 체험 기간 및 유료 플랜을 제공하며, 각 플랜의 기능과 가격은
                  서비스 내에서 확인할 수 있습니다.
                </p>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 6 조 (회원의 의무)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>1. 회원은 다음 행위를 하여서는 안 됩니다:</p>
                <ul className="list-disc list-inside ml-4 space-y-2">
                  <li>타인의 개인정보 침해 또는 도용</li>
                  <li>서비스의 안정적 운영을 방해하는 행위</li>
                  <li>불법적인 목적으로 서비스를 이용하는 행위</li>
                  <li>기타 관련 법령에 위반되는 행위</li>
                </ul>
              </div>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 7 조 (지적재산권)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  1. 서비스에 포함된 모든 콘텐츠, 디자인, 기술은 회사의 지적재산권에 의해
                  보호됩니다.
                </p>
                <p>
                  2. 회원이 서비스 내에서 생성한 콘텐츠에 대한 권리는 회원에게 귀속됩니다.
                </p>
              </div>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">제 8 조 (면책조항)</h2>
              <div className="text-slate-400 leading-relaxed space-y-3">
                <p>
                  1. 회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력으로 인한
                  서비스 중단에 대해 책임을 지지 않습니다.
                </p>
                <p>
                  2. 회사는 회원의 귀책사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.
                </p>
              </div>
            </section>

            {/* Placeholder Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-8">
              <p className="text-yellow-400 text-sm">
                본 이용약관은 법률 검토 전 임시 내용입니다. 정식 서비스 오픈 전
                전문 법률 자문을 통해 완성될 예정입니다.
              </p>
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-8 flex items-center justify-center gap-6 text-sm">
            <Link
              to="/privacy"
              className="text-slate-400 hover:text-white transition-colors"
            >
              개인정보처리방침
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
