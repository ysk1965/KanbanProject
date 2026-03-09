package com.kanban.domain.okr.service;

import com.kanban.domain.okr.OkrKeyResult;
import com.kanban.domain.okr.OkrObjective;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class OkrProgressCalculator {

    /**
     * KR 진척률 계산
     * BOOLEAN: currentValue > 0 → 100%, else 0%
     * MILESTONE: currentValue 직접 % 입력
     * 기타: (currentValue - startValue) / (targetValue - startValue) * 100
     */
    public int calculateKrProgress(OkrKeyResult kr) {
        if ("BOOLEAN".equals(kr.getMetricType())) {
            return kr.getCurrentValue() > 0 ? 100 : 0;
        }
        if ("MILESTONE".equals(kr.getMetricType())) {
            return (int) Math.min(100, Math.max(0, kr.getCurrentValue()));
        }
        double range = kr.getTargetValue() - kr.getStartValue();
        if (range <= 0) {
            return 0;
        }
        double progress = (kr.getCurrentValue() - kr.getStartValue()) / range * 100;
        return (int) Math.min(100, Math.max(0, progress));
    }

    /**
     * Objective 진척률 = KR 가중 평균
     */
    public int calculateObjectiveProgress(List<OkrKeyResult> keyResults) {
        if (keyResults.isEmpty()) {
            return 0;
        }
        double totalWeight = keyResults.stream().mapToDouble(OkrKeyResult::getWeight).sum();
        if (totalWeight <= 0) {
            return 0;
        }
        double weightedSum = keyResults.stream()
                .mapToDouble(kr -> calculateKrProgress(kr) * kr.getWeight())
                .sum();
        return (int) Math.round(weightedSum / totalWeight);
    }

    /**
     * 전체 진척률 = Company-level Objectives 평균
     */
    public int calculateOverallProgress(List<OkrObjective> companyObjectives) {
        if (companyObjectives.isEmpty()) {
            return 0;
        }
        return (int) Math.round(companyObjectives.stream()
                .mapToInt(OkrObjective::getProgress)
                .average().orElse(0));
    }
}
