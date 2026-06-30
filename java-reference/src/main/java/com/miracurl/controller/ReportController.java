package com.miracurl.controller;

import com.miracurl.entity.*;
import com.miracurl.repo.*;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final InvoiceRepository invRepo;
    private final AppointmentRepository apptRepo;
    private final CustomerRepository custRepo;
    private final StaffRepository staffRepo;
    private final ProductRepository prodRepo;

    public ReportController(InvoiceRepository i, AppointmentRepository a, CustomerRepository c, StaffRepository s, ProductRepository p) {
        this.invRepo = i; this.apptRepo = a; this.custRepo = c; this.staffRepo = s; this.prodRepo = p;
    }

    @GetMapping("/dashboard")
    public Map<String,Object> dashboard() {
        LocalDate today = LocalDate.now();
        LocalDateTime startToday = today.atStartOfDay();
        LocalDateTime endToday = today.atTime(23, 59, 59);

        List<Invoice> todayInvoices = invRepo.findByCreatedAtBetweenOrderByCreatedAtDesc(startToday, endToday);
        List<Appointment> todayAppts = apptRepo.findByScheduledAtBetweenOrderByScheduledAtAsc(startToday, endToday);
        List<Invoice> monthInvoices = invRepo.findByCreatedAtBetweenOrderByCreatedAtDesc(
            today.withDayOfMonth(1).atStartOfDay(),
            today.withDayOfMonth(today.lengthOfMonth()).atTime(23,59,59)
        );

        BigDecimal todayRev = todayInvoices.stream().map(Invoice::getTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal monthRev = monthInvoices.stream().map(Invoice::getTotal).reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String,Object> result = new LinkedHashMap<>();
        result.put("today_revenue", todayRev);
        result.put("today_bookings", todayAppts.size());
        result.put("today_invoices", todayInvoices.size());
        result.put("month_revenue", monthRev);
        result.put("total_customers", custRepo.count());
        result.put("active_staff", staffRepo.findAll().stream().filter(s -> s.getActive() == 1).count());

        List<Product> lowStock = prodRepo.findAll().stream()
            .filter(p -> p.getStock() <= p.getLowStockThreshold()).collect(Collectors.toList());
        result.put("low_stock_count", lowStock.size());
        result.put("low_stock_items", lowStock.stream().limit(10).collect(Collectors.toList()));
        result.put("upcoming_appointments", todayAppts.stream().limit(5).collect(Collectors.toList()));
        return result;
    }

    @GetMapping("/sales")
    public Map<String,Object> sales(@RequestParam(required=false) String start, @RequestParam(required=false) String end) {
        List<Invoice> invs;
        if (start != null && end != null) {
            invs = invRepo.findByCreatedAtBetweenOrderByCreatedAtDesc(
                LocalDate.parse(start).atStartOfDay(),
                LocalDate.parse(end).atTime(23,59,59));
        } else invs = invRepo.findAll();

        BigDecimal total = invs.stream().map(Invoice::getTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, BigDecimal> byMode = new HashMap<>();
        for (Invoice i : invs)
            byMode.merge(i.getPaymentMode(), i.getTotal(), BigDecimal::add);

        Map<String,Object> r = new LinkedHashMap<>();
        r.put("total_invoices", invs.size());
        r.put("total_revenue", total);
        r.put("by_payment_mode", byMode.entrySet().stream()
            .map(e -> { Map<String,Object> m = new LinkedHashMap<>(); m.put("mode", e.getKey()); m.put("amount", e.getValue()); return m; })
            .collect(Collectors.toList()));
        r.put("invoices", invs.stream().limit(200).collect(Collectors.toList()));
        return r;
    }
}
