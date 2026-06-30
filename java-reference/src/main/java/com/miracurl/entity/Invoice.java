package com.miracurl.entity;

import lombok.Data;
import javax.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity @Table(name = "invoices")
@Data
public class Invoice {
    @Id @Column(length = 36) private String id;
    @Column(name = "invoice_no", unique = true, length = 50) private String invoiceNo;
    @Column(name = "customer_id", length = 36) private String customerId;
    @Column(name = "customer_name", length = 150) private String customerName;
    @Column(name = "staff_id", length = 36) private String staffId;
    @Column(name = "staff_name", length = 150) private String staffName;
    private BigDecimal subtotal = BigDecimal.ZERO;
    private BigDecimal discount = BigDecimal.ZERO;
    private BigDecimal tax = BigDecimal.ZERO;
    private BigDecimal total = BigDecimal.ZERO;
    @Column(name = "payment_mode", length = 20) private String paymentMode = "cash";
    private Integer paid = 1;
    @Column(name = "created_at") private LocalDateTime createdAt = LocalDateTime.now();

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "invoice_id")
    private List<InvoiceItem> items = new ArrayList<>();
}
