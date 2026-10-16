package dev.worldexplorer.atlas;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoteRepository extends JpaRepository<Note, UUID> {

    List<Note> findByUserIdOrderByUpdatedAtDesc(UUID userId);

    List<Note> findByUserIdAndCountryCodeOrderByUpdatedAtDesc(UUID userId, String countryCode);

    Optional<Note> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);
}
