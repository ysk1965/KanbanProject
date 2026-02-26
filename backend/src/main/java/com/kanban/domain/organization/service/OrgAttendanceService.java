package com.kanban.domain.organization.service;

import com.kanban.domain.organization.*;
import com.kanban.domain.organization.dto.AttendanceRequest;
import com.kanban.domain.organization.dto.AttendanceResponse;
import com.kanban.domain.organization.repository.*;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgAttendanceService {

    private final OrgAttendanceRecordRepository recordRepository;
    private final OrgAttendancePolicyRepository policyRepository;
    private final OrgCustomHolidayRepository holidayRepository;
    private final OrgMemberRepository memberRepository;
    private final UserRepository userRepository;

    // ─── Clock In / Out ───

    @Transactional
    public AttendanceResponse.RecordDetail clockIn(String orgId, String userId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        ZoneId memberZone = ZoneId.of(me.getTimezone() != null ? me.getTimezone() : "Asia/Seoul");
        LocalDate today = nowUtc.atOffset(ZoneOffset.UTC).atZoneSameInstant(memberZone).toLocalDate();

        // Check existing record with pessimistic lock
        Optional<OrgAttendanceRecord> existing = recordRepository.findByMemberAndDateForUpdate(orgId, me.getId(), today);
        if (existing.isPresent()) {
            OrgAttendanceRecord record = existing.get();
            if (record.getClockIn() != null) {
                throw new BusinessException(ErrorCode.ALREADY_CLOCKED_IN);
            }
        }

        // Check late
        boolean isLate = false;
        OrgAttendancePolicy policy = policyRepository.findByOrganizationId(orgId).orElse(null);
        if (policy != null && policy.getLateThreshold() != null) {
            LocalTime localTime = nowUtc.atOffset(ZoneOffset.UTC).atZoneSameInstant(memberZone).toLocalTime();
            isLate = localTime.isAfter(policy.getLateThreshold());
        }

        OrgAttendanceRecord record;
        if (existing.isPresent()) {
            record = existing.get();
            record.recordClockIn(nowUtc, isLate);
            record.updateStatus(AttendanceStatus.PRESENT);
        } else {
            record = OrgAttendanceRecord.builder()
                    .organization(me.getOrganization())
                    .member(me)
                    .recordDate(today)
                    .clockIn(nowUtc)
                    .status(AttendanceStatus.PRESENT)
                    .late(isLate)
                    .build();
            recordRepository.save(record);
        }

        return AttendanceResponse.RecordDetail.from(record);
    }

    @Transactional
    public AttendanceResponse.RecordDetail clockOut(String orgId, String userId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        ZoneId memberZone = ZoneId.of(me.getTimezone() != null ? me.getTimezone() : "Asia/Seoul");
        LocalDate today = nowUtc.atOffset(ZoneOffset.UTC).atZoneSameInstant(memberZone).toLocalDate();

        OrgAttendanceRecord record = recordRepository.findByMemberAndDateForUpdate(orgId, me.getId(), today)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_CLOCKED_IN));

        if (record.getClockIn() == null) {
            throw new BusinessException(ErrorCode.NOT_CLOCKED_IN);
        }
        if (record.getClockOut() != null) {
            throw new BusinessException(ErrorCode.ALREADY_CLOCKED_OUT);
        }

        record.clockOut(nowUtc);
        return AttendanceResponse.RecordDetail.from(record);
    }

    @Transactional
    public AttendanceResponse.RecordDetail cancelClockOut(String orgId, String userId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        ZoneId memberZone = ZoneId.of(me.getTimezone() != null ? me.getTimezone() : "Asia/Seoul");
        LocalDate today = nowUtc.atOffset(ZoneOffset.UTC).atZoneSameInstant(memberZone).toLocalDate();

        OrgAttendanceRecord record = recordRepository.findByMemberAndDateForUpdate(orgId, me.getId(), today)
                .orElseThrow(() -> new BusinessException(ErrorCode.ATTENDANCE_RECORD_NOT_FOUND));

        if (record.getClockOut() == null) {
            throw new BusinessException(ErrorCode.NOT_CLOCKED_OUT);
        }

        record.cancelClockOut();
        return AttendanceResponse.RecordDetail.from(record);
    }

    // ─── My Records ───

    public AttendanceResponse.MyRecordsResponse getMyRecords(String orgId, String userId, int year, int month) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        LocalDate startDate = LocalDate.of(year, month, 1);
        LocalDate endDate = startDate.plusMonths(1).minusDays(1);

        List<OrgAttendanceRecord> records = recordRepository.findByMemberAndDateRange(orgId, me.getId(), startDate, endDate);

        OrgAttendancePolicy policy = policyRepository.findByOrganizationId(orgId).orElse(null);
        int standardMinutes = policy != null ? policy.getStandardHours().multiply(new BigDecimal("60")).intValue() : 480;

        // Build summary
        int presentDays = 0, leaveDays = 0, absentDays = 0, lateCount = 0, totalWorkMinutes = 0;
        for (OrgAttendanceRecord r : records) {
            switch (r.getStatus()) {
                case PRESENT -> { presentDays++; if (r.isLate()) lateCount++; }
                case ON_LEAVE, HALF_DAY -> leaveDays++;
                case ABSENT -> absentDays++;
                default -> {}
            }
            if (r.getWorkMinutes() != null) totalWorkMinutes += r.getWorkMinutes();
        }

        int workDays = presentDays > 0 ? presentDays : 1;
        int avgMinutes = totalWorkMinutes / workDays;
        int overtime = Math.max(0, totalWorkMinutes - (presentDays * standardMinutes));

        AttendanceResponse.MonthlySummary summary = AttendanceResponse.MonthlySummary.builder()
                .totalWorkDays(presentDays + leaveDays + absentDays)
                .presentDays(presentDays)
                .leaveDays(leaveDays)
                .absentDays(absentDays)
                .lateCount(lateCount)
                .totalWorkMinutes(totalWorkMinutes)
                .avgWorkMinutesPerDay(avgMinutes)
                .overtimeMinutes(overtime)
                .build();

        List<AttendanceResponse.RecordDetail> recordDetails = records.stream()
                .map(AttendanceResponse.RecordDetail::from)
                .toList();

        return AttendanceResponse.MyRecordsResponse.builder()
                .summary(summary)
                .records(recordDetails)
                .build();
    }

    // ─── Today Status ───

    public AttendanceResponse.TodayStatus getTodayStatus(String orgId, String userId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        ZoneId memberZone = ZoneId.of(me.getTimezone() != null ? me.getTimezone() : "Asia/Seoul");
        LocalDate myToday = nowUtc.atOffset(ZoneOffset.UTC).atZoneSameInstant(memberZone).toLocalDate();

        // Use ±1 day range to cover all timezone differences across team members
        // then deduplicate by member (keep latest record per member)
        List<OrgAttendanceRecord> rangeRecords = recordRepository.findByOrgAndDateRange(
                orgId, myToday.minusDays(1), myToday.plusDays(1));
        int totalActive = memberRepository.countActiveMembersByOrgId(orgId);

        // Keep only the latest record per member (by recordDate descending)
        Map<String, OrgAttendanceRecord> latestByMember = new LinkedHashMap<>();
        for (OrgAttendanceRecord r : rangeRecords) {
            latestByMember.merge(r.getMember().getId(), r, (a, b) ->
                    a.getRecordDate().isAfter(b.getRecordDate()) ? a : b);
        }

        int present = 0, onLeave = 0;
        for (OrgAttendanceRecord r : latestByMember.values()) {
            if (r.getStatus() == AttendanceStatus.PRESENT || r.getStatus() == AttendanceStatus.HALF_DAY) present++;
            if (r.getStatus() == AttendanceStatus.ON_LEAVE) onLeave++;
        }

        // My record (uses my timezone - this is correct per user)
        AttendanceResponse.MyTodayRecord myRecord = null;
        OrgAttendanceRecord myRec = recordRepository.findByMemberAndDate(orgId, me.getId(), myToday).orElse(null);
        if (myRec != null) {
            Integer elapsed = null;
            if (myRec.getClockIn() != null && myRec.getClockOut() == null) {
                elapsed = (int) ChronoUnit.MINUTES.between(myRec.getClockIn(), nowUtc);
            }
            myRecord = AttendanceResponse.MyTodayRecord.builder()
                    .clockIn(myRec.getClockIn())
                    .clockOut(myRec.getClockOut())
                    .status(myRec.getStatus().name())
                    .elapsedMinutes(elapsed)
                    .workMinutes(myRec.getWorkMinutes())
                    .build();
        }

        return AttendanceResponse.TodayStatus.builder()
                .presentCount(present)
                .absentCount(totalActive - present - onLeave)
                .onLeaveCount(onLeave)
                .totalActiveMembers(totalActive)
                .myRecord(myRecord)
                .build();
    }

    // ─── Team Summary (Admin) ───

    public AttendanceResponse.TeamSummaryResponse getTeamSummary(String orgId, String userId,
                                                                   int year, int month, String departmentId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        LocalDate startDate = LocalDate.of(year, month, 1);
        LocalDate endDate = startDate.plusMonths(1).minusDays(1);

        List<OrgAttendanceRecord> allRecords = recordRepository.findByOrgAndDateRange(orgId, startDate, endDate);

        OrgAttendancePolicy policy = policyRepository.findByOrganizationId(orgId).orElse(null);
        int standardMinutes = policy != null ? policy.getStandardHours().multiply(new BigDecimal("60")).intValue() : 480;

        // Group by member
        Map<String, List<OrgAttendanceRecord>> byMember = allRecords.stream()
                .collect(Collectors.groupingBy(r -> r.getMember().getId()));

        List<AttendanceResponse.TeamMemberSummary> members = new ArrayList<>();
        for (Map.Entry<String, List<OrgAttendanceRecord>> entry : byMember.entrySet()) {
            List<OrgAttendanceRecord> memberRecords = entry.getValue();
            OrgAttendanceRecord first = memberRecords.get(0);
            OrganizationMember member = first.getMember();

            // Filter by department if specified
            if (departmentId != null && !departmentId.isBlank()) {
                if (member.getDepartment() == null || !member.getDepartment().getId().equals(departmentId)) {
                    continue;
                }
            }

            int presentDays = 0, leaveDays = 0, absentDays = 0, lateCount = 0, totalMinutes = 0;
            for (OrgAttendanceRecord r : memberRecords) {
                switch (r.getStatus()) {
                    case PRESENT -> { presentDays++; if (r.isLate()) lateCount++; }
                    case ON_LEAVE, HALF_DAY -> leaveDays++;
                    case ABSENT -> absentDays++;
                    default -> {}
                }
                if (r.getWorkMinutes() != null) totalMinutes += r.getWorkMinutes();
            }

            int workDays = presentDays > 0 ? presentDays : 1;
            members.add(AttendanceResponse.TeamMemberSummary.builder()
                    .memberId(member.getId())
                    .memberName(member.getUser().getName())
                    .departmentName(member.getDepartment() != null ? member.getDepartment().getName() : null)
                    .totalWorkMinutes(totalMinutes)
                    .avgWorkMinutesPerDay(totalMinutes / workDays)
                    .lateCount(lateCount)
                    .overtimeMinutes(Math.max(0, totalMinutes - (presentDays * standardMinutes)))
                    .presentDays(presentDays)
                    .leaveDays(leaveDays)
                    .absentDays(absentDays)
                    .build());
        }

        return AttendanceResponse.TeamSummaryResponse.builder().members(members).build();
    }

    // ─── Admin Modify ───

    @Transactional
    public AttendanceResponse.RecordDetail adminModify(String orgId, String userId,
                                                        String recordId, AttendanceRequest.AdminModify request) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        OrgAttendanceRecord record = recordRepository.findById(recordId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ATTENDANCE_RECORD_NOT_FOUND));

        // Verify the record belongs to this organization
        if (!record.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.ATTENDANCE_RECORD_NOT_FOUND);
        }

        User admin = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        LocalDateTime clockIn = request.getClockIn() != null ? LocalDateTime.parse(request.getClockIn()) : record.getClockIn();
        LocalDateTime clockOut = request.getClockOut() != null ? LocalDateTime.parse(request.getClockOut()) : record.getClockOut();

        record.adminModify(clockIn, clockOut, request.getNote(), admin);
        return AttendanceResponse.RecordDetail.from(record);
    }

    // ─── Policy ───

    public AttendanceResponse.PolicyResponse getPolicy(String orgId, String userId) {
        memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        OrgAttendancePolicy policy = policyRepository.findByOrganizationId(orgId)
                .orElse(null);
        if (policy == null) {
            // Return defaults
            return AttendanceResponse.PolicyResponse.builder()
                    .standardHours(new BigDecimal("8.00"))
                    .autoClockOut(true)
                    .autoClockOutTime(LocalTime.of(23, 59))
                    .weekendDays("6,7")
                    .build();
        }
        return AttendanceResponse.PolicyResponse.from(policy);
    }

    @Transactional
    public AttendanceResponse.PolicyResponse updatePolicy(String orgId, String userId,
                                                           AttendanceRequest.UpdatePolicy request) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        OrgAttendancePolicy policy = policyRepository.findByOrganizationId(orgId)
                .orElseGet(() -> {
                    OrgAttendancePolicy newPolicy = OrgAttendancePolicy.builder()
                            .organization(me.getOrganization())
                            .build();
                    return policyRepository.save(newPolicy);
                });

        LocalTime coreStart = request.getCoreTimeStart() != null ? LocalTime.parse(request.getCoreTimeStart()) : policy.getCoreTimeStart();
        LocalTime coreEnd = request.getCoreTimeEnd() != null ? LocalTime.parse(request.getCoreTimeEnd()) : policy.getCoreTimeEnd();
        LocalTime lateThreshold = request.getLateThreshold() != null ? LocalTime.parse(request.getLateThreshold()) : policy.getLateThreshold();
        LocalTime autoClockOutTime = request.getAutoClockOutTime() != null ? LocalTime.parse(request.getAutoClockOutTime()) : policy.getAutoClockOutTime();
        boolean autoClockOut = request.getAutoClockOut() != null ? request.getAutoClockOut() : policy.isAutoClockOut();

        policy.update(request.getStandardHours(), coreStart, coreEnd, lateThreshold,
                      autoClockOut, autoClockOutTime, request.getWeekendDays());

        return AttendanceResponse.PolicyResponse.from(policy);
    }

    // ─── Custom Holidays ───

    public List<AttendanceResponse.HolidayResponse> getHolidays(String orgId, String userId) {
        memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));

        return holidayRepository.findByOrgId(orgId).stream()
                .map(AttendanceResponse.HolidayResponse::from)
                .toList();
    }

    @Transactional
    public AttendanceResponse.HolidayResponse createHoliday(String orgId, String userId,
                                                              AttendanceRequest.CreateHoliday request) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        LocalDate date = LocalDate.parse(request.getHolidayDate());
        if (holidayRepository.existsByOrganizationIdAndHolidayDate(orgId, date)) {
            throw new BusinessException(ErrorCode.HOLIDAY_ALREADY_EXISTS);
        }

        OrgCustomHoliday holiday = OrgCustomHoliday.builder()
                .organization(me.getOrganization())
                .holidayDate(date)
                .name(request.getName())
                .recurring(request.isRecurring())
                .build();

        holidayRepository.save(holiday);
        return AttendanceResponse.HolidayResponse.from(holiday);
    }

    @Transactional
    public void deleteHoliday(String orgId, String userId, String holidayId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        OrgCustomHoliday holiday = holidayRepository.findById(holidayId)
                .orElseThrow(() -> new BusinessException(ErrorCode.HOLIDAY_NOT_FOUND));

        // Verify the holiday belongs to this organization
        if (!holiday.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.HOLIDAY_NOT_FOUND);
        }

        holidayRepository.delete(holiday);
    }

    // ─── CSV Export ───

    public String exportCsv(String orgId, String userId, int year, int month, String departmentId) {
        OrganizationMember me = memberRepository.findByOrganizationIdAndUserId(orgId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_MEMBER_NOT_FOUND));
        if (!me.isAdminOrAbove()) {
            throw new BusinessException(ErrorCode.ORG_ADMIN_REQUIRED);
        }

        LocalDate startDate = LocalDate.of(year, month, 1);
        LocalDate endDate = startDate.plusMonths(1).minusDays(1);

        List<OrgAttendanceRecord> records = recordRepository.findByOrgAndDateRange(orgId, startDate, endDate);

        StringBuilder csv = new StringBuilder();
        csv.append('\uFEFF'); // UTF-8 BOM for Excel compatibility
        csv.append("Name,Department,Date,Clock In,Clock Out,Work Minutes,Status,Late,Note\n");

        for (OrgAttendanceRecord r : records) {
            OrganizationMember member = r.getMember();
            if (departmentId != null && !departmentId.isBlank()) {
                if (member.getDepartment() == null || !member.getDepartment().getId().equals(departmentId)) continue;
            }

            ZoneId zone = ZoneId.of(member.getTimezone() != null ? member.getTimezone() : "Asia/Seoul");
            String clockInLocal = r.getClockIn() != null ? r.getClockIn().atOffset(ZoneOffset.UTC).atZoneSameInstant(zone).toLocalTime().toString() : "";
            String clockOutLocal = r.getClockOut() != null ? r.getClockOut().atOffset(ZoneOffset.UTC).atZoneSameInstant(zone).toLocalTime().toString() : "";

            csv.append(escapeCsv(member.getUser().getName())).append(",")
               .append(escapeCsv(member.getDepartment() != null ? member.getDepartment().getName() : "")).append(",")
               .append(r.getRecordDate()).append(",")
               .append(clockInLocal).append(",")
               .append(clockOutLocal).append(",")
               .append(r.getWorkMinutes() != null ? r.getWorkMinutes() : "").append(",")
               .append(r.getStatus().name()).append(",")
               .append(r.isLate() ? "Y" : "N").append(",")
               .append(escapeCsv(r.getNote() != null ? r.getNote() : "")).append("\n");
        }

        return csv.toString();
    }

    private String escapeCsv(String value) {
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
