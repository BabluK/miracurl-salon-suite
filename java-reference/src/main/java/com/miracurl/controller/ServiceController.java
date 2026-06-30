package com.miracurl.controller;

import com.miracurl.entity.ServiceEntity;
import com.miracurl.repo.ServiceRepository;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/services")
public class ServiceController {
    private final ServiceRepository repo;
    public ServiceController(ServiceRepository repo) { this.repo = repo; }

    @GetMapping public List<ServiceEntity> list() { return repo.findAll(); }
    @PostMapping public ServiceEntity create(@RequestBody ServiceEntity s) {
        s.setId(UUID.randomUUID().toString()); return repo.save(s);
    }
    @PutMapping("/{id}") public ServiceEntity update(@PathVariable String id, @RequestBody ServiceEntity s) {
        s.setId(id); return repo.save(s);
    }
    @DeleteMapping("/{id}") public void delete(@PathVariable String id) { repo.deleteById(id); }
}
