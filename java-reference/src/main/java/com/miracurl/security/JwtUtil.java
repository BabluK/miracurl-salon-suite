package com.miracurl.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    @Value("${miracurl.jwt.secret}")
    private String secret;

    @Value("${miracurl.jwt.access-ttl-minutes}")
    private long accessTtlMinutes;

    @Value("${miracurl.jwt.refresh-ttl-days}")
    private long refreshTtlDays;

    private SecretKey key() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(String userId, String email) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
            .setSubject(userId)
            .claim("email", email)
            .claim("type", "access")
            .setIssuedAt(new Date(now))
            .setExpiration(new Date(now + accessTtlMinutes * 60_000))
            .signWith(key())
            .compact();
    }

    public String createRefreshToken(String userId) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
            .setSubject(userId)
            .claim("type", "refresh")
            .setIssuedAt(new Date(now))
            .setExpiration(new Date(now + refreshTtlDays * 86_400_000L))
            .signWith(key())
            .compact();
    }

    public Claims parse(String token) {
        return Jwts.parserBuilder().setSigningKey(key()).build().parseClaimsJws(token).getBody();
    }
}
