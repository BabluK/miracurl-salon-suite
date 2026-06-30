package com.miracurl.entity;

import lombok.Data;
import javax.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity @Table(name = "staff")
@Data
public class Staff {
    @Id @Column(length = 36) private String id;
    @Column(nullable = false, length = 150) private String name;
    @Column(nullable = false, length = 80) private String role;
    @Column(nullable = false, length = 20) private String phone;
    @Column(length = 200) private String email;
    @Column(length = 500) private String specialties; // comma separated
    @Column(name = "commission_pct") private BigDecimal commissionPct = new BigDecimal("10.0");
    private Integer active = 1;
    @Column(name = "image_url", length = 500) private String imageUrl;
    @Column(name = "joining_date") private LocalDate joiningDate = LocalDate.now();
}
