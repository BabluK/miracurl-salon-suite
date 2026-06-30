package com.miracurl.controller;

import com.miracurl.entity.Product;
import com.miracurl.repo.ProductRepository;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ProductRepository repo;
    public ProductController(ProductRepository repo) { this.repo = repo; }

    @GetMapping public List<Product> list() { return repo.findAll(); }
    @PostMapping public Product create(@RequestBody Product p) {
        p.setId(UUID.randomUUID().toString()); return repo.save(p);
    }
    @PutMapping("/{id}") public Product update(@PathVariable String id, @RequestBody Product p) {
        p.setId(id); return repo.save(p);
    }
    @DeleteMapping("/{id}") public void delete(@PathVariable String id) { repo.deleteById(id); }
}
