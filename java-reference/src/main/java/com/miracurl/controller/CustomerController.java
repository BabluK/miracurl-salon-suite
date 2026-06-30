package com.miracurl.controller;

import com.miracurl.entity.Customer;
import com.miracurl.repo.CustomerRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {
    private final CustomerRepository repo;
    public CustomerController(CustomerRepository repo) { this.repo = repo; }

    @GetMapping public List<Customer> list(@RequestParam(required = false) String q) {
        return q == null ? repo.findAll() : repo.findByNameContainingIgnoreCaseOrPhoneContaining(q, q);
    }
    @PostMapping public Customer create(@RequestBody Customer c) {
        c.setId(UUID.randomUUID().toString());
        return repo.save(c);
    }
    @GetMapping("/{id}") public Customer get(@PathVariable String id) {
        return repo.findById(id).orElseThrow();
    }
    @PutMapping("/{id}") public Customer update(@PathVariable String id, @RequestBody Customer c) {
        c.setId(id);
        return repo.save(c);
    }
    @DeleteMapping("/{id}") public void delete(@PathVariable String id) { repo.deleteById(id); }
}
