package com.miracurl.controller;

import com.miracurl.entity.*;
import com.miracurl.repo.*;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/invoices")
public class InvoiceController {
    private final InvoiceRepository invRepo;
    private final CustomerRepository custRepo;
    private final StaffRepository staffRepo;
    private final ProductRepository prodRepo;

    public InvoiceController(InvoiceRepository i, CustomerRepository c, StaffRepository s, ProductRepository p) {
        this.invRepo = i; this.custRepo = c; this.staffRepo = s; this.prodRepo = p;
    }

    @GetMapping public List<Invoice> list() { return invRepo.findAll(); }

    @PostMapping public Invoice create(@RequestBody Map<String,Object> body) {
        Customer cust = custRepo.findById((String) body.get("customer_id")).orElseThrow();
        Staff st = body.get("staff_id") != null ? staffRepo.findById((String) body.get("staff_id")).orElse(null) : null;

        @SuppressWarnings("unchecked")
        List<Map<String,Object>> rawItems = (List<Map<String,Object>>) body.get("items");
        List<InvoiceItem> items = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (Map<String,Object> r : rawItems) {
            InvoiceItem it = new InvoiceItem();
            it.setType((String) r.get("type"));
            it.setRefId((String) r.get("ref_id"));
            it.setName((String) r.get("name"));
            it.setQty(((Number) r.get("qty")).intValue());
            it.setPrice(new BigDecimal(r.get("price").toString()));
            items.add(it);
            subtotal = subtotal.add(it.getPrice().multiply(BigDecimal.valueOf(it.getQty())));
        }
        BigDecimal discount = body.get("discount") != null ? new BigDecimal(body.get("discount").toString()) : BigDecimal.ZERO;
        BigDecimal taxPct = body.get("tax_pct") != null ? new BigDecimal(body.get("tax_pct").toString()) : new BigDecimal("18");
        BigDecimal taxable = subtotal.subtract(discount).max(BigDecimal.ZERO);
        BigDecimal tax = taxable.multiply(taxPct).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
        BigDecimal total = taxable.add(tax);

        Invoice inv = new Invoice();
        inv.setId(UUID.randomUUID().toString());
        inv.setInvoiceNo(generateInvoiceNo());
        inv.setCustomerId(cust.getId()); inv.setCustomerName(cust.getName());
        if (st != null) { inv.setStaffId(st.getId()); inv.setStaffName(st.getName()); }
        inv.setItems(items);
        inv.setSubtotal(subtotal); inv.setDiscount(discount);
        inv.setTax(tax); inv.setTotal(total);
        inv.setPaymentMode((String) body.getOrDefault("payment_mode", "cash"));
        Invoice saved = invRepo.save(inv);

        // Decrement product stock & update customer
        for (InvoiceItem it : items) {
            if ("product".equals(it.getType())) {
                prodRepo.findById(it.getRefId()).ifPresent(p -> {
                    p.setStock(p.getStock() - it.getQty());
                    prodRepo.save(p);
                });
            }
        }
        cust.setTotalSpent(cust.getTotalSpent().add(total));
        cust.setVisits(cust.getVisits() + 1);
        cust.setLoyaltyPoints(cust.getLoyaltyPoints() + total.divide(new BigDecimal("100"), 0, RoundingMode.DOWN).intValue());
        custRepo.save(cust);

        return saved;
    }

    private String generateInvoiceNo() {
        long count = invRepo.count() + 1;
        return "INV-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMM")) + "-" + String.format("%04d", count);
    }
}
