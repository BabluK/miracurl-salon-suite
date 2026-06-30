package com.miracurl.entity;

import lombok.Data;
import javax.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity @Table(name = "appointments")
@Data
public class Appointment {
    @Id @Column(length = 36) private String id;
    @Column(name = "customer_id", length = 36) private String customerId;
    @Column(name = "customer_name", length = 150) private String customerName;
    @Column(name = "staff_id", length = 36) private String staffId;
    @Column(name = "staff_name", length = 150) private String staffName;
    @Column(name = "service_ids", length = 2000) private String serviceIds;
    @Column(name = "service_names", length = 2000) private String serviceNames;
    @Column(name = "scheduled_at", nullable = false) private LocalDateTime scheduledAt;
    @Column(name = "duration_min") private Integer durationMin = 30;
    @Column(length = 20) private String status = "scheduled";
    @Column(length = 1000) private String notes;
    private BigDecimal total = BigDecimal.ZERO;
    @Column(name = "created_at") private LocalDateTime createdAt = LocalDateTime.now();
}
