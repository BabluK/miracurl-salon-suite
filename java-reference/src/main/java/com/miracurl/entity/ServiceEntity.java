package com.miracurl.entity;

import lombok.Data;
import javax.persistence.*;
import java.math.BigDecimal;

@Entity @Table(name = "services")
@Data
public class ServiceEntity {
    @Id @Column(length = 36) private String id;
    @Column(nullable = false, length = 150) private String name;
    @Column(nullable = false, length = 50) private String category;
    @Column(nullable = false) private BigDecimal price;
    @Column(name = "duration_min", nullable = false) private Integer durationMin;
    @Column(length = 1000) private String description;
    @Column(name = "image_url", length = 500) private String imageUrl;
    private Integer trending = 0;
    private Integer active = 1;
}
