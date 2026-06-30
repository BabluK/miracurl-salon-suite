package com.miracurl.entity;

import lombok.Data;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity @Table(name = "users")
@Data
public class User {
    @Id @Column(length = 36)
    private String id;
    @Column(unique = true, nullable = false, length = 200)
    private String email;
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;
    @Column(nullable = false, length = 150)
    private String name;
    @Column(length = 30)
    private String role = "staff";
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
