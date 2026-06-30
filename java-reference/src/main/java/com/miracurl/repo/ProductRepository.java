package com.miracurl.repo;

import com.miracurl.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductRepository extends JpaRepository<Product, String> {
    List<Product> findByStockLessThanEqual(Integer threshold);
}
