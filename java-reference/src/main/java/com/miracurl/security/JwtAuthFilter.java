package com.miracurl.security;

import com.miracurl.entity.User;
import com.miracurl.repo.UserRepository;
import io.jsonwebtoken.Claims;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Optional;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwt;
    private final UserRepository userRepo;

    public JwtAuthFilter(JwtUtil jwt, UserRepository userRepo) {
        this.jwt = jwt; this.userRepo = userRepo;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws IOException, javax.servlet.ServletException {
        String token = null;
        if (req.getCookies() != null) {
            for (Cookie c : req.getCookies()) {
                if ("access_token".equals(c.getName())) { token = c.getValue(); break; }
            }
        }
        if (token == null) {
            String h = req.getHeader("Authorization");
            if (h != null && h.startsWith("Bearer ")) token = h.substring(7);
        }
        if (token != null) {
            try {
                Claims claims = jwt.parse(token);
                if ("access".equals(claims.get("type"))) {
                    Optional<User> u = userRepo.findById(claims.getSubject());
                    if (u.isPresent()) {
                        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                            u.get(), null,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + u.get().getRole().toUpperCase()))
                        );
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                }
            } catch (Exception ignore) { /* invalid token */ }
        }
        chain.doFilter(req, res);
    }
}
