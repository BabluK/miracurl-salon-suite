package com.miracurl.controller;

import com.miracurl.entity.User;
import com.miracurl.repo.UserRepository;
import com.miracurl.security.JwtUtil;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtUtil jwt;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtUtil jwt) {
        this.users = users; this.encoder = encoder; this.jwt = jwt;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String,String> body) {
        String email = body.get("email").toLowerCase();
        if (users.findByEmail(email).isPresent())
            return ResponseEntity.badRequest().body(Collections.singletonMap("detail", "Email already registered"));
        User u = new User();
        u.setId(UUID.randomUUID().toString());
        u.setEmail(email);
        u.setName(body.get("name"));
        u.setRole("staff");
        u.setPasswordHash(encoder.encode(body.get("password")));
        users.save(u);
        return ResponseEntity.ok(buildResponse(u));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String,String> body) {
        String email = body.get("email").toLowerCase();
        Optional<User> u = users.findByEmail(email);
        if (!u.isPresent() || !encoder.matches(body.get("password"), u.get().getPasswordHash()))
            return ResponseEntity.status(401).body(Collections.singletonMap("detail", "Invalid email or password"));
        return ResponseEntity.ok(buildResponse(u.get()));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout() {
        ResponseCookie a = ResponseCookie.from("access_token", "").maxAge(0).path("/").build();
        ResponseCookie r = ResponseCookie.from("refresh_token", "").maxAge(0).path("/").build();
        return ResponseEntity.ok().header("Set-Cookie", a.toString()).header("Set-Cookie", r.toString()).body(Collections.singletonMap("ok", true));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest req) {
        String token = extractToken(req);
        if (token == null) return ResponseEntity.status(401).body(Collections.singletonMap("detail","Not authenticated"));
        try {
            String uid = jwt.parse(token).getSubject();
            Optional<User> u = users.findById(uid);
            if (!u.isPresent()) return ResponseEntity.status(401).body(Collections.singletonMap("detail","User not found"));
            return ResponseEntity.ok(toMap(u.get()));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Collections.singletonMap("detail","Invalid token"));
        }
    }

    private String extractToken(HttpServletRequest req) {
        if (req.getCookies() != null) for (Cookie c : req.getCookies())
            if ("access_token".equals(c.getName())) return c.getValue();
        String h = req.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) return h.substring(7);
        return null;
    }

    private Map<String,Object> buildResponse(User u) {
        String access = jwt.createAccessToken(u.getId(), u.getEmail());
        Map<String,Object> map = new LinkedHashMap<>();
        map.put("user", toMap(u));
        map.put("access_token", access);
        return map;
    }

    private Map<String,Object> toMap(User u) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("id", u.getId()); m.put("email", u.getEmail());
        m.put("name", u.getName()); m.put("role", u.getRole());
        return m;
    }
}
