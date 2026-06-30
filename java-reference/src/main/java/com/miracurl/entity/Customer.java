package com.miracurl.entity;

import lombok.Data;

import javax.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.BigDecimal;

@Entity @Table(name = "customers")
@Data
public class Customer {
    @Id @Column(length = 36) private String id;
    @Column(nullable = false, length = 150) private String name;
    @Column(nullable = false, length = 20) private String phone;
    @Column(length = 200) private String email;
    @Column(length = 10) private String gender = "Other";
    private LocalDate dob;
    @Column(length = 500) private String address;
    @Column(name = "loyalty_points") private Integer loyaltyPoints = 0;
    @Column(name = "total_spent") private BigDecimal totalSpent = BigDecimal.ZERO;
    private Integer visits = 0;
    @Column(length = 1000) private String notes;
    @Column(name = "created_at") private LocalDateTime createdAt = LocalDateTime.now();
}
