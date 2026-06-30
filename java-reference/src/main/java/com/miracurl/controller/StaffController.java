package com.miracurl.controller;

import com.miracurl.entity.Staff;
import com.miracurl.repo.StaffRepository;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/staff")
public class StaffController {
    private final StaffRepository repo;
    public StaffController(StaffRepository repo) { this.repo = repo; }

    @GetMapping public List<Staff> list() { return repo.findAll(); }
    @PostMapping public Staff create(@RequestBody Staff s) {
        s.setId(UUID.randomUUID().toString()); return repo.save(s);
    }
    @PutMapping("/{id}") public Staff update(@PathVariable String id, @RequestBody Staff s) {
        s.setId(id); return repo.save(s);
    }
    @DeleteMapping("/{id}") public void delete(@PathVariable String id) { repo.deleteById(id); }
}
