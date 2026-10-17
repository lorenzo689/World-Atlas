package dev.worldexplorer.auth;

import dev.worldexplorer.auth.AuthDtos.AdminUserDto;
import dev.worldexplorer.auth.AuthDtos.RolesRequest;
import dev.worldexplorer.auth.mail.Mailer;
import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** User administration (ADMIN only) and the development mailbox. */
@Tag(name = "Admin: users")
@RestController
public class AdminUserController {

    private final AuthService auth;
    private final Mailer mailer;
    private final boolean devMailbox;

    public AdminUserController(AuthService auth, Mailer mailer, AppProperties props) {
        this.auth = auth;
        this.mailer = mailer;
        this.devMailbox = props.auth().devMailbox();
    }

    @GetMapping("/api/admin/users")
    List<AdminUserDto> users(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        return auth.listUsers(page, size);
    }

    @Operation(summary = "Replace a user's roles (USER, ADMIN, GUEST); ends the user's sessions")
    @PutMapping("/api/admin/users/{id}/roles")
    AdminUserDto roles(AuthUser admin, @PathVariable UUID id, @Valid @RequestBody RolesRequest body) {
        return auth.setRoles(admin.id(), id, body.roles());
    }

    @Operation(summary = "Local development only: the last e-mails the backend sent")
    @GetMapping("/api/dev/mails")
    List<Mailer.Mail> mails() {
        if (!devMailbox) throw ApiException.notFound("Endpoint", "/api/dev/mails");
        return mailer.recent();
    }
}
