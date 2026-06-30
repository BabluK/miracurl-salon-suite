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
@RequestMapping("/api/appointments")
public class AppointmentController {

    private final AppointmentRepository apptRepo;
    private final CustomerRepository custRepo;
    private final StaffRepository staffRepo;
    private final ServiceRepository svcRepo;

    public AppointmentController(AppointmentRepository a, CustomerRepository c, StaffRepository s, ServiceRepository sv) {
        this.apptRepo = a; this.custRepo = c; this.staffRepo = s; this.svcRepo = sv;
    }

    @GetMapping public List<Appointment> list(@RequestParam(required=false) String date) {
        if (date != null) {
            LocalDate d = LocalDate.parse(date);
            return apptRepo.findByScheduledAtBetweenOrderByScheduledAtAsc(d.atStartOfDay(), d.atTime(23,59,59));
        }
        return apptRepo.findAll();
    }

    @PostMapping public Appointment create(@RequestBody Map<String,Object> body) {
        Customer c = custRepo.findById((String) body.get("customer_id")).orElseThrow();
        Staff st = staffRepo.findById((String) body.get("staff_id")).orElseThrow();
        @SuppressWarnings("unchecked")
        List<String> serviceIds = (List<String>) body.get("service_ids");
        List<ServiceEntity> services = svcRepo.findAllById(serviceIds);
        BigDecimal total = services.stream().map(ServiceEntity::getPrice).reduce(BigDecimal.ZERO, BigDecimal::add);
        int duration = services.stream().mapToInt(ServiceEntity::getDurationMin).sum();

        Appointment a = new Appointment();
        a.setId(UUID.randomUUID().toString());
        a.setCustomerId(c.getId()); a.setCustomerName(c.getName());
        a.setStaffId(st.getId()); a.setStaffName(st.getName());
        a.setServiceIds(services.stream().map(ServiceEntity::getId).collect(Collectors.joining(",")));
        a.setServiceNames(services.stream().map(ServiceEntity::getName).collect(Collectors.joining(",")));
        a.setScheduledAt(LocalDateTime.parse((String) body.get("scheduled_at")));
        a.setDurationMin(duration == 0 ? 30 : duration);
        a.setNotes((String) body.getOrDefault("notes", null));
        a.setTotal(total);
        return apptRepo.save(a);
    }

    @PutMapping("/{id}/status") public Appointment status(@PathVariable String id, @RequestBody Map<String,String> body) {
        Appointment a = apptRepo.findById(id).orElseThrow();
        a.setStatus(body.get("status"));
        return apptRepo.save(a);
    }

    @DeleteMapping("/{id}") public void delete(@PathVariable String id) { apptRepo.deleteById(id); }
}
