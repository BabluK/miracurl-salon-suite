package com.miracurl.repo;

import com.miracurl.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CustomerRepository extends JpaRepository<Customer, String> {
    List<Customer> findByNameContainingIgnoreCaseOrPhoneContaining(String name, String phone);
}
