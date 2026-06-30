package com.miracurl.entity;

import lombok.Data;
import javax.persistence.*;
import java.math.BigDecimal;

@Entity @Table(name = "invoice_items")
@Data
public class InvoiceItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "item_type", length = 20) private String type;
    @Column(name = "ref_id", length = 36) private String refId;
    @Column(length = 200) private String name;
    private Integer qty = 1;
    private BigDecimal price = BigDecimal.ZERO;
}
