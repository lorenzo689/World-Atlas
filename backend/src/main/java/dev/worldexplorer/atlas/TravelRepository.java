package dev.worldexplorer.atlas;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TravelRepository extends JpaRepository<TravelEntry, UserCountryId> {

    List<TravelEntry> findByUserIdOrderByUpdatedAtDesc(UUID userId);
}
