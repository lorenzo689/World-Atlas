package dev.worldexplorer.atlas;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FavoriteRepository extends JpaRepository<Favorite, UserCountryId> {

    List<Favorite> findByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserId(UUID userId);

    /** Most favourited countries: a JPQL aggregate mapped straight into a record (constructor expression). */
    @Query("""
            select new dev.worldexplorer.atlas.CountryCount(f.countryCode, count(f))
            from Favorite f group by f.countryCode order by count(f) desc
            """)
    List<CountryCount> mostFavorited(Pageable page);
}
