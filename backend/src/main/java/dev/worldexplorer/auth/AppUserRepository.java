package dev.worldexplorer.auth;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    @Query("select u from AppUser u where lower(u.email) = lower(:email)")
    Optional<AppUser> findByEmail(String email);

    boolean existsByEmailIgnoreCase(String email);

    List<AppUser> findByIdIn(Collection<UUID> ids);

    long countByGuestFalse();
}
