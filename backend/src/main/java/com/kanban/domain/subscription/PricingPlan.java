package com.kanban.domain.subscription;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "pricing_plans")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PricingPlan {

    @Id
    @Column(name = "id", length = 20)
    private String id;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "min_members", nullable = false)
    private Integer minMembers;

    @Column(name = "max_members", nullable = false)
    private Integer maxMembers;

    @Column(name = "monthly_price", nullable = false)
    private Integer monthlyPrice;

    @Column(name = "yearly_price", nullable = false)
    private Integer yearlyPrice;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    public boolean isFreePlan() {
        return this.monthlyPrice == 0;
    }

    public int getYearlyMonthlyPrice() {
        return this.yearlyPrice / 12;
    }

    public int getDiscountPercentage() {
        if (this.monthlyPrice == 0) return 0;
        int fullYearlyPrice = this.monthlyPrice * 12;
        return (int) (((fullYearlyPrice - this.yearlyPrice) * 100.0) / fullYearlyPrice);
    }
}
