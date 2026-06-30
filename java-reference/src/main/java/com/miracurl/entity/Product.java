package com.miracurl.entity;

import lombok.Data;
import javax.persistence.*;
import java.math.BigDecimal;

@Entity @Table(name = "products")
@Data
public class Product {
    @Id @Column(length = 36) private String id;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 100) private String brand;
    @Column(nullable = false, length = 80) private String category;
    @Column(nullable = false, unique = true, length = 80) private String sku;
    @Column(nullable = false) private BigDecimal price;
    @Column(nullable = false) private BigDecimal cost;
    @Column(nullable = false) private Integer stock;
    @Column(name = "low_stock_threshold") private Integer lowStockThreshold = 5;
    @Column(name = "image_url", length = 500) private String imageUrl;
}
