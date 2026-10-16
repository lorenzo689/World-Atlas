package dev.worldexplorer.auth;

import dev.worldexplorer.auth.AuthDtos.AuthResponse;
import dev.worldexplorer.auth.AuthDtos.GuestRequest;
import dev.worldexplorer.auth.AuthDtos.LoginRequest;
import dev.worldexplorer.auth.AuthDtos.RefreshRequest;
import dev.worldexplorer.auth.AuthDtos.RegisterRequest;
import dev.worldexplorer.auth.AuthDtos.UserDto;
import dev.worldexplorer.common.security.AuthUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Auth", description = "Accounts, guest login and token refresh")
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    AuthResponse register(@Valid @RequestBody RegisterRequest body) {
        return auth.register(body);
    }

    @PostMapping("/login")
    AuthResponse login(@Valid @RequestBody LoginRequest body) {
        return auth.login(body.email(), body.password());
    }

    @PostMapping("/guest")
    @ResponseStatus(HttpStatus.CREATED)
    AuthResponse guest(@Valid @RequestBody GuestRequest body) {
        return auth.guest(body.displayName());
    }

    @PostMapping("/refresh")
    AuthResponse refresh(@Valid @RequestBody RefreshRequest body) {
        return auth.refresh(body.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(@Valid @RequestBody RefreshRequest body) {
        auth.logout(body.refreshToken());
    }

    @GetMapping("/me")
    UserDto me(AuthUser user) {
        return auth.me(user.id());
    }
}
